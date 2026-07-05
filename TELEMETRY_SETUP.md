# Samuga Data Master Hub — Telemetry Integration Guide

Add this guide to every project repo that should send data to the hub.

---

## Required environment variables

Set these in Railway (or wherever the service runs):

| Variable | Value | Notes |
|---|---|---|
| `SAMUGA_OS_INGEST_URL` | `https://<your-api-server-domain>` | Bare service root — **no** `/api/ingest` suffix, no trailing slash. The helper appends the prefix automatically. |
| `SAMUGA_OS_INGEST_KEY` | _(copy from `INGEST_API_KEY` secret on the hub)_ | Same key set on the hub. Keep secret — never log it. |
| `PROJECT_NAME` | e.g. `samuga-news-bot` | Must match the slug in the hub projects table (see below). |

> **Do NOT set these on the Hub API service itself.** The Hub's ingest handlers call `telemetry.metric()` after every received payload. If `SAMUGA_OS_INGEST_URL` pointed at the Hub itself, every ingest call would trigger an outbound metric POST back to the Hub. Those self-POSTs would fail with 400 (the payload shape differs) and then be retried, producing a stream of failed self-calls, warning logs, and unnecessary load on every real ingest request.

### Known project slugs → numeric IDs

| Project | Slug | ID |
|---|---|---|
| Samuga-OS | `samuga-os` | 1 |
| samuga-news-bot | `samuga-news-bot` | 2 |
| samugatravels-miniapp | `samugatravels-miniapp` | 3 |
| Samuga-Travels | `samuga-travels` | 4 |
| Samuga-Media | `samuga-media` | 5 |

> You can also resolve the project ID at startup via `GET /api/ingest/project?slug=<slug>`.

---

## Authentication

Every ingest request must carry the key in **one** of these headers (both accepted):

```
x-api-key: <SAMUGA_OS_INGEST_KEY>
Authorization: Bearer <SAMUGA_OS_INGEST_KEY>
```

---

## Ingest endpoints

Base: `$SAMUGA_OS_INGEST_URL/api/ingest`  (e.g. `https://api.samuga.app/api/ingest`)

### POST /event — lifecycle events, job results, exceptions

```json
{
  "project_id": 2,
  "event_type": "job_success",
  "message": "Scraped 42 articles",
  "metadata": { "count": 42, "duration_ms": 1200 }
}
```

Recommended `event_type` values: `startup`, `shutdown`, `job_success`, `job_failed`,
`error`, `external_api_failure`, `db_error`, `rate_limit_hit`

### POST /metric — numeric measurements

```json
{
  "project_id": 2,
  "metric_name": "articles_scraped",
  "value": 42,
  "unit": "count"
}
```

Useful metric names: `requests_handled`, `successful_actions`, `failed_actions`,
`response_time_ms`, `active_users`, `queue_length`, `tokens_used`

### POST /conversation — AI chat records (once per complete exchange)

```json
{
  "project_id": 2,
  "session_id": "abc123",
  "user_message": "What flights are available to Nairobi?",
  "assistant_message": "Here are 3 options...",
  "model": "gpt-4o-mini",
  "tokens_used": 312
}
```

### POST /website-visit — page or API visits

```json
{
  "project_id": 3,
  "page_path": "/book",
  "referrer": "https://t.me/SamugaTravels",
  "user_agent": "TelegramBot/1.0",
  "country": "KE"
}
```

---

## Node.js / TypeScript helper (copy into your project)

> **All env vars are read inside functions at call-time**, so the module loads safely even when vars are not yet set, and a restart picks up changes without code modification.
>
> `SAMUGA_OS_INGEST_URL` must be the **bare service root** (e.g. `https://hub.railway.app`).
> The helper appends `/api/ingest` automatically — do not include it in the env var.

