# flagd-ui

A management interface for [flagd](https://flagd.dev), the CNCF OpenFeature-aligned feature flag daemon.

## Overview

flagd-ui ships in two tiers:

- **flagd-ui (free, open source):** Read-only dashboard for observing feature flag state, browsing configurations, and viewing audit history. Apache 2.0.
- **flagd-ui Pro (commercial):** Write layer adding flag creation/editing, targeting rules, RBAC, GitOps commit-back, and approval workflows.

## Architecture

- **Backend:** Go — single binary with embedded frontend via `embed.FS`
- **Frontend:** React + Vite
- **Database:** Embedded SQLite (pure Go, no CGo) for audit log, accounts, RBAC
- **Flag Source:** Reads flagd config files directly (local filesystem or git repo)

## Development

```bash
# Prerequisites: Go 1.22+, Node.js 20+

# Backend
go run ./cmd/flagd-ui

# Frontend (dev mode)
cd frontend && npm install && npm run dev
```

## Status

Phase 1 — Free Read UI (in progress)

## License

Apache 2.0 (free tier). BSL (Pro tier).
