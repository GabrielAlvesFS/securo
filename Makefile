# Securo — atalhos locais.
# Este arquivo NÃO existe no upstream (securo-finance/securo), é local.
# Ver SECURITY-AUDIT.md e ANTES-DE-CONECTAR-BANCO.md.

SHELL := /bin/bash
DC    := docker compose
DCP   := docker compose -f docker-compose.prod.yml
s     ?= backend
n     ?=

.DEFAULT_GOAL := help
.PHONY: help up down stop restart rebuild ps logs logs-all health urls \
        shell shell-front psql redis-cli dbdump \
        migrate migrate-down migration migration-chain revision \
        test test-front lint-front typecheck test-back \
        check-env check-upstream check-egress audit \
        prod-up prod-down prod-logs nuke

help: ## Lista os comandos disponíveis
	@echo ""
	@echo "  Securo — comandos locais"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Variáveis:  s=<serviço> (logs/shell)   n=<nome> (migration)"
	@echo ""

# ── Ciclo de vida ───────────────────────────────────────────────────────────

up: ## Sobe tudo (constrói se necessário)
	$(DC) up -d --build
	@$(MAKE) --no-print-directory health

down: ## Para os containers (PRESERVA o banco)
	$(DC) down

stop: ## Pausa sem remover os containers
	$(DC) stop

restart: ## Reinicia um serviço (s=backend)
	$(DC) restart $(s)

rebuild: ## Reconstrói do zero, sem cache de camada
	$(DC) build --no-cache
	$(DC) up -d

ps: ## Estado dos containers
	@$(DC) ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}\t{{.Ports}}'

logs: ## Segue os logs de um serviço (s=backend)
	$(DC) logs -f $(s)

logs-all: ## Segue os logs de todos os serviços
	$(DC) logs -f

health: ## Checa se a API e o frontend respondem
	@printf '  backend  '; curl -sf -m 5 http://localhost:8000/api/health >/dev/null \
	  && echo "OK   http://localhost:8000" || echo "FORA"
	@printf '  frontend '; curl -sf -m 5 -o /dev/null http://localhost:3000/ \
	  && echo "OK   http://localhost:3000" || echo "FORA"

urls: ## Mostra as URLs da aplicação
	@echo "  App:     http://localhost:3000"
	@echo "  API:     http://localhost:8000/api/health"
	@echo "  Swagger: http://localhost:8000/api/docs"

# ── Acesso interativo ───────────────────────────────────────────────────────

shell: ## Shell dentro do container backend
	$(DC) exec backend bash

shell-front: ## Shell dentro do container frontend
	$(DC) exec frontend sh

psql: ## Console do Postgres
	$(DC) exec db psql -U postgres -d securo

redis-cli: ## Console do Redis
	$(DC) exec redis redis-cli

dbdump: ## Dump do banco para ./backup-<data>.sql
	@f=backup-$$(date +%Y%m%d-%H%M%S).sql; \
	$(DC) exec -T db pg_dump -U postgres securo > $$f && echo "  gravado: $$f"

# ── Migrations (Alembic) ────────────────────────────────────────────────────

migrate: ## Aplica as migrations pendentes
	$(DC) exec backend alembic upgrade head

migrate-down: ## Reverte UMA migration
	$(DC) exec backend alembic downgrade -1

revision: ## Mostra a revisão atual
	@$(DC) exec backend alembic current

migration: ## Cria migration autogerada (n="descrição")
	@test -n "$(n)" || { echo "  uso: make migration n=\"descrição\""; exit 1; }
	$(DC) exec backend alembic revision --autogenerate -m "$(n)"

migration-chain: ## Valida a cadeia de revisões do Alembic
	@python3 backend/scripts/check_migration_chain.py && echo "  cadeia OK"

# ── Qualidade ───────────────────────────────────────────────────────────────
# O frontend roda tudo no container. O backend NÃO: a imagem é runtime-only
# (o Dockerfile exporta uv.lock sem --all-extras), então pytest/ruff/ty não
# existem lá dentro. Ver alvo test-back.

test: test-front ## Roda os testes que rodam no container (frontend)

test-front: ## Testes do frontend (vitest)
	$(DC) exec frontend npm run test

lint-front: ## ESLint no frontend
	$(DC) exec frontend npm run lint

typecheck: ## Type-check do frontend
	$(DC) exec frontend npm run typecheck

test-back: ## Testes do backend (exige venv local — ver mensagem)
	@echo "  A imagem do backend é runtime-only: não tem pytest/ruff/ty."
	@echo "  Para rodar a suíte do backend, monte o ambiente local:"
	@echo ""
	@echo "    curl -LsSf https://astral.sh/uv/install.sh | sh   # se não tiver uv"
	@echo "    cd backend && uv sync --all-extras"
	@echo "    uv run pytest --cov=app --cov-report=term-missing"
	@echo ""
	@echo "  (é o mesmo que backend/mise.toml define em [tasks.test])"

