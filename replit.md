# Samuga AI

Centralized data-collecting master backend and admin control system for an ecosystem of external Python bots and HTML frontends. Acts as the core data warehouse, orchestration hub, and admin console for the Samuga AI ecosystem.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/samuga-admin run dev` — run the admin dashboard (port 26195)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — Secret for admin session cookies
- Required env: `ADMIN_USERNAME` — Admin login username
- Required env: `ADMIN_PASSWORD` — Admin login password
- Optional env: `OPENAI_API_KEY` — Enables the AI Analyzer feature

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + express-session (session-based auth)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + Recharts + Wouter

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (system_logs, user_analytics, system_configs, api_keys)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, logs, analytics, configs, api-keys, ai, dashboard)
- `artifacts/api-server/src/middlewares/` — session-auth.ts (admin), api-key-auth.ts (external bots)
- `artifacts/samuga-admin/src/` — React admin dashboard

## Architecture decisions

- **API key auth for ingestion**: External bots send `X-Api-Key` header; key is SHA-256 hashed and compared to stored hash (never stored in plaintext).
- **Session auth for admin**: Admin login uses `express-session` with `SESSION_SECRET`. No JWT — sessions are revoked server-side on logout.
- **Fail-fast credentials**: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` throw at module load if missing — no insecure fallback defaults.
- **OpenAPI-first**: All API contracts defined in `openapi.yaml`, codegen produces React Query hooks + Zod schemas automatically.
- **AI is optional**: The `/v1/ai/analyze` endpoint returns 503 if `OPENAI_API_KEY` is not set, so the rest of the system runs without AI.

## Product

- **Login**: Secure session-based admin authentication
- **Dashboard**: Live charts — log ingestion rates, log levels (pie), hourly activity (line), platform breakdown (bar)
- **Logs Explorer**: Searchable, filterable table of all system logs from external repos
- **Analytics**: User telemetry table with expandable JSON payload viewer
- **Remote Control Panel**: Config key-value editor with "Push to Webhook" button to update external bots instantly
- **API Keys**: Create/revoke keys for external bots; full key shown once at creation
- **AI Analyzer**: Text analysis (summarize / classify / reply) powered by OpenAI when configured

## External bot integration

External bots must:
1. Obtain an API key from the admin dashboard → API Keys section
2. Send `X-Api-Key: <key>` header on every request
3. `POST /api/v1/logs` with `{ source_repo, log_level, message }`
4. `POST /api/v1/telemetry` with `{ platform, user_identifier, action_performed, data_payload? }`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/db/src/schema/index.ts`, run `pnpm run typecheck:libs` before typechecking artifacts — stale declarations cause false TS2305 errors.
- The `samuga-admin` frontend must include `WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}` for base-path-aware routing in deployment.
- Dashboard stats use Drizzle `sql` template only on static column references — no user input is interpolated.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
