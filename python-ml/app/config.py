from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "DocIQ ML Service"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # ── LLM — Groq (free, no credit card required) ────────────────
    # Sign up at https://console.groq.com — grab an API key, done.
    # To switch providers set GROQ_BASE_URL to any OpenAI-compatible endpoint.
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"   # best free model on Groq
    groq_base_url: str = "https://api.groq.com/openai/v1"

    llm_temperature: float = 0.25
    llm_max_tokens: int = 2048

    # Convenience aliases used throughout the codebase
    @property
    def llm_api_key(self) -> str:
        return self.groq_api_key

    @property
    def llm_base_url(self) -> str:
        return self.groq_base_url

    @property
    def llm_model(self) -> str:
        return self.groq_model

    # ── Local embeddings (sentence-transformers — always free) ─────
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384

    # ── FAISS ─────────────────────────────────────────────────────
    faiss_index_dir: str = "/data/faiss_indices"
    faiss_nlist: int = 100

    # ── PostgreSQL ─────────────────────────────────────────────────
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "dociq"
    db_user: str = "dociq"
    db_pass: str

    @property
    def db_url(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"

    # ── Kafka ──────────────────────────────────────────────────────
    kafka_brokers: str = "localhost:9092"
    kafka_ingestion_topic: str = "doc.ingestion"
    kafka_query_topic: str = "doc.query"
    kafka_status_topic: str = "doc.status"
    kafka_group_id: str = "dociq-python-group"

    # ── Redis ──────────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # ── Chunking ───────────────────────────────────────────────────
    chunk_max_tokens: int = 512
    chunk_overlap_tokens: int = 50

    # ── RAG ────────────────────────────────────────────────────────
    top_k_chunks: int = 10
    faithfulness_threshold: float = 0.7
    num_rewrite_queries: int = 3

    # ── Java API (for callbacks) ───────────────────────────────────
    java_api_url: str = "http://localhost:8080"


@lru_cache
def get_settings() -> Settings:
    return Settings()
