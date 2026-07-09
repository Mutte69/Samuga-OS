---
name: Session cookie fix — login flow
description: Root cause and fix for login succeeding (200) but /auth/me returning 401 immediately after in Replit deployment.
---

## The symptom
POST /auth/login → 200 (credentials correct, session saved)
GET  /auth/me   → 401 (session not found — immediately after login)

## Root causes (two, both present)

### 1. SameSite=None without Secure on non-HTTPS-detected requests
Cookie was `SameSite=None` when `NODE_ENV=production`. SameSite=None requires the Secure
attribute to be set, and `express-session` only sets the Secure flag when `req.secure = true`.
`trust proxy: 1` may not propagate `req.secure` correctly across Replit's multi-hop CDN.
Result: browser sees `SameSite=None` without `Secure` → rejects the cookie entirely.

### 2. Lazy session save race condition
`session.adminUser = ADMIN_USERNAME; res.json(...)` schedules the session save lazily.
The browser sends /auth/me before the save completes → session not yet in the store → 401.

## Fixes applied

**app.ts**:
- `trust proxy: true` (was `1`) — trusts all upstream hops, ensures req.secure=true
- Cookie `sameSite`: `"lax"` when same-origin (no CORS_ORIGIN set), `"none"` only when cross-origin
- Cookie `secure`: `true` only when cross-origin, else falls back to `isProduction`
- CORS `origin: false` when same-origin (was reflecting all origins with credentials — security risk)

**auth.ts**:
- `req.session.regenerate()` before setting session data (prevents session fixation)
- `req.session.save(cb)` explicitly before `res.json()` (eliminates the race condition)

## Deployment env vars needed on Replit
| Secret | Notes |
|---|---|
| `ADMIN_USERNAME` | The Operator ID shown in the login form |
| `ADMIN_PASSWORD` | The Passkey |
| `SESSION_SECRET` | Any long random string |

**Why:** These are read at module load time with a hard throw if missing. Server crashes on startup without them.

## When cross-origin (Railway separate domains)
Set `CORS_ORIGIN=https://your-admin.up.railway.app` — this switches sameSite to "none"+secure
and enables credentialed CORS for that origin only.
