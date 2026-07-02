# ⚡ Quick Setup Guide

## 1-minute setup for judges

### Prerequisites
- Docker Desktop (with Compose v2)
- Groq API key (free — https://console.groq.com)

### Steps

```bash
# 1. Copy env file
cp .env.example .env

# 2. Set your Groq key — FREE, no credit card required
#    Sign up at https://console.groq.com → API Keys → Create key
echo "GROQ_API_KEY=gsk_YOUR_KEY_HERE" >> .env

# Optional: change the model (default llama-3.3-70b-versatile is the best free option)
# echo "GROQ_MODEL=mixtral-8x7b-32768" >> .env

# 3. Start everything
docker compose -f infra/docker-compose.yml up -d --build

# 4. Wait ~2 minutes for all services to be ready
docker compose -f infra/docker-compose.yml ps

# 5. Open the app
open http://localhost:3000
```

### Ports
- **App UI**: http://localhost:3000
- **Java API + Swagger**: http://localhost:8080/swagger-ui.html  
- **Python ML health**: http://localhost:8000/health
- **Kafka UI**: http://localhost:8091 (if this port is also taken, set `KAFKA_UI_PORT=<port>` in your `.env`)

### First steps to demo

> 💡 **No sample PDF is bundled in this repo.** Before your demo/judging slot, drop a short PDF (a paper, contract, or article — 5–15 pages works well) somewhere handy so you're not hunting for a file live. Bundling one in `/samples` and linking it in this doc is a quick win.

1. Register an account at http://localhost:3000
2. Upload any PDF (try a research paper or contract)
3. See the **AI Smart Summary** appear with suggested questions
4. Ask questions — notice streaming tokens, faithfulness score badge, and citation highlighting
5. Try **Multi-Doc Q&A** with 2+ uploaded docs
6. Try **Semantic Diff** to compare two versions of a document
7. Check **Analytics** after a few queries

### Stopping
```bash
docker compose -f infra/docker-compose.yml down
```

### Resetting all data
```bash
docker compose -f infra/docker-compose.yml down -v
```

### Troubleshooting

**Python ML takes > 3 minutes to start?**  
Normal — it downloads the sentence-transformers model on first run. Check:
```bash
docker logs dociq-python-ml -f
```

**Java API fails health check?**  
Wait for PostgreSQL and Kafka to be fully ready:
```bash
docker logs dociq-java-api -f
```

**OpenAI errors?**  
Check your Groq API key is valid and the model is available:
```bash
docker logs dociq-python-ml | grep openai
```
