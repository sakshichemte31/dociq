"""
app/kafka_consumer.py
Kafka consumers for:
  - doc.ingestion  → run PDF ingestion pipeline
  - doc.query      → run RAG query pipeline + stream via Kafka/HTTP
"""

import asyncio
import json
import threading
import time

import structlog
from kafka import KafkaConsumer, KafkaProducer

from app.config import get_settings
from app.ingestion import run_ingestion_pipeline

log = structlog.get_logger()
settings = get_settings()


def _make_consumer(topics: list[str]) -> KafkaConsumer:
    return KafkaConsumer(
        *topics,
        bootstrap_servers=settings.kafka_brokers.split(","),
        group_id=settings.kafka_group_id,
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        key_deserializer=lambda k: k.decode("utf-8") if k else None,
        max_poll_interval_ms=600_000,  # 10 min — long ingestion jobs
        session_timeout_ms=60_000,
    )


def _make_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=settings.kafka_brokers.split(","),
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
        retries=3,
    )


def _publish_status(producer: KafkaProducer, doc_id: str, status: str,
                    message: str = "", page_count: int = None) -> None:
    payload = {
        "docId": doc_id,
        "status": status,
        "message": message,
        "timestamp": int(time.time() * 1000),
    }
    if page_count is not None:
        payload["pageCount"] = page_count

    producer.send(settings.kafka_status_topic, key=doc_id, value=payload)
    producer.flush()


# ── Ingestion Consumer ────────────────────────────────────────

def run_ingestion_consumer() -> None:
    """
    Blocking loop. Processes doc.ingestion messages.
    Should be run in a dedicated thread.
    """
    consumer = _make_consumer([settings.kafka_ingestion_topic])
    producer = _make_producer()
    log.info("ingestion_consumer_started", topic=settings.kafka_ingestion_topic)

    for msg in consumer:
        event = msg.value
        doc_id = event.get("docId") or event.get("doc_id")
        file_path = event.get("filePath") or event.get("file_path")
        user_id = event.get("userId") or event.get("user_id")

        log.info("ingestion_event_received", doc_id=doc_id)

        try:
            # Notify Java: starting
            _publish_status(producer, doc_id, "PROCESSING", "Starting ingestion")

            run_ingestion_pipeline(doc_id, file_path, user_id)

            _publish_status(producer, doc_id, "READY", "Document ready for queries")

        except Exception as e:
            log.error("ingestion_consumer_error", doc_id=doc_id, error=str(e), exc_info=True)
            _publish_status(producer, doc_id, "FAILED", str(e)[:500])


# ── Query Consumer ────────────────────────────────────────────

def run_query_consumer() -> None:
    """
    Blocking loop. Processes doc.query messages.
    Runs async RAG pipeline in an event loop.
    """
    consumer = _make_consumer([settings.kafka_query_topic])
    producer = _make_producer()
    log.info("query_consumer_started", topic=settings.kafka_query_topic)

    loop = asyncio.new_event_loop()

    for msg in consumer:
        event = msg.value
        query_id = event.get("queryId") or event.get("query_id")
        doc_id = event.get("docId") or event.get("doc_id")
        question = event.get("question")

        log.info("query_event_received", query_id=query_id, doc_id=doc_id)

        try:
            loop.run_until_complete(_process_query(producer, query_id, doc_id, question))
        except Exception as e:
            log.error("query_consumer_error", query_id=query_id, error=str(e), exc_info=True)
            # Notify Java of failure via status-like message on status topic
            producer.send(settings.kafka_status_topic, key=query_id, value={
                "type": "query_error",
                "queryId": query_id,
                "error": str(e)[:500],
            })
            producer.flush()


async def _process_query(producer: KafkaProducer, query_id: str, doc_id: str, question: str) -> None:
    from app.retrieval import retrieve
    from app.llm import generate_answer
    from app.database import save_query_result

    t0 = time.time()

    chunks, sub_queries = await retrieve(doc_id, question)
    answer, faithfulness_score, explanation = await generate_answer(question, chunks)
    latency_ms = int((time.time() - t0) * 1000)

    # Persist result
    retrieved_chunk_refs = [
        {"chunk_index": c["chunk_index"], "page_num": c["page_num"], "score": c["score"]}
        for c in chunks
    ]
    save_query_result(query_id, answer, faithfulness_score, latency_ms,
                      retrieved_chunk_refs, sub_queries)

    # Notify Java via Kafka (Java WS handler broadcasts to client)
    producer.send(settings.kafka_status_topic, key=query_id, value={
        "type": "query_complete",
        "queryId": query_id,
        "answer": answer,
        "faithfulnessScore": faithfulness_score,
        "latencyMs": latency_ms,
        "retrievedChunks": retrieved_chunk_refs,
        "rewrittenQueries": sub_queries,
    })
    producer.flush()


# ── Startup ───────────────────────────────────────────────────

def start_consumers() -> None:
    """
    Start the ingestion consumer only.

    The query consumer (`run_query_consumer`, still defined above for
    reference) is intentionally NOT started. Java's QueryStreamBridge
    already calls POST /internal/query directly (SSE) for every
    doc.query event, which runs the full retrieve -> generate -> save
    pipeline and streams tokens back over the WebSocket. Also starting
    this Kafka consumer meant every question triggered the pipeline
    TWICE — two independent LLM calls racing to UPDATE the same
    queries row — which produced inconsistent/degraded answers and
    wasted an LLM call on every question.
    """
    t1 = threading.Thread(target=run_ingestion_consumer, daemon=True, name="ingestion-consumer")
    t1.start()
    log.info("kafka_consumers_started", query_consumer="disabled (see /internal/query SSE path)")
