import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from typing import Generator
import structlog

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()

_pool: ThreadedConnectionPool | None = None


def init_db_pool() -> None:
    global _pool
    _pool = ThreadedConnectionPool(
        minconn=2,
        maxconn=20,
        dsn=settings.db_url,
    )
    log.info("db_pool_initialized", dsn=f"postgresql://{settings.db_host}:{settings.db_port}/{settings.db_name}")


def close_db_pool() -> None:
    global _pool
    if _pool:
        _pool.closeall()
        _pool = None


@contextmanager
def get_db() -> Generator[psycopg2.extensions.connection, None, None]:
    """Context manager that checks out/in a connection from the pool."""
    assert _pool is not None, "DB pool not initialized — call init_db_pool() first"
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def update_document_status(doc_id: str, status: str, page_count: int | None = None,
                            error_message: str | None = None) -> None:
    """Update document processing status in PostgreSQL."""
    with get_db() as conn:
        with conn.cursor() as cur:
            if page_count is not None:
                cur.execute(
                    """UPDATE documents SET status = %s::document_status, page_count = %s, updated_at = NOW()
                       WHERE id = %s""",
                    (status, page_count, doc_id)
                )
            elif error_message:
                cur.execute(
                    """UPDATE documents SET status = %s::document_status, error_message = %s, updated_at = NOW()
                       WHERE id = %s""",
                    (status, error_message, doc_id)
                )
            else:
                cur.execute(
                    "UPDATE documents SET status = %s::document_status, updated_at = NOW() WHERE id = %s",
                    (status, doc_id)
                )


def save_chunks(doc_id: str, chunks: list[dict]) -> None:
    """Persist chunk metadata to PostgreSQL."""
    with get_db() as conn:
        with conn.cursor() as cur:
            # Clear existing chunks for re-processing
            cur.execute("DELETE FROM document_chunks WHERE doc_id = %s", (doc_id,))

            cur.executemany(
                """INSERT INTO document_chunks
                   (id, doc_id, chunk_index, page_num, char_start, char_end, text, token_count)
                   VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)""",
                [(doc_id, c["chunk_index"], c["page_num"], c["char_start"], c["char_end"],
                  c["text"], c.get("token_count")) for c in chunks]
            )
            log.info("chunks_saved", doc_id=doc_id, count=len(chunks))


def save_query_result(query_id: str, answer: str, faithfulness_score: float,
                      latency_ms: int, retrieved_chunks: list, rewritten_queries: list[str]) -> None:
    """Update a query record with its completed result."""
    import json
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE queries
                   SET answer = %s, faithfulness_score = %s, latency_ms = %s,
                       retrieved_chunks = %s, rewritten_queries = %s,
                       status = 'COMPLETED', completed_at = NOW()
                   WHERE id = %s""",
                (answer, faithfulness_score, latency_ms,
                 json.dumps(retrieved_chunks), rewritten_queries, query_id)
            )


def get_document_chunks(doc_id: str) -> list[dict]:
    """Fetch all chunks for a document."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, chunk_index, page_num, char_start, char_end, text
                   FROM document_chunks WHERE doc_id = %s ORDER BY chunk_index""",
                (doc_id,)
            )
            rows = cur.fetchall()
            return [
                {"id": str(r[0]), "chunk_index": r[1], "page_num": r[2],
                 "char_start": r[3], "char_end": r[4], "text": r[5]}
                for r in rows
            ]


def get_shared_session(share_token: str) -> dict | None:
    """Return a shared chat session by token."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT q.id, q.question, q.answer, q.faithfulness_score,
                       q.latency_ms, q.created_at, q.rewritten_queries,
                       d.original_filename, d.page_count
                FROM queries q
                JOIN documents d ON q.doc_id = d.id
                WHERE q.share_token = %s AND q.is_public = true
            """, (share_token,))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "queryId": str(row[0]),
                "question": row[1],
                "answer": row[2],
                "faithfulnessScore": float(row[3]) if row[3] else None,
                "latencyMs": row[4],
                "createdAt": row[5].isoformat() if row[5] else None,
                "rewrittenQueries": row[6],
                "documentName": row[7],
                "pageCount": row[8],
            }
    finally:
        conn.close()
