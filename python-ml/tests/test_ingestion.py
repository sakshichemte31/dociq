"""
tests/test_ingestion.py
Unit tests for the ingestion pipeline — no external dependencies needed.
"""
import pytest
import numpy as np
from unittest.mock import MagicMock, patch, AsyncMock


# ── Chunking tests ────────────────────────────────────────────

class TestChunking:
    """Tests for the semantic chunking algorithm."""

    def test_chunk_pages_basic(self):
        from app.ingestion import chunk_pages

        pages = [
            {
                "page_num": 1,
                "text": "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph.",
                "char_offset": 0,
            }
        ]
        chunks = chunk_pages(pages, max_tokens=50, overlap_tokens=5)
        assert len(chunks) >= 1
        for c in chunks:
            assert "text" in c
            assert "page_num" in c
            assert "chunk_index" in c
            assert c["page_num"] == 1

    def test_chunk_overlap(self):
        from app.ingestion import chunk_pages

        # Create content that forces two chunks
        long_para = "word " * 300  # ~300 tokens
        pages = [
            {
                "page_num": 1,
                "text": f"{long_para}\n\n{long_para}",
                "char_offset": 0,
            }
        ]
        chunks = chunk_pages(pages, max_tokens=200, overlap_tokens=20)
        assert len(chunks) >= 2
        # Chunk indices should be sequential
        for i, c in enumerate(chunks):
            assert c["chunk_index"] == i

    def test_empty_page(self):
        from app.ingestion import chunk_pages

        pages = [{"page_num": 1, "text": "", "char_offset": 0}]
        chunks = chunk_pages(pages)
        assert chunks == []

    def test_single_short_page(self):
        from app.ingestion import chunk_pages

        pages = [{"page_num": 1, "text": "Hello world.", "char_offset": 0}]
        chunks = chunk_pages(pages, max_tokens=512, overlap_tokens=50)
        assert len(chunks) == 1
        assert "Hello world." in chunks[0]["text"]

    def test_multi_page_indices(self):
        from app.ingestion import chunk_pages

        pages = [
            {"page_num": p, "text": f"Content for page {p}. " * 20, "char_offset": p * 1000}
            for p in range(1, 4)
        ]
        chunks = chunk_pages(pages, max_tokens=100, overlap_tokens=10)
        assert all(c["chunk_index"] == i for i, c in enumerate(chunks))
        assert len({c["page_num"] for c in chunks}) > 1  # multiple pages represented

    def test_token_count(self):
        from app.ingestion import count_tokens

        text = "The quick brown fox jumps over the lazy dog."
        count = count_tokens(text)
        assert count > 0
        assert count < 20  # Should be around 9-10 tokens


# ── FAISS store tests ─────────────────────────────────────────

class TestFAISSStore:
    """Tests for the FAISS index management."""

    def test_create_and_search(self, tmp_path):
        from app.faiss_store import FAISSStore

        store = FAISSStore(index_dir=str(tmp_path))
        dim = 384
        doc_id = "test-doc-001"

        embeddings = np.random.randn(10, dim).astype(np.float32)
        # Normalize (simulate sentence-transformers output)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms

        chunks = [
            {"chunk_index": i, "page_num": (i // 3) + 1,
             "char_start": i * 100, "char_end": (i + 1) * 100,
             "text": f"Chunk {i} content here for testing purposes."}
            for i in range(10)
        ]

        store.create_index(doc_id, embeddings, chunks)

        # Index file should exist
        assert (tmp_path / f"{doc_id}.faiss").exists()
        assert (tmp_path / f"{doc_id}.meta.json").exists()

        # Search should return results
        query = np.random.randn(dim).astype(np.float32)
        query /= np.linalg.norm(query)
        results = store.search(doc_id, query, top_k=3)

        assert len(results) == 3
        for r in results:
            assert "chunk_index" in r
            assert "page_num" in r
            assert "score" in r
            assert "text" in r

    def test_search_returns_sorted_by_score(self, tmp_path):
        from app.faiss_store import FAISSStore

        store = FAISSStore(index_dir=str(tmp_path))
        dim = 64
        doc_id = "sort-test"

        embeddings = np.random.randn(20, dim).astype(np.float32)
        embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)

        chunks = [
            {"chunk_index": i, "page_num": 1, "char_start": 0, "char_end": 100, "text": f"chunk {i}"}
            for i in range(20)
        ]
        store.create_index(doc_id, embeddings, chunks)

        query = embeddings[5].copy()  # Use exact chunk embedding as query
        results = store.search(doc_id, query, top_k=5)

        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_delete_index(self, tmp_path):
        from app.faiss_store import FAISSStore

        store = FAISSStore(index_dir=str(tmp_path))
        dim = 64
        doc_id = "delete-test"

        embeddings = np.ones((5, dim), dtype=np.float32)
        chunks = [
            {"chunk_index": i, "page_num": 1, "char_start": 0, "char_end": 10, "text": "x"}
            for i in range(5)
        ]
        store.create_index(doc_id, embeddings, chunks)
        assert (tmp_path / f"{doc_id}.faiss").exists()

        store.delete_index(doc_id)
        assert not (tmp_path / f"{doc_id}.faiss").exists()

    def test_load_from_disk(self, tmp_path):
        from app.faiss_store import FAISSStore

        dim = 64
        doc_id = "persist-test"

        # Create with one store instance
        store1 = FAISSStore(index_dir=str(tmp_path))
        embeddings = np.random.randn(5, dim).astype(np.float32)
        embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
        chunks = [
            {"chunk_index": i, "page_num": 1, "char_start": 0, "char_end": 10, "text": f"c{i}"}
            for i in range(5)
        ]
        store1.create_index(doc_id, embeddings, chunks)

        # Load with fresh instance (simulates restart)
        store2 = FAISSStore(index_dir=str(tmp_path))
        query = embeddings[0].copy()
        results = store2.search(doc_id, query, top_k=3)
        assert len(results) == 3


