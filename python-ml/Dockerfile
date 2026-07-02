# ── Stage 1: Dependencies ─────────────────────────────────────
FROM python:3.11-slim AS deps
WORKDIR /install

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Stage 2: Model pre-download ───────────────────────────────
FROM deps AS model-download
# Pre-download sentence-transformers model during build (caches in image)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
# Pre-download the tiktoken cl100k_base BPE file during build too, for the
# same reason: without this it's fetched from an external Azure blob the
# first time a document is ingested, which fails outright in any runtime
# environment without egress to openaipublic.blob.core.windows.net.
# tiktoken caches to $TMPDIR by default (not ~/.cache), which would be lost
# once this build stage exits, so it's pointed at a path under /root/.cache
# that the runtime stage already copies below.
ENV TIKTOKEN_CACHE_DIR=/root/.cache/tiktoken
RUN python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

# ── Stage 3: Runtime ──────────────────────────────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: non-root user
RUN addgroup --system dociq && adduser --system --group dociq

# Copy installed packages + pre-downloaded models
COPY --from=model-download /root/.local /home/dociq/.local
COPY --from=model-download /root/.cache /home/dociq/.cache

# Copy application code
COPY app ./app
COPY evals ./evals

# Create data directories
RUN mkdir -p /data/faiss_indices /uploads && chown -R dociq:dociq /data /uploads /app /home/dociq

USER dociq
ENV PATH="/home/dociq/.local/bin:${PATH}"
ENV HOME="/home/dociq"
ENV TIKTOKEN_CACHE_DIR="/home/dociq/.cache/tiktoken"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--log-level", "info"]
