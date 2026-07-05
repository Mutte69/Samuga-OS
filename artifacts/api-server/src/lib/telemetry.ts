/**
 * Samuga Data Master Hub — outbound telemetry helper
 *
 * Safety rules (hardcoded, not configurable):
 *  - NEVER logs or exposes SAMUGA_OS_INGEST_KEY
 *  - NEVER throws; every failure is caught and logged at warn level
 *  - 5 s AbortSignal.timeout — a slow/down hub never stalls the app
 *  - All env vars read at call-time; missing vars → silent no-op (not a crash)
 *
 * Ingest endpoint structure:
 *   SAMUGA_OS_INGEST_URL = https://your-hub.railway.app
 *   → POSTs to  https://your-hub.railway.app/api/ingest/event
 *               https://your-hub.railway.app/api/ingest/metric
 *               https://your-hub.railway.app/api/ingest/conversation
 *               https://your-hub.railway.app/api/ingest/website-visit
 *
 * Usage:
 *   import { telemetry } from "./lib/telemetry";
 *   telemetry.event("info", "job completed", { jobId: 42 });
 *   telemetry.metric("response_time_ms", 120, "ms");
 *   telemetry.conversation(sessionId, userMsg, assistantMsg, { model: "gpt-4o-mini" });
 *   telemetry.visit("/api/v1/repos", { userAgent: req.headers["user-agent"] });
 *   await telemetry.probe(); // call once at startup for connectivity check
 */

import { logger } from "./logger";

const TIMEOUT_MS = 5_000;

// All Hub ingest routes share this path prefix.
// SAMUGA_OS_INGEST_URL should be the bare service root, e.g. https://my-hub.railway.app
const INGEST_PREFIX = "/api/ingest";

// ── Internal types ────────────────────────────────────────────────────────────

interface EventPayload {
  source: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata_json?: Record<string, unknown>;
}

interface MetricPayload {
  source: string;
  metric_name: string;
  value: number;
  unit?: string;
}

interface ConversationPayload {
  source: string;
  session_id: string;
  user_id?: string;
  user_name?: string;
  user_message: string;
  assistant_message: string;
  model?: string;
  tokens_used?: number;
}

interface VisitPayload {
  source: string;
  page_path: string;
  visitor_id?: string;
  user_agent?: string;
  referrer?: string;
}

// ── Internal POST helper ──────────────────────────────────────────────────────

/**
 * POSTs `body` to `SAMUGA_OS_INGEST_URL/api/ingest{path}`.
 * Returns true on HTTP 2xx, false on any error.
 * Never throws. Never logs the API key.
 */
async function post(path: string, body: unknown): Promise<boolean> {
  const ingestUrl = process.env.SAMUGA_OS_INGEST_URL;
  const ingestKey = process.env.SAMUGA_OS_INGEST_KEY;

  // Silent no-op when hub is not configured
  if (!ingestUrl || !ingestKey) return false;

  const fullUrl = `${ingestUrl.replace(/\/+$/, "")}${INGEST_PREFIX}${path}`;

  try {
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Key passed directly to fetch — never written to any log or variable
        "x-api-key": ingestKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      logger.info({ path }, "telemetry sent");
      return true;
    }

    // Non-2xx: read the body so we can log the Hub's error message
    let responseBody = "";
    try {
      responseBody = (await res.text()).slice(0, 400);
    } catch {
      responseBody = "(could not read response body)";
    }

    logger.warn(
      { status: res.status, path, responseBody },
      "telemetry: hub rejected payload",
    );
    return false;
  } catch (err: unknown) {
    // Network error, DNS failure, timeout — log the message but never the key
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ path, error: message }, "telemetry: network error");
    return false;
  }
}

function projectName(): string {
  return process.env.PROJECT_NAME ?? "samuga-os-api";
}

// ── Public API ────────────────────────────────────────────────────────────────

export const telemetry = {
  /**
   * Send a lifecycle or job event.
   * Use level "info" for normal events, "warn" for degraded state,
   * "error" for failures, exceptions, and external API errors.
   */
  event(
    level: "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    void post("/event", {
      source: projectName(),
      level,
      message,
      metadata_json: metadata,
    } satisfies EventPayload);
  },

  /**
   * Send a numeric metric.
   * Examples: requests_handled, successful_actions, failed_actions,
   *           response_time_ms, active_users, queue_length
   */
  metric(metricName: string, value: number, unit?: string): void {
    void post("/metric", {
      source: projectName(),
      metric_name: metricName,
      value,
      unit,
    } satisfies MetricPayload);
  },

  /**
   * Send an AI conversation record (call after every successful AI exchange).
   * user_id and user_name are optional — omit when not available.
   */
  conversation(
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
    opts?: {
      userId?: string;
      userName?: string;
      model?: string;
      tokensUsed?: number;
    },
  ): void {
    void post("/conversation", {
      source: projectName(),
      session_id: sessionId,
      user_id: opts?.userId,
      user_name: opts?.userName,
      user_message: userMessage,
      assistant_message: assistantMessage,
      model: opts?.model,
      tokens_used: opts?.tokensUsed,
    } satisfies ConversationPayload);
  },

  /**
   * Send a page or API visit record.
   * visitor_id can be a session ID, user ID, or any stable anonymous ID.
   */
  visit(
    pagePath: string,
    opts?: {
      visitorId?: string;
      userAgent?: string;
      referrer?: string;
    },
  ): void {
    void post("/website-visit", {
      source: projectName(),
      page_path: pagePath,
      visitor_id: opts?.visitorId,
      user_agent: opts?.userAgent,
      referrer: opts?.referrer,
    } satisfies VisitPayload);
  },

  /**
   * Awaitable startup probe — call ONCE at startup.
   *
   * 1. Logs which env vars are present (never logs values or the key itself).
   * 2. Shows the exact URL that will be called so misconfiguration is visible.
   * 3. Sends a hub_integration_test event immediately and awaits the result.
   * 4. Logs "hub connectivity verified" on success, or the status + body on failure.
   *
   * Does NOT throw. Safe to call without await if you don't need to block.
   */
  async probe(): Promise<void> {
    const ingestUrl = process.env.SAMUGA_OS_INGEST_URL;
    const ingestKey = process.env.SAMUGA_OS_INGEST_KEY;
    const project = projectName();
    const targetUrl = ingestUrl
      ? `${ingestUrl.replace(/\/+$/, "")}${INGEST_PREFIX}/event`
      : "(SAMUGA_OS_INGEST_URL not set)";

    // Log env state — presence only, never the key value
    logger.info(
      {
        SAMUGA_OS_INGEST_URL: ingestUrl ? "set" : "NOT SET",
        SAMUGA_OS_INGEST_KEY: ingestKey ? `set (length=${ingestKey.length})` : "NOT SET",
        PROJECT_NAME: project,
        targetUrl,
      },
      "telemetry: env check",
    );

    if (!ingestUrl || !ingestKey) {
      logger.warn(
        "telemetry: SAMUGA_OS_INGEST_URL or SAMUGA_OS_INGEST_KEY not set — all telemetry disabled",
      );
      return;
    }

    const ok = await post("/event", {
      source: project,
      level: "info",
      message: "hub_integration_test",
      metadata_json: {
        description: "Data Master Hub connectivity verified",
        node_env: process.env.NODE_ENV ?? "development",
      },
    } satisfies EventPayload);

    if (ok) {
      logger.info({ project, targetUrl }, "telemetry: hub connectivity verified ✓");
    }
    // On failure, post() already logged the status + response body
  },
};