```ts
// lib/telemetry.ts
const TIMEOUT_MS = 5_000;
// All Hub ingest routes share this path prefix.
// SAMUGA_OS_INGEST_URL is the bare service root; this helper appends the prefix.
const INGEST_PREFIX = "/api/ingest";

// Internal: resolve project ID by slug at startup
let _projectId: number | null = null;

/** Call once at startup, before sending any telemetry. */
export async function initTelemetry(): Promise<void> {
  // Read env vars here, at call-time
  const ingestUrl = process.env.SAMUGA_OS_INGEST_URL;
  const ingestKey = process.env.SAMUGA_OS_INGEST_KEY;
  const projectName = process.env.PROJECT_NAME;

  console.log("telemetry: env check", {
    SAMUGA_OS_INGEST_URL: ingestUrl ? "set" : "NOT SET",
    SAMUGA_OS_INGEST_KEY: ingestKey ? `set (length=${ingestKey.length})` : "NOT SET",
    PROJECT_NAME: projectName ?? "NOT SET",
    targetUrl: ingestUrl ? `${ingestUrl.replace(/\/+$/, "")}${INGEST_PREFIX}/event` : "(SAMUGA_OS_INGEST_URL not set)",
  });

  if (!ingestUrl || !ingestKey || !projectName) {
    console.warn("telemetry: not configured (SAMUGA_OS_INGEST_URL / SAMUGA_OS_INGEST_KEY / PROJECT_NAME missing) — all telemetry disabled");
    return;
  }

  try {
    const base = ingestUrl.replace(/\/+$/, "");
    const res = await fetch(
      `${base}${INGEST_PREFIX}/project?slug=${encodeURIComponent(projectName)}`,
      {
        headers: { "x-api-key": ingestKey }, // key not logged
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (res.ok) {
      const data = await res.json() as { id: number };
      _projectId = data.id;
      console.log(`telemetry: connected ✓  project=${projectName}  project_id=${_projectId}`);

      // Send startup event
      void _post("/event", {
        project_id: _projectId,
        event_type: "startup",
        message: "service telemetry connected",
        metadata: { service: projectName },
      });
    } else {
      let body = "";
      try { body = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      console.warn(`telemetry: could not resolve project ID  status=${res.status}  body=${body}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`telemetry: could not resolve project ID (network error: ${msg})`);
  }
}

