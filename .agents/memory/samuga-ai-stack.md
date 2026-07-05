---
name: Samuga AI stack decisions
description: Auth pattern, env var enforcement, and AI integration choices for Samuga AI project
---

## Auth pattern
- Admin dashboard: express-session with SESSION_SECRET. Stored as `req.session.adminUser`. Revoked server-side on logout.
- External bots: X-Api-Key header. Key SHA-256 hashed; hash stored in api_keys.key_hash. Raw key shown only once at creation.
- All three env vars (SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD) throw at module-load if missing — no fallback defaults.

**Why:** Hardcoded credential fallbacks create backdoors in misconfigured deployments. Fail-fast is safer and surfaces config errors immediately.

**How to apply:** Any new auth env var must throw at startup if missing, not use `?? default_value`.

## AI is optional
- `/v1/ai/analyze` returns 503 if OPENAI_API_KEY not set. Uses raw fetch to OpenAI API (no SDK). Model: gpt-4o-mini.
- No Replit AI Integrations (user declined upgrade).

**Why:** User didn't have credits for Replit AI; their own key is optional. System must run fully without AI.

## WouterRouter base path
- samuga-admin App.tsx must wrap Router in `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>`.
- Design subagent stripped this; had to re-add it post-build.

**Why:** Without base, routes break in non-root deployments.

## Hub self-telemetry (api-server → Data Master Hub ingest)
- Env vars: `SAMUGA_OS_INGEST_URL`, `SAMUGA_OS_INGEST_KEY`, `PROJECT_NAME` (all read at call-time, never at module load).
- Silent no-op in dev (vars absent). Never throws. 5s AbortSignal.timeout.
- Lifecycle events: `service_started` (startup), `service_stopped` (SIGTERM/SIGINT), `hub_integration_test` (3s after start, timer stored + cleared on shutdown).
- Per-request metrics in app.ts middleware: `requests_handled`, `response_time_ms`, `successful_actions`, `failed_actions` (5xx only).
- Per-ingest metrics in ingest.ts: `items_ingested`, `{events/metrics/conversations/visits}_ingested`, `ingest_duration_ms`, `articles_processed` (events), `articles_published` (metrics).
- SSE queue size in live.ts: `queue_size` metric emitted on every connect/disconnect.

**Why:** Hub needs to monitor its own health. Metrics map "articles processed/published" concepts to ingest operations.
