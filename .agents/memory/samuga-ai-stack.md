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
