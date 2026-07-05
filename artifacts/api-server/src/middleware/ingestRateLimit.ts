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
export function getRateLimitKey(req: Request): string {
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

/**
 * Factory that creates a rate-limit middleware with configurable limit and window.
 * Used by the production middleware (reading from env vars) and by tests
 * (which pass small values for fast, deterministic verification).
 */
export function createIngestRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** When true, the 429 handler does NOT emit to eventBus/rateLimitStore (useful in tests). */
  skipSideEffects?: boolean;
}) {
  const { limit, windowMs, skipSideEffects = false } = opts;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7", // adds RateLimit-* + Retry-After headers (RFC 9110)
    legacyHeaders: false,
    message: {
      error: `Rate limit exceeded. Maximum ${limit} requests per minute per API key.`,
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

      if (!skipSideEffects) {
        // Record in the ring buffer and emit to SSE clients
        const evt = recordRateLimitHit(displayKey, path, hitCount);
        eventBus.emit("rate_limit", { type: "rate_limit", data: evt });
      }

      res.status(429).json({
        error: `Rate limit exceeded. Maximum ${limit} requests per minute per API key.`,
        retryAfter: "See the Retry-After header",
      });
    },
  });
}

export const ingestRateLimit = createIngestRateLimiter({
  limit: rpm,
  windowMs: 60 * 1000, // 1-minute rolling window
});
