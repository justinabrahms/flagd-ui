# Recreating the flagd-ui demo

This document describes the flagd-ui demo setup in enough detail to recreate it from scratch. flagd-ui is a read-only management UI for [flagd](https://flagd.dev), a CNCF feature flag daemon.

## What the demo shows

A dark-themed web UI running at `http://localhost:9090` that displays 16 feature flags loaded from a local JSON file. The UI has two pages:

1. **Flag list** — a table of all flags with columns: Flag Key (linked), State (enabled/disabled badge), Type (boolean/string/number/object), Default variant, and Source filename. There's a search box and filter buttons (All / Enabled / Disabled).
2. **Flag detail** — clicking a flag shows: state, default variant, source file, a description pulled from metadata, a variants table, a targeting rules section (rendered as formatted JSON), and a collapsible metadata section.

The visual design is dark mode with these CSS variables:
- Background: `#0f1117`, Surface: `#1a1d27`, Border: `#2e3347`
- Text: `#e1e4ed`, Muted text: `#8b8fa7`
- Accent: `#6e7bf2`, Green (enabled): `#34d399`, Red (disabled): `#f87171`
- Fonts: Inter for body, JetBrains Mono for code

## Architecture

Single Go binary with an embedded React frontend.

- **Backend:** Go 1.24, standard library only (no external dependencies). The binary accepts `-flag-dir <path>` (required), `-addr <listen-address>` (default `:9090`), and `-dev-proxy <url>` (for development).
- **Frontend:** React 19, React Router 7, Vite 5, TypeScript 5.9. Built to static files, then embedded into the Go binary via `//go:embed`.
- **No database.** Flags are read from JSON files on disk at startup.

### How data flows

1. At startup, the Go binary reads all `.json` files in `-flag-dir` (and one level of subdirectories). Each file is expected to be a [flagd configuration file](https://flagd.dev/reference/flag-definitions/) with the structure `{"$schema": "...", "flags": {"key": {...}}}`.
2. Flags are parsed and held in memory (no re-reading after startup).
3. The React frontend fetches `GET /api/flags` (with optional `?q=` search and `?state=` filter query params) and `GET /api/flags/{key}` from the Go backend.
4. The frontend is served from the embedded filesystem. A SPA fallback routes all non-file paths to `index.html` for React Router.

### Project structure

```
cmd/flagd-ui/main.go          # Entry point, CLI flags, HTTP server setup
internal/api/handler.go        # GET /api/flags and GET /api/flags/{key}
internal/flagsource/reader.go  # Reads and parses flagd JSON config files
web/embed.go                   # //go:embed all:dist — embeds built frontend
web/dist/                      # Built frontend assets (populated by Makefile)
frontend/                      # React + Vite + TypeScript source
frontend/src/main.tsx           # React entry point
frontend/src/App.tsx            # Router: / -> FlagList, /flags/:key -> FlagDetail
frontend/src/api.ts             # fetchFlags() and fetchFlag() — calls /api/*
frontend/src/types.ts           # Flag and FlagListResponse TypeScript interfaces
frontend/src/pages/FlagList.tsx  # Flag list table with search and state filter
frontend/src/pages/FlagDetail.tsx # Single flag detail view
frontend/src/index.css          # Global styles and CSS variables
frontend/src/App.css            # Component styles (header, table, badges, etc.)
demo/flags.json                 # Sample flagd config with 16 flags
Makefile                        # build, dev-backend, dev-frontend, demo targets
```

## Demo flag data

The file `demo/flags.json` contains 16 flags that demonstrate different flag types and patterns. Here's what they are and why they were chosen:

### Boolean flags (simple on/off)
- **`new-checkout-flow`** — ENABLED, default `off`, with targeting: beta segment users get `on`. Shows conditional rollout.
- **`dark-mode`** — ENABLED, default `on`, no targeting. Shows a simple globally-enabled boolean.
- **`maintenance-banner`** — DISABLED, default `off`. Shows a disabled flag (circuit breaker pattern).
- **`enable-webhooks`** — ENABLED, default `on`. Shows a globally-on kill switch.
- **`ai-summarization`** — ENABLED, default `off`, targeting: premium/enterprise plans get `on`. Shows plan-based gating.
- **`notifications-v2`** — ENABLED, default `off`, with fractional targeting: 25% on, 75% off. Shows percentage rollout.
- **`beta-api-v3`** — DISABLED, default `off`. Shows a placeholder flag not yet active.

### String flags (multi-variant)
- **`pricing-experiment`** — ENABLED, 3 variants: `control`/`variant-a`/`variant-b`, fractional targeting 34/33/33. Shows A/B/C testing.
- **`search-algorithm`** — ENABLED, 2 variants: `elasticsearch`/`typesense`, targeting by region. Shows infrastructure migration flag.
- **`recommendation-engine`** — ENABLED, 3 variants, fractional 50/50 between two. Shows ML model A/B test.
- **`cdn-provider`** — ENABLED, 3 variants: `cloudflare`/`fastly`/`cloudfront`, default `cloudflare`. Shows failover control.
- **`signup-captcha`** — ENABLED, 3 variants: `none`/`recaptcha`/`turnstile`, default `turnstile`. Shows vendor selection.

### Number flags
- **`max-upload-size-mb`** — ENABLED, 3 variants: 25/100/500, targeting by plan tier with nested if/else. Shows tiered configuration.
- **`rate-limit-rps`** — ENABLED, 3 variants: 100/500/10000. Shows numeric configuration without targeting.

### Object flags (structured JSON values)
- **`onboarding-flow`** — ENABLED, 2 variants with object values containing `steps` array and `showProgressBar` boolean, targeting by signup source. Shows complex structured configuration.
- **`password-policy`** — ENABLED, 2 variants with objects specifying `minLength`, `requireUppercase`, `requireNumber`, `requireSpecial`, targeting regulated industries. Shows policy configuration.

All flags include `metadata` with `description` (shown in the UI detail view) and `owner` (team name).

The JSON file follows the flagd schema: `https://flagd.dev/schema/v0/flags.json`. Targeting rules use [JsonLogic](https://jsonlogic.com/) format, which is what flagd uses natively. Key operators used: `if`, `in`, `==`, `var`, `fractional`.

## Demo recording setup

The demo video is recorded using Playwright (headless Chromium) scripted in `demo/recording/record.mjs`.

### How it works

1. `make record-demo` builds the binary, starts it serving on `:9090` with `./demo` as the flag dir, then runs the recording script.
2. The script launches headless Chromium at 1280x800 with Playwright's `recordVideo` option.
3. It shows title cards (HTML pages rendered via `page.setContent()` with inline styles matching the app's theme), then navigates the live app with a scripted fake cursor.
4. The fake cursor is a CSS circle (`rgba(110, 123, 242, 0.55)` with accent-colored border) injected via `page.evaluate()`. It glides between elements using ease-in-out interpolation over ~40 steps.
5. Annotation pills (semi-transparent accent-colored labels) appear near elements to explain what's happening.
6. Playwright saves `.webm` video. ffmpeg converts to `.mp4` (H.264) with optional background music (`bg-music.mp3` at 15% volume, fade in 2s, fade out over last 3s).

### Recording script flow

1. Title card: "flagd-ui / A management UI for flagd" (3s)
2. Title card: "The problem / Teams manage flagd by editing YAML..." (3.5s)
3. Title card: "What if you had a UI?" (2s)
4. Navigate to app, wait for flag table to load
5. Annotation: "16 flags loaded from a local git checkout" (near flag count)
6. Type "checkout" into search box
7. Click `new-checkout-flow` link, view detail, scroll to targeting rules
8. Annotation: "Targeting rules — who sees what"
9. Navigate back, clear search
10. Click `pricing-experiment`, scroll to targeting
11. Annotation: "Percentage rollout — A/B/C test"
12. Navigate back
13. Click `password-policy`, scroll to variants (showing object-type values)
14. Navigate back
15. Click "disabled" filter button (shows 2 disabled flags)
16. Click "All" filter button
17. Title card: "flagd-ui / Free and open source. Pro tier adds editing, RBAC, and GitOps." (4.5s)

### Dependencies

- `playwright` (npm, in `demo/recording/package.json`)
- `ffmpeg` (system, for webm-to-mp4 conversion)
- Optional: `bg-music.mp3` in `demo/recording/` for background music

## How to run the demo locally

```bash
# Prerequisites: Go 1.24+, Node.js 20+

# Option 1: Build and run
make demo
# Opens at http://localhost:9090

# Option 2: Docker
docker build -t flagd-ui .
docker run --rm -p 9090:9090 -v $(pwd)/demo:/data flagd-ui -flag-dir /data

# Option 3: Development mode (hot reload)
# Terminal 1:
make dev-backend FLAG_DIR=./demo
# Terminal 2:
make dev-frontend
# Opens at http://localhost:5173 (proxies API to :9090)
```

## How to record the demo video

```bash
# Install Playwright and its browsers
cd demo/recording && npm install && npx playwright install chromium && cd ../..

# Record (builds the app, starts it, records, converts to mp4)
make record-demo
# Output: demo/recording/flagd-ui-demo.mp4
```
