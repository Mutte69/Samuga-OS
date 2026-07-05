/**
 * Integration tests for the ingest rate-limit middleware.
 *
 * These tests spin up a minimal Express app (no DB, no session) that applies
 * the rate-limit middleware and a simple echo handler.  They verify:
 *
 *  1. Requests up to the limit succeed (200).
 *  2. The (limit + 1)th request in the same window is rejected with 429.
 *  3. The 429 response carries the required RateLimit-* and Retry-After headers.
 *  4. After the window expires the limiter resets and requests succeed again.
 *  5. Different API keys get independent buckets (one key exhausted ≠ other key blocked).
 *  6. Requests without a Bearer token are keyed by IP and limited independently.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createIngestRateLimiter } from "./ingestRateLimit";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Express app with the given rate-limiter instance. */
function buildApp(limit: number, windowMs: number): Express {
  const app = express();
  // Needed so req.ip resolves correctly in tests (no reverse proxy).
  app.set("trust proxy", false);

  app.use(
    createIngestRateLimiter({ limit, windowMs, skipSideEffects: true }),
  );

  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

/** Fire `n` GET /ping requests against `app` and return all responses. */
async function fireRequests(
  app: Express,
  n: number,
  headers: Record<string, string> = {},
) {
  const results: { status: number; headers: Record<string, string> }[] = [];
  for (let i = 0; i < n; i++) {
    const req = request(app).get("/ping");
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    const res = await req;
    results.push({ status: res.status, headers: res.headers as Record<string, string> });
  }
  return results;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ingestRateLimit middleware", () => {
  const LIMIT = 5;
  const WINDOW_MS = 2_000; // 2 s — short enough to test reset without fake timers being flaky

  let app: Express;

  beforeEach(() => {
    // Fresh app (and therefore a fresh in-memory store) for every test.
    app = buildApp(LIMIT, WINDOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Requests within the limit succeed ───────────────────────────────────
  it("allows up to the limit number of requests", async () => {
    const responses = await fireRequests(app, LIMIT);
    expect(responses.every((r) => r.status === 200)).toBe(true);
  });

  // ── 2. The (limit + 1)th request is rejected ──────────────────────────────
  it("returns 429 on the request that exceeds the limit", async () => {
    await fireRequests(app, LIMIT); // exhaust the budget
    const res = await request(app).get("/ping");
    expect(res.status).toBe(429);
  });

  // ── 3. Required rate-limit headers are present on 429 ─────────────────────
  //
  // express-rate-limit v8 with standardHeaders: "draft-7" emits a single
  // combined "RateLimit" header (e.g. "limit=5, remaining=0, reset=2") and a
  // separate "Retry-After" header — NOT the old draft-6 separate headers.
  it("includes RateLimit and Retry-After headers on a 429 response", async () => {
    await fireRequests(app, LIMIT);
    const res = await request(app).get("/ping");

    expect(res.status).toBe(429);

    // Combined draft-7 header (lowercase after HTTP normalisation).
    expect(res.headers).toHaveProperty("ratelimit");
    // Policy header always present alongside the combined header.
    expect(res.headers).toHaveProperty("ratelimit-policy");
    // Retry-After tells the client when the window resets.
    expect(res.headers).toHaveProperty("retry-after");
  });

  // ── 4. Retry-After header value is a positive number ─────────────────────
  it("Retry-After header is a positive integer (seconds until reset)", async () => {
    await fireRequests(app, LIMIT);
    const res = await request(app).get("/ping");

    const retryAfter = Number(res.headers["retry-after"]);
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  // ── 5. RateLimit remaining field reaches 0 on the last allowed request ────
  //
  // The draft-7 combined "RateLimit" header looks like:
  //   "limit=5, remaining=0, reset=2"
  // Parse the "remaining" field and verify it hits 0 at the limit boundary.
  it("RateLimit remaining field decrements to 0 on the last allowed request", async () => {
    const responses = await fireRequests(app, LIMIT);
    const last = responses[responses.length - 1];
    expect(last.status).toBe(200);

    const rateLimitHeader: string = last.headers["ratelimit"] ?? "";
    const match = rateLimitHeader.match(/remaining=(\d+)/);
    const remaining = match ? Number(match[1]) : NaN;
    expect(remaining).toBe(0);
  });

  // ── 6. Window reset: limiter allows requests again after window expires ───
  it("resets the counter after the window expires", async () => {
    vi.useFakeTimers();

    // Build a fresh app inside the fake-timer context so the store uses
    // vi's mocked Date.now().
    const timedApp = buildApp(LIMIT, WINDOW_MS);

    await fireRequests(timedApp, LIMIT);

    // Confirm we're blocked.
    const blocked = await request(timedApp).get("/ping");
    expect(blocked.status).toBe(429);

    // Advance past the window boundary.
    vi.advanceTimersByTime(WINDOW_MS + 100);

    // Should now be allowed again.
    const allowed = await request(timedApp).get("/ping");
    expect(allowed.status).toBe(200);
  }, 10_000);

  // ── 7. Each API key gets its own independent bucket ───────────────────────
  it("gives each Bearer token its own independent rate-limit bucket", async () => {
    const key1 = { Authorization: "Bearer test-key-alpha" };
    const key2 = { Authorization: "Bearer test-key-beta" };

    // Exhaust key1's budget.
    await fireRequests(app, LIMIT, key1);
    const blockedKey1 = await request(app).get("/ping").set(key1);
    expect(blockedKey1.status).toBe(429);

    // key2 should still have its full budget.
    const allowedKey2 = await request(app).get("/ping").set(key2);
    expect(allowedKey2.status).toBe(200);
  });

  // ── 8. More than 100 requests → 101st is 429 (scaled test) ───────────────
  it("blocks the 101st request when limit is 100", async () => {
    const bigApp = buildApp(100, WINDOW_MS);
    await fireRequests(bigApp, 100);
    const res = await request(bigApp).get("/ping");
    expect(res.status).toBe(429);
  });

  // ── 9. Unauthenticated requests are keyed by IP, not mixed with keyed ones ─
  it("does not penalise keyed requests when unauthenticated IP bucket is exhausted", async () => {
    // Exhaust the IP bucket (no Authorization header → falls back to IP).
    await fireRequests(app, LIMIT);
    const blockedIp = await request(app).get("/ping");
    expect(blockedIp.status).toBe(429);

    // A request with a Bearer key uses a different bucket and is allowed.
    const allowedKeyed = await request(app)
      .get("/ping")
      .set("Authorization", "Bearer isolated-key");
    expect(allowedKeyed.status).toBe(200);
  });
});
