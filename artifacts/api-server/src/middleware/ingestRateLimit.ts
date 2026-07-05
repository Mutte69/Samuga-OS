import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { eventBus } from "../lib/eventBus";
import { recordRateLimitHit } from "../lib/rateLimitStore";

/**
 * Per-IP rate limiter for all /api/ingest/* routes.
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

export const ingestRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1-minute rolling window
  limit: rpm,          // max requests per window per IP
  standardHeaders: "draft-7", // adds RateLimit-* + Retry-After headers (RFC 9110)
  legacyHeaders: false,
  message: {
    error: `Rate limit exceeded. Maximum ${rpm} requests per minute per IP.`,
    retryAfter: "See the Retry-After header",
  },
  statusCode: 429,
  // Default keyGenerator uses req.ip, which respects Express's trust proxy
  // setting — correct for both IPv4 and IPv6 addresses.

  handler(req: Request, res: Response) {
    const ip = req.ip ?? "unknown";
    const path = req.path ?? "/";
    // express-rate-limit exposes the current hit count on the request object
    // as req.rateLimit.current (draft-7 standard headers).
    const hitCount =
      (req as Request & { rateLimit?: { current?: number } }).rateLimit
        ?.current ?? 1;

    // Record in the ring buffer and emit to SSE clients
    const evt = recordRateLimitHit(ip, path, hitCount);
    eventBus.emit("rate_limit", { type: "rate_limit", data: evt });

    res.status(429).json({
      error: `Rate limit exceeded. Maximum ${rpm} requests per minute per IP.`,
      retryAfter: "See the Retry-After header",
    });
  },
});