async function _post(path: string, body: unknown): Promise<void> {
  // Read env vars at call-time — never cached at module level
  const ingestUrl = process.env.SAMUGA_OS_INGEST_URL;
  const ingestKey = process.env.SAMUGA_OS_INGEST_KEY;

  if (!ingestUrl || !ingestKey || _projectId === null) return;

  try {
    await fetch(`${ingestUrl.replace(/\/+$/, "")}${INGEST_PREFIX}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ingestKey, // key passed to fetch only — never logged
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS), // never stalls the app
    });
    // No throw on non-OK — telemetry never crashes the app
  } catch {
    console.warn("telemetry failed"); // never log the key
  }
}

export const telemetry = {
  event(type: string, message: string, meta?: Record<string, unknown>): void {
    if (_projectId === null) return;
    void _post("/event", {
      project_id: _projectId,
      event_type: type,
      message,
      metadata: meta,
    });
  },

  metric(name: string, value: number, unit?: string): void {
    if (_projectId === null) return;
    void _post("/metric", { project_id: _projectId, metric_name: name, value, unit });
  },

  conversation(
    sessionId: string,
    userMsg: string,
    assistantMsg: string,
    model?: string,
    tokens?: number,
  ): void {
    if (_projectId === null) return;
    void _post("/conversation", {
      project_id: _projectId,
      session_id: sessionId,
      user_message: userMsg,
      assistant_message: assistantMsg,
      model,
      tokens_used: tokens,
    });
  },

  visit(
    path: string,
    opts?: { userAgent?: string; referrer?: string; country?: string },
  ): void {
    if (_projectId === null) return;
    void _post("/website-visit", {
      project_id: _projectId,
      page_path: path,
      user_agent: opts?.userAgent,
      referrer: opts?.referrer,
      country: opts?.country,
    });
  },

  shutdown(): Promise<void> {
    this.event("shutdown", "service shutting down", {
      service: process.env.PROJECT_NAME,
    });
    // Allow the fire-and-forget to flush before exit
    return new Promise((resolve) => setTimeout(resolve, 400));
  },
};
```

**Wire it up in your entrypoint:**

```ts
import { initTelemetry, telemetry } from "./lib/telemetry";

// At startup — resolves slug → project ID, sends startup event
await initTelemetry();

// Successful job
try {
  const count = await scrapeArticles();
  telemetry.event("job_success", `Scraped ${count} articles`, { count });
  telemetry.metric("articles_scraped", count, "count");
  telemetry.metric("successful_actions", 1, "count");
} catch (err) {
  telemetry.event("error", `Scrape failed: ${(err as Error).message}`);
  telemetry.metric("failed_actions", 1, "count");
}

// AI conversation
telemetry.conversation(sessionId, userMessage, reply, "gpt-4o-mini", tokensUsed);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await telemetry.shutdown();
  process.exit(0);
});
```

---

## Python helper (copy into your project)

> Env vars are read inside each function at call-time — not cached at module level.
>
> `SAMUGA_OS_INGEST_URL` must be the **bare service root** (e.g. `https://hub.railway.app`).
> The helper appends `/api/ingest` automatically.

```python
# telemetry.py
import os, json, threading
from urllib import request as urllib_request, parse as urllib_parse
from urllib.error import URLError

_PROJECT_ID: int | None = None
_TIMEOUT = 5  # seconds
_INGEST_PREFIX = "/api/ingest"  # appended automatically; do not include in SAMUGA_OS_INGEST_URL

def init_telemetry() -> None:
    """Call once at startup to resolve project ID and print env check."""
    global _PROJECT_ID
    # Read at call-time, not module level
    ingest_url = os.environ.get("SAMUGA_OS_INGEST_URL", "").rstrip("/")
    ingest_key = os.environ.get("SAMUGA_OS_INGEST_KEY", "")
    project_name = os.environ.get("PROJECT_NAME", "")

    print("telemetry: env check", {
        "SAMUGA_OS_INGEST_URL": "set" if ingest_url else "NOT SET",
        "SAMUGA_OS_INGEST_KEY": f"set (length={len(ingest_key)})" if ingest_key else "NOT SET",
        "PROJECT_NAME": project_name or "NOT SET",
        "targetUrl": f"{ingest_url}{_INGEST_PREFIX}/event" if ingest_url else "(SAMUGA_OS_INGEST_URL not set)",
    })

    if not ingest_url or not ingest_key or not project_name:
        print("telemetry: not configured — all telemetry disabled")
        return

    try:
        req = urllib_request.Request(
            f"{ingest_url}{_INGEST_PREFIX}/project?slug={urllib_parse.quote(project_name)}",
            headers={"x-api-key": ingest_key},  # key not logged
        )
        with urllib_request.urlopen(req, timeout=_TIMEOUT) as r:
            data = json.loads(r.read())
            _PROJECT_ID = data["id"]
            print(f"telemetry: connected ✓  project={project_name}  project_id={_PROJECT_ID}")
        send_event("startup", "service telemetry connected", {"service": project_name})
    except URLError as e:
        print(f"telemetry: could not connect (network error: {e.reason})")
    except Exception as e:
        print(f"telemetry: could not connect ({e})")

def _post(path: str, body: dict) -> None:
    """Fire-and-forget POST in a daemon thread — never blocks, never crashes."""
    if _PROJECT_ID is None:
        return
    # Read env vars at call-time, not module level
    ingest_url = os.environ.get("SAMUGA_OS_INGEST_URL", "").rstrip("/")
    ingest_key = os.environ.get("SAMUGA_OS_INGEST_KEY", "")
    if not ingest_url or not ingest_key:
        return

    def _send() -> None:
        try:
            payload = json.dumps(body).encode()
            req = urllib_request.Request(
                f"{ingest_url}{_INGEST_PREFIX}{path}",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ingest_key,  # key not logged
                },
                method="POST",
            )
            urllib_request.urlopen(req, timeout=_TIMEOUT)
        except Exception:
            print("telemetry failed")  # never log the key

    threading.Thread(target=_send, daemon=True).start()

def send_event(event_type: str, message: str, metadata: dict | None = None) -> None:
    _post("/event", {"project_id": _PROJECT_ID, "event_type": event_type,
                     "message": message, "metadata": metadata})

def send_metric(name: str, value: float, unit: str | None = None) -> None:
    _post("/metric", {"project_id": _PROJECT_ID, "metric_name": name,
                      "value": value, "unit": unit})

def send_conversation(session_id: str, user_msg: str, assistant_msg: str,
                      model: str | None = None, tokens: int | None = None) -> None:
    _post("/conversation", {
        "project_id": _PROJECT_ID, "session_id": session_id,
        "user_message": user_msg, "assistant_message": assistant_msg,
        "model": model, "tokens_used": tokens,
    })

def send_visit(page_path: str, user_agent: str | None = None,
               referrer: str | None = None, country: str | None = None) -> None:
    _post("/website-visit", {
        "project_id": _PROJECT_ID, "page_path": page_path,
        "user_agent": user_agent, "referrer": referrer, "country": country,
    })

def shutdown() -> None:
    """Call before process.exit — allows final event to flush."""
    import time
    send_event("shutdown", "service shutting down",
               {"service": os.environ.get("PROJECT_NAME")})
    time.sleep(0.4)  # allow the daemon thread to fire
```

---

## Logs Explorer (Railway/API errors → system_logs)

The **Logs Explorer** reads from `system_logs` via `POST /api/v1/logs`.
This endpoint uses a **different key** — an API key created in the Admin UI under **API Keys**.

```ts
// Log an error from any service
await fetch(`${API_SERVER_URL}/api/v1/logs`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.SAMUGA_LOGS_API_KEY!,
  },
  body: JSON.stringify({
    source_repo: "samuga-news-bot",       // your repo name
    log_level: "error",                   // "info" | "warn" | "error"
    message: "Scraper timed out after 30 s",
  }),
});
```

1. Go to **Admin → API Keys** and create a key named e.g. `news-bot-logs`.
2. Set `SAMUGA_LOGS_API_KEY` in your Railway env with that key's value.
3. Ship logs from your catch blocks and Railway crash handlers.

---

## Repositories page (GITHUB_OWNER)

The Repositories page calls `GET /api/repos` which fetches from GitHub.
Set on the **API server** (not individual projects):

| Variable | Value |
|---|---|
| `GITHUB_OWNER` | Your GitHub org or username, e.g. `Mutte69` |
| `GITHUB_TOKEN` | Personal access token (read:repo scope). Optional for public repos, required for private ones. |

---

## Setup checklist (per project)

> ⚠️ **Do NOT set these on the Hub API Railway service itself** — it would cause an ingest feedback loop.

- [ ] `SAMUGA_OS_INGEST_URL` set in Railway env to the **bare hub service root**, e.g. `https://samuga-hub.up.railway.app` (no `/api/ingest` suffix, no trailing slash)
- [ ] `SAMUGA_OS_INGEST_KEY` set in Railway env (same value as hub `INGEST_API_KEY`)
- [ ] `PROJECT_NAME` set to the matching slug (see table above)
- [ ] `initTelemetry()` called at startup
- [ ] Startup event fires after connect
- [ ] Job success/failure events sent
- [ ] Exceptions caught → `error` event sent
- [ ] Metrics sent: at minimum `requests_handled` and `failed_actions`
- [ ] AI bots: `conversation` record per exchange
- [ ] Web/mini-apps: `visit` record per page load or API request
- [ ] Logs API key created in admin, `SAMUGA_LOGS_API_KEY` set, log shipping integrated
- [ ] Graceful shutdown event fires on SIGTERM
