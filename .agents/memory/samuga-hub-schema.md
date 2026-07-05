---
name: Samuga Data Hub schema
description: Five project-centric tables, ingest middleware, and seed data added in Phase 1
---

## Tables (created via `CREATE TABLE IF NOT EXISTS` in app.ts on startup)
- `projects` — id, name, slug (unique), description, created_at
- `project_metrics` — id, project_id FK, metric_name, value (numeric), unit, recorded_at
- `project_events` — id, project_id FK, event_type, message, metadata (jsonb), occurred_at
- `ai_conversations` — id, project_id FK, session_id, user_message, assistant_message, model, tokens_used, started_at
- `website_visits` — id, project_id FK, page_path, referrer, user_agent, country, visited_at

## Seed projects (upserted on startup, idempotent via ON CONFLICT (slug) DO NOTHING)
Samuga-OS, samuga-news-bot, samugatravels-miniapp, Samuga-Travels, Samuga-Media

## Ingest auth
- `INGEST_API_KEY` env var checked at request time (not module load)
- Missing key → 503; wrong key → 401; uses `crypto.timingSafeEqual`
- Middleware at `artifacts/api-server/src/middleware/requireIngestKey.ts`

## API endpoints
- Ingest: POST /api/ingest/{event,metric,conversation,website-visit}
- Read: GET /api/v1/projects, /api/v1/projects/:id/{metrics,events,conversations}
- Overview: GET /api/v1/overview (aggregate KPIs + recent events)

## Frontend pages (7 new)
overview, projects, project-detail (tabs), errors, traffic, ai-analytics, data-explorer
All use raw fetch with `/api/...` relative paths (no generated hooks), space theme glassmorphism style.

**Why raw fetch:** New routes were added after orval codegen; pages use direct fetch rather than regenerating the client to avoid a full codegen cycle.