# ── Retrieval tests ───────────────────────────────────────────

class TestRetrieval:
    """Tests for the multi-query retrieval pipeline."""

    @pytest.mark.asyncio
    async def test_query_rewrite_fallback_on_error(self):
        from app.retrieval import rewrite_query

        with patch("app.retrieval.get_llm_client") as mock_client:
            mock_client.return_value.chat.completions.create = AsyncMock(
                side_effect=Exception("API error")
            )
            result = await rewrite_query("What is the main topic?")
            # Falls back to original question
            assert result == ["What is the main topic?"]

    @pytest.mark.asyncio
    async def test_query_rewrite_returns_list(self):
        from app.retrieval import rewrite_query

        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Query 1\nQuery 2\nQuery 3"

        with patch("app.retrieval.get_llm_client") as mock_client:
            mock_client.return_value.chat.completions.create = AsyncMock(
                return_value=mock_response
            )
            result = await rewrite_query("Test question", n=3)
            assert len(result) == 3
            assert result[0] == "Query 1"

    def test_retrieve_chunks_deduplication(self, tmp_path):
        from app.faiss_store import FAISSStore
        from app.retrieval import retrieve_chunks

        dim = 64
        doc_id = "dedup-test"
        store = FAISSStore(index_dir=str(tmp_path))

        embeddings = np.random.randn(10, dim).astype(np.float32)
        embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
        chunks = [
            {"chunk_index": i, "page_num": 1, "char_start": 0, "char_end": 100, "text": f"c{i}"}
            for i in range(10)
        ]
        store.create_index(doc_id, embeddings, chunks)

        with patch("app.retrieval.get_faiss_store", return_value=store):
            # Use same query vector twice — should deduplicate
            query = embeddings[0].copy()
            result = retrieve_chunks(doc_id, [query, query], top_k=5)

            # No duplicate chunk_indices
            indices = [r["chunk_index"] for r in result]
            assert len(indices) == len(set(indices))

    @pytest.mark.asyncio
    async def test_faithfulness_check_returns_score(self):
        from app.retrieval import faithfulness_check

        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"score": 0.92, "explanation": "Fully supported"}'

        with patch("app.retrieval.get_llm_client") as mock_client:
            mock_client.return_value.chat.completions.create = AsyncMock(
                return_value=mock_response
            )
            chunks = [{"page_num": 1, "text": "Context passage", "score": 0.9}]
            score, explanation = await faithfulness_check("question", "answer", chunks)
            assert score == pytest.approx(0.92)
            assert "supported" in explanation.lower()

    @pytest.mark.asyncio
    async def test_faithfulness_fallback_on_error(self):
        from app.retrieval import faithfulness_check

        with patch("app.retrieval.get_llm_client") as mock_client:
            mock_client.return_value.chat.completions.create = AsyncMock(
                side_effect=Exception("API down")
            )
            chunks = [{"page_num": 1, "text": "text", "score": 0.9}]
            score, _ = await faithfulness_check("q", "a", chunks)
            assert score == 0.5  # fallback score


# ── Diff tests ────────────────────────────────────────────────

class TestDiff:
    """Tests for the semantic diff module."""

    def test_extract_heading(self):
        from app.diff import _extract_heading

        text = "Introduction\nThis is the body of the section with more content."
        assert _extract_heading(text) == "Introduction"

    def test_extract_heading_long(self):
        from app.diff import _extract_heading

        text = "A" * 200 + "\nrest"
        result = _extract_heading(text)
        assert len(result) <= 150

    @pytest.mark.asyncio
    async def test_compute_diff_empty_docs(self):
        from app.diff import compute_diff

        with patch("app.diff.get_document_chunks", return_value=[]):
            result = await compute_diff("doc1", "doc2")
            assert len(result) == 1
            assert result[0]["change_type"] == "UNKNOWN"

    @pytest.mark.asyncio
    async def test_compute_diff_identical_docs(self):
        from app.diff import compute_diff
        from app.embedder import EmbeddingService

        chunks = [
            {"id": "c1", "chunk_index": 0, "page_num": 1,
             "char_start": 0, "char_end": 100, "text": "This is identical content."},
        ]

        mock_embedder = MagicMock(spec=EmbeddingService)
        # Same embedding for both → cosine sim = 1.0
        vec = np.ones(384, dtype=np.float32)
        vec /= np.linalg.norm(vec)
        mock_embedder.embed_batch.return_value = np.stack([vec, vec])

        with patch("app.diff.get_document_chunks", return_value=chunks), \
             patch("app.diff.get_embedder", return_value=mock_embedder):
            result = await compute_diff("doc1", "doc2")
            assert result[0]["change_type"] == "UNCHANGED"
            assert result[0]["similarity"] >= 0.98


# ── Config tests ──────────────────────────────────────────────

class TestConfig:
    def test_settings_db_url(self):
        from app.config import Settings

        s = Settings(
            db_host="myhost", db_port=5432,
            db_name="mydb", db_user="user", db_pass="pass"
        )
        assert s.db_url == "postgresql://user:pass@myhost:5432/mydb"

    def test_settings_defaults(self):
        from app.config import Settings

        s = Settings()
        assert s.chunk_max_tokens == 512
        assert s.chunk_overlap_tokens == 50
        assert s.top_k_chunks == 5
        assert s.faithfulness_threshold == 0.7
        assert s.num_rewrite_queries == 3