# ── Verificações de segurança ───────────────────────────────────────────────

check-env: ## Confere se os segredos do .env não são os defaults (não imprime valores)
	@test -f .env || { echo "  .env não existe"; exit 1; }
	@for k in SECRET_KEY AGENTS_MCP_JWT_SECRET; do \
	  line=$$(grep -E "^$$k=" .env | head -1); \
	  if [ -z "$$line" ]; then echo "  $$k: AUSENTE"; continue; fi; \
	  v=$${line#*=}; n=$${#v}; \
	  case "$$v" in *change-in-production*|change-me*|"") echo "  $$k: !! DEFAULT/FRACO";; \
	    *) if [ $$n -lt 32 ]; then echo "  $$k: !! curto ($$n chars)"; \
	       else echo "  $$k: ok ($$n chars)"; fi;; esac; \
	done
	@git check-ignore -q .env && echo "  .env: ignorado pelo git ok" || echo "  .env: !! NÃO IGNORADO"

check-upstream: ## Confere se o fork continua idêntico ao upstream
	@git remote get-url upstream >/dev/null 2>&1 \
	  || { echo "  remote 'upstream' ausente. Rode:"; \
	       echo "    git remote add upstream https://github.com/securo-finance/securo.git"; exit 1; }
	@git fetch -q upstream main
	@if [ -z "$$(git diff upstream/main...HEAD)" ]; then \
	  echo "  idêntico ao upstream/main ok"; \
	else \
	  echo "  DIVERGE do upstream — arquivos alterados:"; \
	  git diff --stat upstream/main...HEAD; \
	fi

check-egress: ## Mostra quais destinos externos estão ATIVOS na config atual
	@echo "  Destinos externos habilitados pela configuração atual:"
	@f() { v=$$(grep -E "^$$1=" .env 2>/dev/null | head -1); v=$${v#*=}; echo "$$v"; }; \
	  [ -n "$$(f PLUGGY_CLIENT_ID)" ] && echo "    ATIVO    api.pluggy.ai (sync bancário)" || echo "    inativo  Pluggy"; \
	  [ -n "$$(f ENABLE_BANKING_APP_ID)" ] && echo "    ATIVO    api.enablebanking.com" || echo "    inativo  Enable Banking"; \
	  [ "$$(f SIMPLEFIN_ENABLED)" = "true" ] && echo "    ATIVO    bridge.simplefin.org + google.com/s2/favicons" || echo "    inativo  SimpleFIN (e o favicon do Google)"; \
	  [ -n "$$(f OPENEXCHANGERATES_APP_ID)" ] && echo "    ATIVO    openexchangerates.org" || echo "    inativo  OpenExchangeRates"; \
	  [ "$$(f TESOURO_DIRETO_ENABLED)" = "false" ] && echo "    inativo  tesourotransparente.gov.br" || echo "    ATIVO    tesourotransparente.gov.br"; \
	  [ "$$(f AGENTS_ENABLED)" = "true" ] && echo "    ATIVO    provedor de LLM configurado" || echo "    inativo  AI Agents (nenhum LLM)"
	@n=$$($(DC) exec -T db psql -U postgres -d securo -tAc \
	  "select count(*) from assets where valuation_method='market_price' and ticker is not null" 2>/dev/null || echo "?"); \
	  if [ "$$n" = "0" ]; then echo "    inativo  Yahoo Finance (0 ativos com ticker)"; \
	  else echo "    ATIVO    Yahoo Finance + google.com/s2/favicons ($$n ativos com ticker)"; fi
	@echo "  Sempre ativos: fonts.googleapis.com (SPA), api.github.com (update check 6h)"

audit: check-env check-upstream ## Roda as verificações de segurança
	@echo ""
	@echo "  Lembrete: antes de conectar Pluggy/Enable Banking, leia"
	@echo "  ANTES-DE-CONECTAR-BANCO.md (o mount ./:/workspace do compose de dev)."

# ── Produção ────────────────────────────────────────────────────────────────

prod-up: ## Sobe com o compose de produção (imagem ghcr, NÃO auditada)
	@echo "  Atenção: puxa ghcr.io/securo-finance/securo-backend:latest,"
	@echo "  imagem pré-construída que não passou pela auditoria do fonte."
	@read -p "  Continuar? [y/N] " a; [ "$$a" = "y" ] || exit 1
	$(DCP) up -d

prod-down: ## Para o stack de produção
	$(DCP) down

prod-logs: ## Logs do stack de produção
	$(DCP) logs -f

# ── Destrutivo ──────────────────────────────────────────────────────────────

nuke: ## APAGA containers E o banco (pede confirmação)
	@echo "  Isto remove os volumes: TODO o banco de dados será perdido."
	@read -p "  Digite 'apagar' para confirmar: " a; [ "$$a" = "apagar" ] || { echo "  cancelado"; exit 1; }
	$(DC) down -v
