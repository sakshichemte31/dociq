# DocIQ Platform Makefile
.PHONY: up down build logs ps clean eval test

## ── Docker ───────────────────────────────────────────────────

up: ## Start all services
	docker compose -f infra/docker-compose.yml up -d --build

dev: ## Start everything for local dev — backend in Docker, React UI hot-reloading on :3001
	docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build

down: ## Stop all services
	docker compose -f infra/docker-compose.yml down

down-v: ## Stop all services and remove volumes (full reset)
	docker compose -f infra/docker-compose.yml down -v

build: ## Build all images without starting
	docker compose -f infra/docker-compose.yml build

logs: ## Tail logs for all services
	docker compose -f infra/docker-compose.yml logs -f

ps: ## Show service status
	docker compose -f infra/docker-compose.yml ps

## ── Development ──────────────────────────────────────────────

java-logs: ## Tail Java API logs
	docker logs dociq-java-api -f

python-logs: ## Tail Python ML logs
	docker logs dociq-python-ml -f

ui-logs: ## Tail React UI logs
	docker logs dociq-react-ui -f

## ── Evals ────────────────────────────────────────────────────

eval: ## Run RAG evaluation suite
	cd python-ml && python -m evals.eval_runner

## ── Tests ────────────────────────────────────────────────────

test-java: ## Run Java unit tests
	cd java-api && mvn test -q

test-python: ## Run Python tests
	cd python-ml && python -m pytest tests/ -v

## ── Cleanup ──────────────────────────────────────────────────

clean: ## Remove build artifacts
	cd java-api && mvn clean -q
	cd react-ui && rm -rf dist node_modules

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
