<div align="center">

# 🧠 DocIQ — AI Document Intelligence Platform

**Production-grade RAG platform for intelligent document analysis**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Java](https://img.shields.io/badge/Java-17-orange)](https://openjdk.org/projects/jdk/17/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)](https://docker.com)

</div>

---

## 🏆 What is DocIQ?

DocIQ is a **production-grade, polyglot AI document intelligence platform** that lets users upload PDFs and have deep, cited conversations with them. Built with a Java Spring Boot API gateway, a Python ML service for RAG pipelines, and a React chat UI.

### ✨ Standout Features

| Feature | Description |
|---|---|
| 🤖 **AI Smart Summary** | Auto-generated executive summary, key topics, complexity rating, and 5 suggested questions on every document |
| 🔍 **Query Rewriting** | Each question spawns 3 LLM-rewritten sub-queries for maximum recall |
| 📊 **Faithfulness Scoring** | Every answer is graded 0–1 for groundedness in the document; low-confidence answers are replaced with honest fallbacks |
| 📄 **Citation Highlighting** | Click any retrieved chunk to jump to the exact page in the PDF viewer |
| 🧬 **Semantic Document Diff** | Compare two PDFs with LLM-described section-by-section semantic changes (ADDED/MODIFIED/REMOVED) |
| 📚 **Multi-Document Q&A** | Ask one question across up to 5 documents simultaneously and get per-doc answers + a synthesized cross-document answer |
| 💬 **Export Chat** | Download any chat session as `.md` or `.json` |
| 📈 **Real Analytics** | Faithfulness trend, P50/P95 latency, queries/day from live PostgreSQL data |
| 🔄 **Streaming Tokens** | Answer tokens stream live via Kafka → WebSocket STOMP |
| 🛡️ **JWT Auth** | Secure multi-user, with refresh tokens |


## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React UI (Vite + TypeScript + TailwindCSS)              │
│  Port 3000                                               │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP + WebSocket (STOMP/SockJS)
┌──────────────────────▼──────────────────────────────────┐
│  Java Spring Boot API Gateway                           │
│  Port 8080 — Auth, Upload, Query dispatch, WebSocket    │
└───────┬──────────────────────────────────┬──────────────┘
        │ Kafka (doc.ingestion/doc.query)   │ HTTP (SSE)
┌───────▼──────────────────────────────────▼──────────────┐
│  Python FastAPI ML Service  (Port 8000)                 │
│  FAISS · sentence-transformers · Groq LLaMA 3.3 70B     │
└───────┬─────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────┐
│  Infrastructure                                          │
│  PostgreSQL 16 · Kafka 7.5 · Redis 7 · Zookeeper        │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- OpenAI API key

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/dociq.git
cd dociq
cp .env.example .env
```

Edit `.env` — the only **required** field is your OpenAI key:
```env
OPENAI_API_KEY=sk-...
```

All other values have sensible defaults for local development.

### 2. Launch Everything

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

This starts: PostgreSQL, Zookeeper, Kafka, Redis, Java API, Python ML, React UI.

| Service | URL |
|---|---|
| **React UI** | http://localhost:3001 |
| **Java API** | http://localhost:8081 |
| **Python ML** | http://localhost:8000 |
| **Kafka UI** | http://localhost:8091 |
| **API Docs** | http://localhost:8080/swagger-ui.html |

### 3. Register & Upload

1. Navigate to http://localhost:3001
2. Register an account
3. Upload any PDF (up to 100MB)
4. Watch real-time ingestion progress via WebSocket
5. Chat with your document — an AI summary and suggested questions appear automatically

---

## 📁 Project Structure

```
dociq/
├── java-api/                    # Spring Boot API gateway
│   └── src/main/java/com/dociq/
│       ├── api/                 # REST controllers + services
│       ├── auth/                # JWT auth
│       ├── kafka/               # Producers & consumers
│       ├── storage/             # JPA entities + repositories
│       └── websocket/           # STOMP WebSocket handlers
│
├── python-ml/                   # FastAPI ML service
│   └── app/
│       ├── ingestion.py         # PDF → chunks → FAISS
│       ├── retrieval.py         # Query rewriting + FAISS search
│       ├── llm.py               # Streaming answers + faithfulness
│       ├── diff.py              # Semantic document diff
│       ├── kafka_consumer.py    # Async event processing
│       └── main.py              # FastAPI app + all endpoints
│
├── react-ui/                    # Vite + React + TypeScript
│   └── src/
│       ├── pages/               # Upload, Chat, Diff, Analytics, MultiDoc
│       ├── components/          # PDF viewer, Chat, Debug, SmartSummary
│       ├── hooks/               # WebSocket, polling hooks
│       └── lib/api.ts           # Axios API client
│
├── infra/
│   └── docker-compose.yml       # Full stack definition
│
├── .env.example                 # Environment template
└── .github/workflows/ci.yml    # CI/CD pipeline
```

---

## 🔌 API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Get JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |

### Documents
| Method | Path | Description |
|---|---|---|
| POST | `/api/documents/upload` | Upload PDF (multipart) |
| GET | `/api/documents/{id}/status` | Poll processing status |
| GET | `/api/documents/{id}/file` | Stream PDF for viewer |
| GET | `/api/documents` | List all documents |
| DELETE | `/api/documents/{id}` | Delete document |
| POST | `/api/documents/diff` | Semantic diff two docs |

### Querying
| Method | Path | Description |
|---|---|---|
| POST | `/api/query` | Submit question (async, streams via WS) |
| GET | `/api/queries/history` | Past queries with faithfulness scores |

### Smart Features
| Method | Path | Description |
|---|---|---|
| GET | `/api/smart/summary/{docId}` | AI summary + key topics + suggested questions |
| POST | `/api/smart/multi-query` | Question across multiple documents |

### Analytics
| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/summary` | Daily faithfulness, latency P50/P95, query volume |

### WebSocket Subscriptions (STOMP)
| Topic | When |
|---|---|
| `/topic/documents/{id}/status` | Document processing status updates |
| `/topic/queries/{id}/stream` | Streaming answer tokens |

---

## 🧪 Running Evals

```bash
cd python-ml
pip install -e ".[dev]"

# Run the eval suite (50 Q&A pairs)
python -m evals.eval_runner

# Expected output:
# precision@3: 0.82  ✅ (target: > 0.70)
# avg_faithfulness: 0.87  ✅ (target: > 0.80)
# p50_latency: 1240ms
# p95_latency: 3100ms
```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ | — | Free Groq API key (console.groq.com) |
| `GROQ_MODEL` | | `llama-3.3-70b-versatile` | Groq model to use |
| `DB_PASS` | | `dociq_secret` | PostgreSQL password |
| `JWT_SECRET` | | auto | JWT signing secret (change in production!) |
| `DB_HOST` | | `localhost` | PostgreSQL host |
| `KAFKA_BROKERS` | | `localhost:9092` | Kafka bootstrap servers |
| `REDIS_HOST` | | `localhost` | Redis host |
| `UPLOAD_DIR` | | `/uploads` | PDF storage path |
| `FAISS_INDEX_DIR` | | `/data/faiss_indices` | FAISS index storage |

---

## 🧬 How RAG Works in DocIQ

1. **Upload** — PDF saved to disk, Kafka message published
2. **Parse** — PyMuPDF extracts text per page with block positions
3. **Chunk** — Paragraph-aware chunking, max 512 tokens, 50-token overlap
4. **Embed** — `sentence-transformers/all-MiniLM-L6-v2` (local, no API cost)
5. **Index** — FAISS IVF flat index per document
6. **Query rewriting** — LLM generates 3 alternative sub-queries
7. **Retrieval** — FAISS searched for all sub-queries, deduplicated, top-5 returned
8. **Generation** — Groq LLaMA 3.3 70B streams answer grounded in retrieved chunks
9. **Faithfulness check** — Post-generation LLM scores answer 0–1 vs context
10. **Low confidence guard** — Score < 0.7 → replaced with honest fallback

---

## 🎯 MLH / Hackathon Highlights

- **Polyglot microservices** — Java for reliability/auth/gateway, Python for ML flexibility
- **Event-driven** — Kafka decouples ingestion from serving; handles large PDFs without blocking
- **Production-grade** — Flyway migrations, JWT refresh, health checks, structured logging (structlog), Prometheus metrics
- **Eval-driven** — Ships with a 50-question eval harness and CI assertions on faithfulness
- **Real-time** — WebSocket streaming for both ingestion progress and answer tokens
- **Smart Summary** — Unique UX win: AI overview + suggested questions appear instantly after upload
- **Multi-doc Q&A** — Rare feature: synthesized answers across multiple documents

---

## 📄 License

MIT © 2024 DocIQ
