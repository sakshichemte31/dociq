"""
app/retrieval.py
RAG retrieval pipeline:
  1. Query rewriting  — generate N sub-queries via Groq LLM
  2. Embed all queries — sentence-transformers (local, free)
  3. Search FAISS      — for each embedding
  4. Merge + dedup     — by chunk_index, best score wins
  5. Return top-K with metadata

faithfulness_check() also lives here — it reuses the same Groq client.
Note: Groq doesn't support json_object response_format on all models,
      so we enforce JSON via prompt and parse manually with a fallback.
"""

import json
import re

import numpy as np
import structlog

from app.config import get_settings
from app.embedder import get_embedder
from app.faiss_store import get_faiss_store
from app.llm_client import get_llm_client

log = structlog.get_logger()
settings = get_settings()


async def rewrite_query(question: str, n: int | None = None) -> list[str]:
    """
    Use Groq LLM to generate N alternative sub-queries.
    Falls back to [question] on any error.
    """
    n = n or settings.num_rewrite_queries
    client = get_llm_client()

    prompt = (
        f"Generate {n} different search queries to find information relevant to the following question.\n"
        f"Each query should focus on a different aspect or phrasing.\n"
        f"Return ONLY the {n} queries, one per line, no numbering or explanation.\n\n"
        f"Original question: {question}"
    )

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=256,
        )
        raw = response.choices[0].message.content.strip()
        queries = [q.strip() for q in raw.split("\n") if q.strip()][:n]
        if not queries:
            queries = [question]
        log.debug("query_rewrite", original=question, rewrites=queries)
        return queries
    except Exception as e:
        log.warning("query_rewrite_failed", error=str(e))
        return [question]


def retrieve_chunks(
    doc_id: str,
    query_embeddings: list[np.ndarray],
    top_k: int | None = None,
) -> list[dict]:
    """
    Search FAISS with multiple embeddings, merge results.
    Deduplicates by chunk_index — keeps highest score per chunk.
    """
    top_k = top_k or settings.top_k_chunks
    faiss_store = get_faiss_store()
    seen: dict[int, dict] = {}

    for vec in query_embeddings:
        results = faiss_store.search(doc_id, vec, top_k=top_k * 2)
        for chunk in results:
            idx = chunk["chunk_index"]
            if idx not in seen or chunk["score"] > seen[idx]["score"]:
                seen[idx] = chunk

    merged = sorted(seen.values(), key=lambda c: c["score"], reverse=True)[:top_k]
    log.debug("retrieval_result", doc_id=doc_id, num_chunks=len(merged))
    return merged


async def retrieve(doc_id: str, question: str) -> tuple[list[dict], list[str]]:
    """
    Full pipeline: rewrite → embed → FAISS search → merge.
    Returns (top_chunks, rewritten_queries).
    """
    embedder = get_embedder()
    sub_queries = await rewrite_query(question)
    all_queries = [question] + sub_queries
    query_embeddings = embedder.embed_batch(all_queries)
    chunks = retrieve_chunks(doc_id, list(query_embeddings))
    return chunks, sub_queries


def _parse_json_from_text(text: str) -> dict:
    """Extract JSON object from text even if wrapped in markdown fences."""
    # Try raw parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown fences
    cleaned = re.sub(r"```(?:json)?|```", "", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Grab first {...} block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from: {text[:200]}")


async def faithfulness_check(
    question: str,
    answer: str,
    chunks: list[dict],
) -> tuple[float, str]:
    """
    Ask Groq to score how faithful the answer is to the retrieved context.
    Returns (score 0.0–1.0, explanation).

    Uses prompt-level JSON enforcement (not response_format parameter)
    because Groq's json_object mode isn't available on all free-tier models.
    """
    client = get_llm_client()

    context = "\n\n---\n\n".join(
        f"[Page {c['page_num']}] {c['text']}" for c in chunks
    )

    prompt = (
        "Evaluate if the following answer is faithful to the provided context passages.\n"
        "Score from 0.0 to 1.0:\n"
        "  1.0   = all claims directly supported by context\n"
        "  0.7–1 = most claims supported, minor inference\n"
        "  0.4–0.7 = some claims lack support\n"
        "  0.0–0.4 = answer contains unsupported or contradicted claims\n\n"
        f"Context passages:\n{context}\n\n"
        f"Answer to evaluate:\n{answer}\n\n"
        "YOU MUST respond with a JSON object and nothing else — no explanation outside the JSON.\n"
        'Format: {"score": <float 0.0-1.0>, "explanation": "<one sentence reason>"}'
    )

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200,
        )
        raw = response.choices[0].message.content.strip()
        parsed = _parse_json_from_text(raw)
        score = max(0.0, min(1.0, float(parsed.get("score", 0.5))))
        explanation = parsed.get("explanation", "")
        log.debug("faithfulness_score", score=score)
        return score, explanation
    except Exception as e:
        log.warning("faithfulness_check_failed", error=str(e))
        return 0.5, "Faithfulness check unavailable"
