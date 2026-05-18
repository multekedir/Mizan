.DEFAULT_GOAL := help

BACKEND_PORT ?= 8000
SERVE_PORT   ?= 3000
VITE_PORT    ?= 5173
BACKEND_HOST ?= 127.0.0.1

.PHONY: help install build dev dev-ui start start-backend start-frontend stop kiosk-setup kiosk-cleanup

help:
	@echo ""
	@echo "  Mizan"
	@echo ""
	@echo "  Ports (override: make dev-ui VITE_PORT=5174)"
	@echo "    Frontend (dev)   $(VITE_PORT)     make dev-ui  or  npm run dev"
	@echo "    Frontend (prod)  $(SERVE_PORT)     make start / make start-frontend"
	@echo "    Backend (API)    $(BACKEND_PORT)     make dev / make start-backend"
	@echo ""
	@echo "  Development"
	@echo "    make dev              API only on :$(BACKEND_PORT) (not the UI — use dev-ui or start)"
	@echo "    make dev-ui           Vite UI on :$(VITE_PORT) (run make dev in another terminal for AI)"
	@echo "    make install          install frontend dependencies"
	@echo "    make build            build frontend"
	@echo ""
	@echo "  Production"
	@echo "    make start            UI :$(SERVE_PORT) + API :$(BACKEND_PORT)"
	@echo "    make start-backend    start backend only"
	@echo "    make start-frontend   build + start frontend only"
	@echo "    make stop             stop all running processes"
	@echo ""
	@echo "  Kiosk (run on the kiosk host)"
	@echo "    make kiosk-setup      install + configure kiosk (requires sudo)"
	@echo "    make kiosk-cleanup    remove legacy services and files (requires sudo)"
	@echo ""

dev:
	@echo ""
	@echo "  Mizan API  →  http://$(BACKEND_HOST):$(BACKEND_PORT)"
	@echo "  (UI is not started — open http://localhost:$(VITE_PORT) after: make dev-ui)"
	@echo ""
	cd backend && BACKEND_HOST=$(BACKEND_HOST) BACKEND_PORT=$(BACKEND_PORT) ./dev.sh

dev-ui:
	@echo ""
	@echo "  Listening on port $(VITE_PORT)"
	@echo "  Mizan UI  →  http://localhost:$(VITE_PORT)"
	@echo "  (API: run make dev in another terminal on port $(BACKEND_PORT))"
	@echo ""
	VITE_PORT=$(VITE_PORT) npm run dev -- --port $(VITE_PORT)

install:
	npm ci

build:
	npm run build

start:
	@echo ""
	@echo "  Mizan deploy  →  UI http://$(BACKEND_HOST):$(SERVE_PORT)  |  API http://$(BACKEND_HOST):$(BACKEND_PORT)"
	@echo ""
	SERVE_PORT=$(SERVE_PORT) BACKEND_PORT=$(BACKEND_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh

start-backend:
	@echo ""
	@echo "  Mizan API  →  http://$(BACKEND_HOST):$(BACKEND_PORT)"
	@echo ""
	BACKEND_PORT=$(BACKEND_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh --backend

start-frontend:
	@echo ""
	@echo "  Mizan UI  →  http://$(BACKEND_HOST):$(SERVE_PORT)"
	@echo ""
	SERVE_PORT=$(SERVE_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh --frontend

stop:
	./deploy.sh --stop

kiosk-setup:
	sudo ./setup-mizan-kiosk.sh

kiosk-cleanup:
	sudo ./scripts/cleanup-mizan-old-files.sh
