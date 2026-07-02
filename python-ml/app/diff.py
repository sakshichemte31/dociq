"""
app/diff.py
Semantic document diff:
  1. Load all chunks for both documents from PostgreSQL
  2. Embed section headings via local sentence-transformers
  3. Match sections by cosine similarity
  4. For modified pairs, ask Groq LLM to describe the semantic change
  5. Return structured diff JSON
"""

import numpy as np
import structlog
from sklearn.metrics.pairwise import cosine_similarity

from app.config import get_settings
from app.database import get_document_chunks
from app.embedder import get_embedder
from app.llm_client import get_llm_client

log = structlog.get_logger()
settings = get_settings()

SIMILARITY_MATCH_THRESHOLD = 0.75


def _extract_heading(text: str) -> str:
    """Return first line as heading, fall back to first 150 chars."""
    lines = text.strip().split("\n")
    first = lines[0].strip() if lines else ""
    return first[:150] if first else text[:150]


async def _describe_change(old_text: str, new_text: str) -> str:
    """Ask Groq LLM to describe the semantic change between two passages."""
    client = get_llm_client()
    prompt = (
        "Compare these two document passages and describe what changed semantically.\n"
        "Focus on meaning changes, not just wording differences.\n\n"
        f"Original passage:\n{old_text[:1500]}\n\n"
        f"New passage:\n{new_text[:1500]}\n\n"
        "Describe the semantic changes in 1-3 sentences:"
    )
    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        log.warning("diff_llm_failed", error=str(e))
        return "Unable to describe change."


async def compute_diff(doc_id_1: str, doc_id_2: str) -> list[dict]:
    """
    Full semantic diff pipeline.
    Returns list of DiffSection dicts.
    """
    embedder = get_embedder()

    chunks_1 = get_document_chunks(doc_id_1)
    chunks_2 = get_document_chunks(doc_id_2)

    if not chunks_1 or not chunks_2:
        return [{
            "section": "Document",
            "change_type": "UNKNOWN",
            "old_summary": "No content available for doc 1" if not chunks_1 else "Available",
            "new_summary": "No content available for doc 2" if not chunks_2 else "Available",
            "similarity": 0.0,
        }]

    # Embed heading of each chunk for matching
    headings_1 = [_extract_heading(c["text"]) for c in chunks_1]
    headings_2 = [_extract_heading(c["text"]) for c in chunks_2]
    all_embeddings = embedder.embed_batch(headings_1 + headings_2)
    emb_1 = all_embeddings[:len(headings_1)]
    emb_2 = all_embeddings[len(headings_1):]

    sim_matrix = cosine_similarity(emb_1, emb_2)

    diff_sections = []
    matched_2: set[int] = set()

    for i, chunk_1 in enumerate(chunks_1):
        best_j = int(np.argmax(sim_matrix[i]))
        best_score = float(sim_matrix[i][best_j])

        if best_score >= SIMILARITY_MATCH_THRESHOLD:
            chunk_2 = chunks_2[best_j]
            matched_2.add(best_j)

            if best_score >= 0.98:
                change_type = "UNCHANGED"
                change_desc = "No significant changes detected."
            else:
                change_type = "MODIFIED"
                change_desc = await _describe_change(chunk_1["text"], chunk_2["text"])

            diff_sections.append({
                "section": _extract_heading(chunk_1["text"]),
                "change_type": change_type,
                "old_summary": chunk_1["text"][:300],
                "new_summary": chunk_2["text"][:300],
                "similarity": round(best_score, 4),
                "page_old": chunk_1["page_num"],
                "page_new": chunk_2["page_num"],
                "semantic_diff": change_desc,
            })
        else:
            diff_sections.append({
                "section": _extract_heading(chunk_1["text"]),
                "change_type": "REMOVED",
                "old_summary": chunk_1["text"][:300],
                "new_summary": None,
                "similarity": round(best_score, 4),
                "page_old": chunk_1["page_num"],
                "page_new": None,
                "semantic_diff": "This section was removed in the new version.",
            })

    for j, chunk_2 in enumerate(chunks_2):
        if j not in matched_2:
            diff_sections.append({
                "section": _extract_heading(chunk_2["text"]),
                "change_type": "ADDED",
                "old_summary": None,
                "new_summary": chunk_2["text"][:300],
                "similarity": 0.0,
                "page_old": None,
                "page_new": chunk_2["page_num"],
                "semantic_diff": "This section was added in the new version.",
            })

    log.info(
        "diff_complete",
        doc_id_1=doc_id_1, doc_id_2=doc_id_2,
        total=len(diff_sections),
        modified=sum(1 for s in diff_sections if s["change_type"] == "MODIFIED"),
        removed=sum(1 for s in diff_sections if s["change_type"] == "REMOVED"),
        added=sum(1 for s in diff_sections if s["change_type"] == "ADDED"),
    )
    return diff_sections
