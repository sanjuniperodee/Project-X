# Convenience commands. Every package is independent: these targets just loop over them.
SHARED   := shared/contracts shared/service-kit
SERVICES := services/catalog services/gateway services/projects services/payments services/media services/ai
APPS     := $(SERVICES) frontend
ALL      := $(SHARED) $(APPS)

.PHONY: install typecheck test build up down infra

install: ## Install dependencies of every package
	@for p in $(ALL); do echo "→ $$p"; (cd $$p && npm install --no-audit --no-fund) || exit 1; done

typecheck: ## Type-check every package
	@for p in $(ALL); do echo "→ $$p"; (cd $$p && npm run typecheck) || exit 1; done

test: ## Run tests (integration tests need Postgres: `make infra`)
	@for p in shared/contracts $(SERVICES); do echo "→ $$p"; (cd $$p && npm test) || exit 1; done

build: ## Build every service bundle and the frontend
	@for p in $(APPS); do echo "→ $$p"; (cd $$p && npm run build) || exit 1; done

infra: ## Start only Postgres and NATS for local development
	docker compose up -d postgres nats

up: ## Build and start the whole stack
	docker compose up --build -d

down:
	docker compose down
