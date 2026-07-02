"""
app/faiss_store.py
Per-document FAISS index management.
Uses IndexFlatIP (inner product on normalized vectors = cosine similarity).
Persists indices to disk so they survive restarts.
"""

import json
import os
import pickle
from pathlib import Path

import faiss
import numpy as np
import structlog

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


class FAISSStore:
    def __init__(self, index_dir: str = None):
        self.index_dir = Path(index_dir or settings.faiss_index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._indices: dict[str, faiss.Index] = {}
        self._metadata: dict[str, list[dict]] = {}

    def _index_path(self, doc_id: str) -> Path:
        return self.index_dir / f"{doc_id}.faiss"

    def _meta_path(self, doc_id: str) -> Path:
        return self.index_dir / f"{doc_id}.meta.json"

    def create_index(self, doc_id: str, embeddings: np.ndarray, chunks: list[dict]) -> None:
        """Build a FAISS index for a document and persist it."""
        dim = embeddings.shape[1]

        # Use flat index for small docs (<10k chunks), IVF for larger
        if len(chunks) < 1000:
            index = faiss.IndexFlatIP(dim)
        else:
            quantizer = faiss.IndexFlatIP(dim)
            nlist = min(settings.faiss_nlist, len(chunks) // 10)
            index = faiss.IndexIVFFlat(quantizer, dim, nlist, faiss.METRIC_INNER_PRODUCT)
            index.train(embeddings)

        index.add(embeddings)

        # Save to disk
        faiss.write_index(index, str(self._index_path(doc_id)))

        # Save chunk metadata (strip embeddings, keep text + positions)
        meta = [
            {
                "chunk_index": c["chunk_index"],
                "page_num": c["page_num"],
                "char_start": c["char_start"],
                "char_end": c["char_end"],
                "text": c["text"],
            }
            for c in chunks
        ]
        with open(self._meta_path(doc_id), "w") as f:
            json.dump(meta, f)

        # Cache in memory
        self._indices[doc_id] = index
        self._metadata[doc_id] = meta

        log.info("faiss_index_saved", doc_id=doc_id, n_vectors=len(chunks), dim=dim)

    def load_index(self, doc_id: str) -> tuple[faiss.Index, list[dict]]:
        """Load (or return cached) index + metadata for a document."""
        if doc_id not in self._indices:
            idx_path = self._index_path(doc_id)
            meta_path = self._meta_path(doc_id)

            if not idx_path.exists():
                raise FileNotFoundError(f"FAISS index not found for doc_id={doc_id}")

            self._indices[doc_id] = faiss.read_index(str(idx_path))
            with open(meta_path) as f:
                self._metadata[doc_id] = json.load(f)

        return self._indices[doc_id], self._metadata[doc_id]

    def search(self, doc_id: str, query_vector: np.ndarray, top_k: int = 5) -> list[dict]:
        """
        Search the FAISS index for a document.
        Returns top_k chunks sorted by cosine similarity (descending).
        """
        index, metadata = self.load_index(doc_id)

        query = query_vector.reshape(1, -1).astype(np.float32)
        scores, indices = index.search(query, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:  # faiss returns -1 for empty slots
                continue
            chunk = dict(metadata[idx])
            chunk["score"] = float(score)
            results.append(chunk)

        return results

    def delete_index(self, doc_id: str) -> None:
        """Remove a document's index from disk and memory."""
        self._index_path(doc_id).unlink(missing_ok=True)
        self._meta_path(doc_id).unlink(missing_ok=True)
        self._indices.pop(doc_id, None)
        self._metadata.pop(doc_id, None)
        log.info("faiss_index_deleted", doc_id=doc_id)


# Singleton
_store: FAISSStore | None = None


def get_faiss_store() -> FAISSStore:
    global _store
    if _store is None:
        _store = FAISSStore()
    return _store
