"""
app/embedder.py
Singleton embedding service using sentence-transformers/all-MiniLM-L6-v2.
Provides batch embedding with caching.
"""

import hashlib
import time
from functools import lru_cache

import numpy as np
import structlog
from sentence_transformers import SentenceTransformer

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


class EmbeddingService:
    def __init__(self, model_name: str = None):
        model_name = model_name or settings.embedding_model
        log.info("loading_embedding_model", model=model_name)
        t0 = time.time()
        self._model = SentenceTransformer(model_name)
        log.info("embedding_model_loaded", model=model_name, elapsed_s=round(time.time() - t0, 2))

    def embed(self, text: str) -> np.ndarray:
        """Embed a single text. Returns float32 ndarray of shape (dim,)."""
        vec = self._model.encode(text, normalize_embeddings=True, show_progress_bar=False)
        return vec.astype(np.float32)

    def embed_batch(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """
        Embed a list of texts in batches.
        Returns float32 ndarray of shape (N, dim).
        """
        log.debug("embed_batch", count=len(texts), batch_size=batch_size)
        vectors = self._model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return vectors.astype(np.float32)

    @property
    def dimension(self) -> int:
        return self._model.get_sentence_embedding_dimension()


@lru_cache(maxsize=1)
def get_embedder() -> EmbeddingService:
    """Singleton — model loaded once per process."""
    return EmbeddingService()
