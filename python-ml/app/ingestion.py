"""
app/ingestion.py
PDF ingestion pipeline:
  1. Parse PDF via PyMuPDF
  2. Semantic chunking (paragraph-aware, max 512 tokens, 50-token overlap)
  3. Embed via sentence-transformers/all-MiniLM-L6-v2
  4. Store embeddings in FAISS
  5. Persist chunk metadata to PostgreSQL
  6. Update document status
"""

import os
import re
import time
import uuid
from pathlib import Path
from typing import Generator

import fitz  # PyMuPDF
import numpy as np
import structlog
import tiktoken

from app.config import get_settings
from app.database import save_chunks, update_document_status
from app.embedder import get_embedder, EmbeddingService
from app.faiss_store import FAISSStore

log = structlog.get_logger()
settings = get_settings()

# Tokenizer for chunk sizing.
# NOTE: tiktoken.get_encoding() downloads its BPE file from an external
# Azure blob on first use if it isn't already cached locally. Loading it
# eagerly at import time meant any network hiccup (or an offline/locked-down
# runtime) crashed the entire service on startup, before it ever served a
# request. It's now loaded lazily on first real use, and the Dockerfile
# pre-downloads it at build time (see model-download stage) so the cache
# is already warm and no network call happens at runtime at all.
_tokenizer = None


def _get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = tiktoken.get_encoding("cl100k_base")
    return _tokenizer


# ── PDF Parsing ───────────────────────────────────────────────

def parse_pdf(file_path: str) -> list[dict]:
    """
    Parse PDF and return pages as:
    [{ "page_num": int, "text": str, "blocks": [...] }]
    """
    doc = fitz.open(file_path)
    pages = []

    for page_num, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks", sort=True)
        # blocks: (x0, y0, x1, y1, text, block_no, block_type)
        text_blocks = [b[4].strip() for b in blocks if b[6] == 0 and b[4].strip()]
        full_text = "\n\n".join(text_blocks)
        pages.append({
            "page_num": page_num,
            "text": full_text,
            "char_offset": sum(len(p["text"]) + 2 for p in pages),  # cumulative offset
        })

    doc.close()
    log.info("pdf_parsed", file_path=file_path, page_count=len(pages))
    return pages


# ── Chunking ──────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    return len(_get_tokenizer().encode(text))


def chunk_pages(pages: list[dict],
                max_tokens: int = None,
                overlap_tokens: int = None) -> list[dict]:
    """
    Semantic chunking strategy:
    - Split on paragraph boundaries (\n\n)
    - Merge small paragraphs until max_tokens is reached
    - Add overlap_tokens of preceding text as prefix for context
    """
    max_tokens = max_tokens or settings.chunk_max_tokens
    overlap_tokens = overlap_tokens or settings.chunk_overlap_tokens

    chunks = []
    chunk_index = 0

    for page in pages:
        paragraphs = [p.strip() for p in re.split(r"\n\n+", page["text"]) if p.strip()]

        current_tokens = 0
        current_text: list[str] = []
        char_start = page["char_offset"]

        def flush_chunk(char_end: int):
            nonlocal chunk_index, current_tokens, current_text, char_start
            if not current_text:
                return

            text = "\n\n".join(current_text)
            chunks.append({
                "chunk_index": chunk_index,
                "page_num": page["page_num"],
                "char_start": char_start,
                "char_end": char_end,
                "text": text,
                "token_count": count_tokens(text),
            })
            chunk_index += 1

            # Overlap: keep last overlap_tokens worth of text as prefix for next chunk
            overlap_text = _get_overlap_prefix(current_text, overlap_tokens)
            current_tokens = count_tokens(overlap_text) if overlap_text else 0
            current_text = [overlap_text] if overlap_text else []
            char_start = char_end

        running_offset = page["char_offset"]
        for para in paragraphs:
            para_tokens = count_tokens(para)
            running_offset += len(para) + 2  # +2 for \n\n

            if current_tokens + para_tokens > max_tokens and current_text:
                flush_chunk(running_offset - len(para) - 2)

            current_text.append(para)
            current_tokens += para_tokens

        # Flush remaining
        flush_chunk(running_offset)

    log.info("chunks_created", count=len(chunks))
    return chunks


def _get_overlap_prefix(paragraphs: list[str], overlap_tokens: int) -> str:
    """Return the last N tokens worth of text for overlap."""
    combined = "\n\n".join(paragraphs)
    tokenizer = _get_tokenizer()
    tokens = tokenizer.encode(combined)
    if len(tokens) <= overlap_tokens:
        return combined
    overlap = tokenizer.decode(tokens[-overlap_tokens:])
    return overlap


# ── Embedding + FAISS ─────────────────────────────────────────

def embed_and_index(doc_id: str, chunks: list[dict]) -> None:
    """Embed chunks and store in FAISS index for this document."""
    embedder = get_embedder()
    faiss_store = FAISSStore()

    texts = [c["text"] for c in chunks]
    log.info("embedding_start", doc_id=doc_id, num_chunks=len(texts))

    t0 = time.time()
    embeddings = embedder.embed_batch(texts)
    embed_time = time.time() - t0
    log.info("embedding_done", doc_id=doc_id, elapsed_s=round(embed_time, 2))

    faiss_store.create_index(doc_id, embeddings, chunks)
    log.info("faiss_index_created", doc_id=doc_id)


# ── Main Pipeline ─────────────────────────────────────────────

def run_ingestion_pipeline(doc_id: str, file_path: str, user_id: str) -> int:
    """
    Full ingestion pipeline. Called by the Kafka consumer and by the
    synchronous /internal/ingest endpoint.
    Updates document status throughout. Returns the page count on success.
    """
    log.info("ingestion_start", doc_id=doc_id, file_path=file_path)

    # 1. Mark as PROCESSING
    update_document_status(doc_id, "PROCESSING")

    try:
        # 2. Parse PDF
        pages = parse_pdf(file_path)
        page_count = len(pages)

        # 3. Chunk
        chunks = chunk_pages(pages)

        if not chunks:
            raise ValueError("No content extracted from PDF")

        # 4. Embed + store in FAISS
        embed_and_index(doc_id, chunks)

        # 5. Save chunk metadata to PostgreSQL
        save_chunks(doc_id, chunks)

        # 6. Mark READY
        update_document_status(doc_id, "READY", page_count=page_count)
        log.info("ingestion_complete", doc_id=doc_id, page_count=page_count, chunks=len(chunks))
        return page_count

    except Exception as e:
        log.error("ingestion_failed", doc_id=doc_id, error=str(e), exc_info=True)
        update_document_status(doc_id, "FAILED", error_message=str(e))
        raise
