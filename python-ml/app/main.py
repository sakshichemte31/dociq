"""
app/main.py
FastAPI ML Service — entry point.
"""
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.database import init_db_pool, close_db_pool
from app.embedder import get_embedder
from app.kafka_consumer import start_consumers
from app.logging_config import configure_logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

settings = get_settings()
configure_logging(debug=settings.debug)
log = structlog.get_logger()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup_begin", service="dociq-ml")
    init_db_pool()
    get_embedder()        # warm-up model in main thread
    start_consumers()     # Kafka threads
    log.info("startup_complete")
    yield
    close_db_pool()
    log.info("shutdown_complete")


app = FastAPI(
    title="DocIQ ML Service",
    description="Embedding, retrieval, LLM, and diff for the DocIQ platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    doc_id: str
    question: str
    query_id: str
    stream: bool = True

class DiffRequest(BaseModel):
    doc_id_1: str
    doc_id_2: str
    user_id: str = ""

class EmbedRequest(BaseModel):
    texts: list[str]

class IngestRequest(BaseModel):
    doc_id: str
    file_path: str
    user_id: str = ""


# ── Health ────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "dociq-ml", "timestamp": int(time.time() * 1000)}


# ── Internal: Synchronous ingestion ─────────────────────────────
# Called directly (and synchronously) by java-api right after upload,
# so the client gets a final READY/FAILED status in the same request —
# no separate async Parse/Embed round trip via Kafka needed.
# Defined as a plain `def` (not `async def`) so FastAPI runs the
# blocking PDF-parse/embed work in its threadpool instead of blocking
# the event loop that other requests (like /health) rely on.

@app.post("/internal/ingest")
def internal_ingest(request: IngestRequest):
    from app.ingestion import run_ingestion_pipeline

    try:
        page_count = run_ingestion_pipeline(request.doc_id, request.file_path, request.user_id)
        return {"docId": request.doc_id, "status": "READY", "pageCount": page_count}
    except Exception as e:
        log.error("sync_ingestion_failed", doc_id=request.doc_id, error=str(e))
        return {"docId": request.doc_id, "status": "FAILED", "error": str(e)[:500]}


# ── Internal: Streaming Query ─────────────────────────────────

@app.post("/internal/query")
async def internal_query(request: QueryRequest):
    """
    SSE streaming endpoint. Java WS bridge subscribes to this and
    forwards tokens to STOMP clients.
    """
    from app.retrieval import retrieve
    from app.llm import generate_answer_stream
    from app.database import save_query_result
    import json

    t0 = time.time()

    async def event_generator() -> AsyncGenerator[str, None]:
        full_answer = ""
        faithfulness_score = 0.0
        latency_ms = 0
        chunks = []
        sub_queries: list[str] = []

        try:
            chunks, sub_queries = await retrieve(request.doc_id, request.question)

            # Send retrieval metadata first
            meta = {
                "type": "meta",
                "queryId": request.query_id,
                "retrievedChunks": [
                    {
                        "chunk_index": c["chunk_index"],
                        "page_num": c["page_num"],
                        "score": round(c["score"], 4),
                        "text_preview": c["text"][:200],
                    }
                    for c in chunks
                ],
                "rewrittenQueries": sub_queries,
            }
            yield f"data: {json.dumps(meta)}\n\n"

            # Stream answer tokens
            async for event in generate_answer_stream(request.question, chunks, request.query_id):
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] == "token":
                    full_answer += event.get("content", "")
                elif event["type"] == "done":
                    faithfulness_score = event.get("faithfulness_score", 0.0)
                    latency_ms = event.get("latency_ms", 0)
                    full_answer = event.get("full_answer", full_answer)
                elif event["type"] == "faithfulness_fail":
                    full_answer = event.get("replacement", full_answer)
                    faithfulness_score = event.get("score", 0.0)

        except Exception as e:
            log.error("query_stream_error", query_id=request.query_id, error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        # Persist final result
        try:
            retrieved_refs = [
                {"chunk_index": c["chunk_index"], "page_num": c["page_num"], "score": c["score"]}
                for c in chunks
            ]
            save_query_result(
                request.query_id, full_answer, faithfulness_score,
                latency_ms or int((time.time() - t0) * 1000),
                retrieved_refs, sub_queries
            )
        except Exception as e:
            log.warning("query_persist_failed", query_id=request.query_id, error=str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Internal: Semantic Diff ───────────────────────────────────

@app.post("/internal/diff")
async def internal_diff(request: DiffRequest):
    from app.diff import compute_diff
    try:
        sections = await compute_diff(request.doc_id_1, request.doc_id_2)
        total_changes = sum(1 for s in sections if s["change_type"] != "UNCHANGED")
        return {
            "doc_id_1": request.doc_id_1,
            "doc_id_2": request.doc_id_2,
            "sections": sections,
            "total_changes": total_changes,
        }
    except Exception as e:
        log.error("diff_error", doc_id_1=request.doc_id_1, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ── Internal: Embed ───────────────────────────────────────────

@app.post("/internal/embed")
async def internal_embed(request: EmbedRequest):
    embedder = get_embedder()
    vectors = embedder.embed_batch(request.texts)
    return {"embeddings": vectors.tolist(), "dim": embedder.dimension}


# ── Internal: Delete Index ────────────────────────────────────

@app.delete("/internal/index/{doc_id}")
async def delete_index(doc_id: str):
    from app.faiss_store import get_faiss_store
    get_faiss_store().delete_index(doc_id)
    return {"deleted": doc_id}


# ── Smart Document Summary (NEW) ──────────────────────────────

class SummaryRequest(BaseModel):
    doc_id: str
    user_id: str = ""

@app.post("/internal/summary")
async def internal_summary(request: SummaryRequest):
    """
    Generate a smart AI summary of the document including:
    - Executive summary
    - Key topics / themes
    - Suggested questions to ask
    """
    from app.database import get_document_chunks
    from app.llm_client import get_llm_client
    import json

    chunks = get_document_chunks(request.doc_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No chunks found for document")

    # Sample chunks evenly across the document for overview
    step = max(1, len(chunks) // 12)
    sampled = chunks[::step][:12]
    context = "\n\n---\n\n".join(
        f"[Page {c['page_num']}] {c['text'][:400]}" for c in sampled
    )

    client = get_llm_client()
    prompt = f"""You are analyzing a document. Based on these excerpts, provide a structured analysis.

Document excerpts:
{context}

Respond with JSON only (no markdown):
{{
  "title": "<inferred document title>",
  "executive_summary": "<2-3 sentence overview>",
  "key_topics": ["<topic 1>", "<topic 2>", "<topic 3>", "<topic 4>", "<topic 5>"],
  "document_type": "<e.g. Research Paper, Contract, Report, Manual, etc>",
  "estimated_reading_time_minutes": <integer>,
  "suggested_questions": [
    "<question 1>",
    "<question 2>",
    "<question 3>",
    "<question 4>",
    "<question 5>"
  ],
  "complexity_level": "<Beginner|Intermediate|Advanced>",
  "language": "<detected language>"
}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        return json.loads(raw)
    except Exception as e:
        log.error("summary_failed", doc_id=request.doc_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ── Multi-document Q&A (NEW) ──────────────────────────────────

class MultiDocQueryRequest(BaseModel):
    doc_ids: list[str]
    question: str
    query_id: str

@app.post("/internal/multi-query")
async def internal_multi_query(request: MultiDocQueryRequest):
    """
    Answer a question across multiple documents simultaneously.
    Returns per-document answers + a synthesized cross-document answer.
    """
    from app.retrieval import retrieve, rewrite_query
    from app.llm import generate_answer
    from app.llm_client import get_llm_client
    import json

    client = get_llm_client()
    per_doc_results = []

    for doc_id in request.doc_ids[:5]:  # cap at 5 docs
        try:
            chunks, sub_queries = await retrieve(doc_id, request.question)
            answer, faith_score, explanation = await generate_answer(request.question, chunks)
            per_doc_results.append({
                "doc_id": doc_id,
                "answer": answer,
                "faithfulness_score": faith_score,
                "top_chunks": [
                    {"page_num": c["page_num"], "text_preview": c["text"][:200], "score": c["score"]}
                    for c in chunks[:3]
                ],
            })
        except Exception as e:
            log.warning("multi_query_doc_failed", doc_id=doc_id, error=str(e))
            per_doc_results.append({"doc_id": doc_id, "answer": "Error retrieving answer", "faithfulness_score": 0.0})

    # Synthesize cross-document answer
    if len(per_doc_results) > 1:
        synthesis_ctx = "\n\n".join(
            f"Document {i+1} says: {r['answer']}" for i, r in enumerate(per_doc_results)
        )
        synthesis_prompt = f"""Given these answers from multiple documents about the question "{request.question}":

{synthesis_ctx}

Provide a synthesized answer that:
1. Identifies agreements across documents
2. Highlights key differences or contradictions
3. Gives an overall conclusion

Be concise (3-5 sentences)."""

        try:
            resp = await client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": synthesis_prompt}],
                temperature=0.0,
                max_tokens=400,
            )
            synthesis = resp.choices[0].message.content.strip()
        except Exception:
            synthesis = "Unable to synthesize cross-document answer."
    else:
        synthesis = per_doc_results[0]["answer"] if per_doc_results else ""

    return {
        "question": request.question,
        "query_id": request.query_id,
        "per_document": per_doc_results,
        "synthesis": synthesis,
        "doc_count": len(per_doc_results),
    }


# ── Citation Extraction (NEW) ─────────────────────────────────

class CitationRequest(BaseModel):
    doc_id: str
    answer: str
    chunk_indices: list[int]

@app.post("/internal/citations")
async def extract_citations(request: CitationRequest):
    """
    Given an answer and the retrieved chunks, extract inline citations
    mapping specific answer sentences to specific document locations.
    """
    from app.database import get_document_chunks
    from app.llm_client import get_llm_client
    import json

    all_chunks = get_document_chunks(request.doc_id)
    relevant = [c for c in all_chunks if c.get("chunk_index") in request.chunk_indices]

    if not relevant:
        return {"citations": []}

    client = get_llm_client()
    ctx = "\n".join(f"[CHUNK {c['chunk_index']} | Page {c['page_num']}]: {c['text'][:300]}" for c in relevant)

    prompt = f"""Given this answer and source chunks, identify which part of the answer comes from which chunk.

Answer: {request.answer}

Chunks:
{ctx}

Return JSON only:
{{
  "citations": [
    {{
      "sentence": "<sentence from answer>",
      "chunk_index": <int>,
      "page_num": <int>,
      "confidence": <0.0-1.0>
    }}
  ]
}}"""

    try:
        resp = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=600,
        )
        return json.loads(resp.choices[0].message.content.strip())
    except Exception as e:
        log.warning("citation_extraction_failed", error=str(e))
        return {"citations": []}


# ═══════════════════════════════════════════════════════════════
# FEATURE: Knowledge Graph extraction
# ═══════════════════════════════════════════════════════════════

class GraphRequest(BaseModel):
    doc_id: str

@app.post("/internal/graph")
async def internal_graph(request: GraphRequest):
    """
    Extract entities and relationships from a document.
    Returns nodes + edges for D3 force graph rendering.
    """
    from app.database import get_document_chunks
    from app.llm_client import get_llm_client
    import json, re

    chunks = get_document_chunks(request.doc_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="No chunks found")

    # Sample evenly — max 15 chunks to stay within context
    step = max(1, len(chunks) // 15)
    sampled = chunks[::step][:15]
    context = "\n\n".join(f"[Page {c['page_num']}] {c['text'][:600]}" for c in sampled)

    client = get_llm_client()
    prompt = (
        "Extract a knowledge graph from this document. Identify the most important entities and their relationships.\n\n"
        f"Document:\n{context}\n\n"
        "Return ONLY a JSON object with this exact structure (no markdown, no explanation):\n"
        "{\n"
        '  "nodes": [\n'
        '    {"id": "unique_id", "label": "Entity Name", "type": "person|organization|concept|date|location|technology|other", "page": <int or null>}\n'
        "  ],\n"
        '  "edges": [\n'
        '    {"source": "node_id", "target": "node_id", "label": "relationship description"}\n'
        "  ]\n"
        "}\n"
        "Rules:\n"
        "- 10-20 nodes maximum, 10-25 edges maximum\n"
        "- Node ids must be short snake_case strings\n"
        "- Focus on the most important entities only\n"
        "- Edge labels should be short (2-5 words)\n"
        "- Every edge source and target must match an existing node id"
    )

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        raw = re.sub(r"```(?:json)?|```", "", raw).strip()
        graph = json.loads(raw)

        # Validate — remove edges referencing nonexistent nodes
        node_ids = {n["id"] for n in graph.get("nodes", [])}
        graph["edges"] = [
            e for e in graph.get("edges", [])
            if e.get("source") in node_ids and e.get("target") in node_ids
        ]
        return graph
    except Exception as e:
        log.error("graph_extraction_failed", doc_id=request.doc_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# FEATURE: Shareable chat sessions
# ═══════════════════════════════════════════════════════════════

class ShareRequest(BaseModel):
    query_id: str

@app.get("/share/{share_token}")
async def get_shared_session(share_token: str):
    """Return a public shared chat session (no auth required)."""
    from app.database import get_shared_session
    session = get_shared_session(share_token)
    if not session:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    return session
