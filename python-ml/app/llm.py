"""
app/llm.py
LLM answer generation via Groq (free, OpenAI-compatible API).
  - Streaming tokens via async generator
  - Context-grounded RAG prompt
  - Post-generation faithfulness guardrail
  - Latency tracking (TTFT + total)

Note: Groq does NOT support response_format={"type":"json_object"} on all models.
      faithfulness_check() uses prompt-level JSON enforcement instead.
"""

import time
from typing import AsyncGenerator

import structlog

from app.config import get_settings
from app.llm_client import get_llm_client
from app.retrieval import faithfulness_check

log = structlog.get_logger()
settings = get_settings()

LOW_CONFIDENCE_RESPONSE = (
    "I'm unable to find a confident answer to this question in the provided document. "
    "The retrieved passages don't contain sufficient information to answer reliably."
)


def _build_rag_prompt(question: str, chunks: list[dict]) -> str:
    context_parts = []
    for chunk in chunks:
        context_parts.append(
            f"[Page {chunk['page_num']}, Score: {chunk['score']:.3f}]\n{chunk['text']}"
        )
    context = "\n\n---\n\n".join(context_parts)
    return (
        "You are an expert document analyst helping someone deeply understand a document — "
        "think of yourself as a knowledgeable colleague who has read the whole thing and is "
        "walking them through it carefully, not a search engine spitting back a snippet.\n"
        "Answer the question using ONLY the provided document excerpts.\n"
        "If the answer cannot be found in the excerpts, say \"I cannot find this in the document.\"\n"
        "Always cite the page number when referencing specific information.\n\n"
        "How to think about the answer before you write it:\n"
        "- Read through ALL the excerpts below, not just the first one — synthesize across them. "
        "Different excerpts often cover different facets of the same question (definitions, "
        "numbers, causes, exceptions, implications); pull all of that together.\n"
        "- Don't just state the fact — explain it. Cover the relevant context, how it connects "
        "to other parts of the document, why it matters, and any nuance, exceptions, or caveats "
        "the excerpts mention.\n"
        "- If the excerpts contain supporting numbers, definitions, or examples, include them "
        "rather than summarizing them away.\n"
        "- Prefer a genuinely thorough answer over a short one. Brevity is not the goal — "
        "completeness and clarity are. Only stay short if the question is truly a simple "
        "one-line fact with nothing more in the excerpts to add.\n\n"
        "How to structure the answer:\n"
        "- Open with a direct 1-2 sentence answer to the actual question — don't bury the lede "
        "under throat-clearing or context-setting.\n"
        "- Then go deeper: the supporting evidence, how it fits with the rest of the document, "
        "important nuance or exceptions, and implications — whatever a careful reader would "
        "actually want to know next.\n"
        "- If the excerpts disagree with each other or leave something ambiguous, say so — "
        "point out the tension rather than silently picking one side.\n"
        "- Adapt depth to the question: a genuinely simple factual lookup can stay short; a "
        "conceptual, comparative, or \"explain/why/how\" question deserves the full treatment "
        "above. Use judgment rather than a fixed length.\n\n"
        "Formatting rules (output valid Markdown):\n"
        "- Use Markdown headings (\"### \") to break a multi-part answer into sections.\n"
        "- Use bullet (\"- \") or numbered (\"1. \") lists for distinct points, steps, or items — "
        "one point per line, not buried in a paragraph.\n"
        "- Use full paragraphs (not artificially truncated) for explanation and reasoning; add a "
        "blank line between paragraphs.\n"
        "- Use **bold** for key terms, figures, or names worth highlighting.\n"
        "- Avoid pure filler (\"as we can see\", restating the question) — but every sentence "
        "should add real information, not just look tidy.\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Write a thorough, well-structured, in-depth answer following the guidance above:"
    )


async def generate_answer_stream(
    question: str,
    chunks: list[dict],
    query_id: str,
) -> AsyncGenerator[dict, None]:
    """
    Stream answer tokens. Yields dicts:
      { "type": "token",            "content": str }
      { "type": "faithfulness_fail","score": float, "replacement": str }
      { "type": "done",             "faithfulness_score": float, "latency_ms": int, "full_answer": str }
      { "type": "error",            "message": str }
    """
    client = get_llm_client()
    t_start = time.time()

    if not chunks:
        yield {"type": "token", "content": LOW_CONFIDENCE_RESPONSE}
        yield {"type": "done", "faithfulness_score": 0.0,
               "latency_ms": int((time.time() - t_start) * 1000),
               "full_answer": LOW_CONFIDENCE_RESPONSE}
        return

    prompt = _build_rag_prompt(question, chunks)
    full_answer_parts: list[str] = []
    first_token_logged = False

    try:
        # Groq supports standard streaming — use create() with stream=True
        stream = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                full_answer_parts.append(token)
                if not first_token_logged:
                    ttft = int((time.time() - t_start) * 1000)
                    log.info("first_token", query_id=query_id, ttft_ms=ttft)
                    first_token_logged = True
                yield {"type": "token", "content": token}

        full_answer = "".join(full_answer_parts)
        latency_ms = int((time.time() - t_start) * 1000)

        # Post-generation faithfulness check
        score, explanation = await faithfulness_check(question, full_answer, chunks)

        if score < settings.faithfulness_threshold:
            log.warning("low_faithfulness", score=score, query_id=query_id)
            yield {
                "type": "faithfulness_fail",
                "score": score,
                "replacement": LOW_CONFIDENCE_RESPONSE,
            }
            full_answer = LOW_CONFIDENCE_RESPONSE

        yield {
            "type": "done",
            "faithfulness_score": score,
            "faithfulness_explanation": explanation,
            "latency_ms": latency_ms,
            "full_answer": full_answer,
        }

        log.info(
            "answer_generated",
            query_id=query_id,
            latency_ms=latency_ms,
            faithfulness=score,
            tokens=len(full_answer.split()),
        )

    except Exception as e:
        log.error("llm_generation_failed", query_id=query_id, error=str(e), exc_info=True)
        yield {"type": "error", "message": str(e)}


async def generate_answer(question: str, chunks: list[dict]) -> tuple[str, float, str]:
    """
    Non-streaming answer generation (used by evals / batch path).
    Returns (answer, faithfulness_score, explanation).
    """
    client = get_llm_client()

    if not chunks:
        return LOW_CONFIDENCE_RESPONSE, 0.0, "No chunks retrieved"

    prompt = _build_rag_prompt(question, chunks)
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
    )
    answer = response.choices[0].message.content.strip()
    score, explanation = await faithfulness_check(question, answer, chunks)

    if score < settings.faithfulness_threshold:
        return LOW_CONFIDENCE_RESPONSE, score, explanation

    return answer, score, explanation
