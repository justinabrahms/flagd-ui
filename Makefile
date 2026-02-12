.PHONY: dev dev-backend dev-frontend build clean

# Run both backend and frontend in dev mode.
# In two terminals:
#   make dev-backend FLAG_DIR=/path/to/flagd-config
#   make dev-frontend
dev-backend:
	go run ./cmd/flagd-ui -flag-dir $(FLAG_DIR) -dev-proxy http://localhost:5173

dev-frontend:
	cd frontend && npx vite --port 5173

# Production build: compile frontend, embed in Go binary.
build: web/dist
	go build -o flagd-ui ./cmd/flagd-ui

web/dist: frontend/dist
	rm -rf web/dist
	cp -r frontend/dist web/dist

frontend/dist: $(shell find frontend/src -type f) frontend/package.json frontend/index.html
	cd frontend && npm run build

clean:
	rm -rf flagd-ui frontend/dist web/dist
	mkdir -p web/dist && touch web/dist/.gitkeep
