.DEFAULT_GOAL := help

BACKEND_PORT ?= 8000
SERVE_PORT   ?= 3000
BACKEND_HOST ?= 127.0.0.1

.PHONY: help install build dev start start-backend start-frontend stop kiosk-setup kiosk-cleanup

help:
	@echo ""
	@echo "  Mizan"
	@echo ""
	@echo "  Development"
	@echo "    make dev              start backend with hot-reload (localhost:8000)"
	@echo "    make install          install frontend dependencies"
	@echo "    make build            build frontend"
	@echo ""
	@echo "  Production"
	@echo "    make start            build + start frontend and backend"
	@echo "    make start-backend    start backend only"
	@echo "    make start-frontend   build + start frontend only"
	@echo "    make stop             stop all running processes"
	@echo ""
	@echo "  Kiosk (run on the kiosk host)"
	@echo "    make kiosk-setup      install + configure kiosk (requires sudo)"
	@echo "    make kiosk-cleanup    remove legacy services and files (requires sudo)"
	@echo ""

dev:
	cd backend && ./dev.sh

install:
	npm ci

build:
	npm run build

start:
	SERVE_PORT=$(SERVE_PORT) BACKEND_PORT=$(BACKEND_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh

start-backend:
	BACKEND_PORT=$(BACKEND_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh --backend

start-frontend:
	SERVE_PORT=$(SERVE_PORT) BACKEND_HOST=$(BACKEND_HOST) \
	  ./deploy.sh --frontend

stop:
	./deploy.sh --stop

kiosk-setup:
	sudo ./setup-mizan-kiosk.sh

kiosk-cleanup:
	sudo ./scripts/cleanup-mizan-old-files.sh
