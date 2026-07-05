/**
 * Samuga Data Master Hub — outbound telemetry helper
 *
 * Safety rules (hardcoded, not configurable):
 *  - NEVER logs or exposes SAMUGA_OS_INGEST_KEY
 *  - NEVER throws; every failure is swallowed after a "telemetry failed" log
 *  - 5 s AbortSignal.timeout — a slow/down hub never stalls the app
 *  - All env vars read at call-time; missing vars → silent no-op (not a crash)
 *
 * Usage:
 *   import { telemetry } from "./lib/telemetry";
 *   telemetry.event("info", "job completed", { jobId: 42 });
 *   telemetry.metric("response_time_ms", 120, "ms");
 *   telemetry.conversation(sessionId, userMsg, assistantMsg, { model: "gpt-4o-mini" });
 *   telemetry.visit("/api/v1/repos", { userAgent: req.headers["user-agent"] });
 */

import { logger } from "./logger";

const TIMEOUT_MS = 5_000;

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

// ── Fire-and-forget POST ──────────────────────────────────────────────────────

async function post(path: string, body: unknown): Promise<void> {
  const ingestUrl = process.env.SAMUGA_OS_INGEST_URL;
  const ingestKey = process.env.SAMUGA_OS_INGEST_KEY;

  // Silent no-op when hub is not configured — this service runs fine without it
  if (!ingestUrl || !ingestKey) return;

  try {
    const res = await fetch(`${ingestUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // key passed directly to fetch — never written to any log or variable
        "x-api-key": ingestKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      logger.debug({ path }, "telemetry sent");
    } else {
      logger.warn({ status: res.status, path }, "telemetry failed");
    }
  } catch {
    // Timeout, DNS failure, or network error — log path only, never the key
    logger.warn({ path }, "telemetry failed");
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
};
