import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { eventBus } from "../lib/eventBus";
import { recordRateLimitHit } from "../lib/rateLimitStore";

/**
 * Per-key rate limiter for all /api/ingest/* routes.
 *
 * When the request carries a valid Authorization: Bearer <key> header the
 * rate-limit window is keyed on the API key, giving each integration its own
 * independent budget.  Unauthenticated requests (or requests where the header
 * is absent) fall back to the client IP address.
 *
 * Configurable via INGEST_RATE_LIMIT_RPM environment variable (default: 100).
 * Clients that exceed the limit receive 429 Too Many Requests with a
 * Retry-After header indicating when the window resets.
 *
 * Each 429 response is also recorded in the in-memory ring buffer and
 * broadcast to connected admin SSE clients via eventBus.
 */
const rpm = (() => {
  const raw = process.env.INGEST_RATE_LIMIT_RPM;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(
        `INGEST_RATE_LIMIT_RPM must be a positive integer, got "${raw}"`,
      );
    }
    return n;
  }
  return 100; // default: 100 requests per minute
})();

/**
 * Extract the rate-limit key for a request.
 *
 * Priority:
 *  1. API key from the Authorization: Bearer <key> header — gives each
 *     integration its own independent limit regardless of shared IP.
 *  2. Client IP address — fallback for unauthenticated requests.
 */
function getRateLimitKey(req: Request): string {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const key = authHeader.slice("Bearer ".length).trim();
    if (key.length > 0) {
      // Prefix so key-based entries never collide with IP-based entries in the
      // underlying store.
      return `apikey:${key}`;
    }
  }
  return `ip:${req.ip ?? "unknown"}`;
}

export const ingestRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1-minute rolling window
  limit: rpm,          // max requests per window per key
  standardHeaders: "draft-7", // adds RateLimit-* + Retry-After headers (RFC 9110)
  legacyHeaders: false,
  message: {
    error: `Rate limit exceeded. Maximum ${rpm} requests per minute per API key.`,
    retryAfter: "See the Retry-After header",
  },
  statusCode: 429,

  // Use the API key when present, fall back to IP.
  keyGenerator(req: Request): string {
    return getRateLimitKey(req);
  },

  handler(req: Request, res: Response) {
    const key = getRateLimitKey(req);
    // For display / logging purposes strip the prefix and show the raw value.
    const displayKey = key.startsWith("apikey:") ? req.ip ?? "unknown" : (req.ip ?? "unknown");
    const path = req.path ?? "/";
    // express-rate-limit exposes the current hit count on the request object
    // as req.rateLimit.current (draft-7 standard headers).
    const hitCount =
      (req as Request & { rateLimit?: { current?: number } }).rateLimit
        ?.current ?? 1;

    // Record in the ring buffer and emit to SSE clients
    const evt = recordRateLimitHit(displayKey, path, hitCount);
    eventBus.emit("rate_limit", { type: "rate_limit", data: evt });

    res.status(429).json({
      error: `Rate limit exceeded. Maximum ${rpm} requests per minute per API key.`,
      retryAfter: "See the Retry-After header",
    });
  },
});
