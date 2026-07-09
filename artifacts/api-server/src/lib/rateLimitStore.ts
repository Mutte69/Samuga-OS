/**
 * Rate-limit event store.
 * Writes each hit to the database for durable history, and keeps a small
 * in-memory ring buffer so reads are fast even if the DB is slow.
 *
 * Also tracks per-IP hit timestamps for spike detection:
 *   RATE_LIMIT_SPIKE_THRESHOLD — number of hits within the window that
 *     triggers a spike alert (default: 5)
 *   RATE_LIMIT_SPIKE_WINDOW_MS — rolling window in milliseconds (default: 60 000)
 */

import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface RateLimitEvent {
  id: string;            // monotonic string id (Date.now + counter)
  ip: string;
  path: string;
  timestamp: string;     // ISO 8601
  hitCount: number;      // cumulative hits from this IP in the current window
}

export interface RateLimitSpikeEvent {
  ip: string;
  hitCount: number;      // number of hits within the spike window
  windowMs: number;      // the configured window in milliseconds
  threshold: number;     // the configured threshold
  timestamp: string;     // ISO 8601
}

const MAX_EVENTS = 200;
const events: RateLimitEvent[] = [];
let counter = 0;

// ── Spike detection ──────────────────────────────────────────────────────────

const SPIKE_THRESHOLD = (() => {
  const raw = process.env.RATE_LIMIT_SPIKE_THRESHOLD;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`RATE_LIMIT_SPIKE_THRESHOLD must be a positive integer, got "${raw}"`);
    }
    return n;
  }
  return 5; // default: 5 hits within the window triggers a spike
})();

const SPIKE_WINDOW_MS = (() => {
  const raw = process.env.RATE_LIMIT_SPIKE_WINDOW_MS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`RATE_LIMIT_SPIKE_WINDOW_MS must be a positive integer, got "${raw}"`);
    }
    return n;
  }
  return 60_000; // default: 60-second rolling window
})();

/**
 * Per-IP ring of hit timestamps (milliseconds since epoch).
 * Cleaned up lazily — old entries are pruned on each access.
 */
const ipHitTimestamps = new Map<string, number[]>();

/**
 * Record a rate-limit hit for an IP and check whether it constitutes a spike.
 *
 * Returns a `RateLimitSpikeEvent` when the hit count within the window equals
 * exactly the threshold (fires once per threshold crossing, not on every
 * subsequent hit), or `null` if the IP is not yet spiking.
 */
export function checkRateLimitSpike(ip: string): RateLimitSpikeEvent | null {
  const now = Date.now();
  const cutoff = now - SPIKE_WINDOW_MS;

  let timestamps = ipHitTimestamps.get(ip);
  if (!timestamps) {
    timestamps = [];
    ipHitTimestamps.set(ip, timestamps);
  }

  // Prune expired entries
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  timestamps.push(now);

  const count = timestamps.length;

  // Emit a spike alert when crossing the threshold (not on every hit above it)
  if (count === SPIKE_THRESHOLD) {
    return {
      ip,
      hitCount: count,
      windowMs: SPIKE_WINDOW_MS,
      threshold: SPIKE_THRESHOLD,
      timestamp: new Date(now).toISOString(),
    };
  }

  return null;
}

/** Record a new rate-limit hit, persist to DB, and return the stored entry. */
export function recordRateLimitHit(ip: string, path: string, hitCount: number): RateLimitEvent {
  const now = new Date();
  const evt: RateLimitEvent = {
    id: `${now.getTime()}-${++counter}`,
    ip,
    path,
    timestamp: now.toISOString(),
    hitCount,
  };

  // Keep in-memory ring buffer for fast in-process reads
  events.push(evt);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Persist to DB — fire-and-forget; a write failure is non-fatal
  pool
    .query(
      `INSERT INTO rate_limit_events (ip, path, hit_count, occurred_at)
       VALUES ($1, $2, $3, $4)`,
      [evt.ip, evt.path, evt.hitCount, now],
    )
    .catch((err) => {
      logger.warn({ err }, "Failed to persist rate-limit event to DB");
    });

  return evt;
}

export interface RateLimitEventFilter {
  ip?: string;
  path?: string;
}

/** Return recent events from the DB, newest first. Falls back to in-memory on error. */
export async function getRecentRateLimitEvents(
  limit = 50,
  filter: RateLimitEventFilter = {},
): Promise<RateLimitEvent[]> {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [limit];

    if (filter.ip) {
      params.push(`%${filter.ip}%`);
      conditions.push(`ip ILIKE ${params.length}`);
    }
    if (filter.path) {
      params.push(`%${filter.path}%`);
      conditions.push(`path ILIKE ${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query<{
      id: number;
      ip: string;
      path: string;
      hit_count: number;
      occurred_at: Date;
    }>(
      `SELECT id, ip, path, hit_count, occurred_at
       FROM rate_limit_events
       ${where}
       ORDER BY occurred_at DESC
       LIMIT $1`,
      params,
    );

    return rows.map((row) => ({
      id: String(row.id),
      ip: row.ip,
      path: row.path,
      hitCount: row.hit_count,
      timestamp: row.occurred_at.toISOString(),
    }));
  } catch (err) {
    logger.warn({ err }, "DB read for rate-limit events failed, falling back to in-memory");
    const ipQ   = filter.ip?.toLowerCase();
    const pathQ = filter.path?.toLowerCase();
    return events
      .slice()
      .reverse()
      .filter((e) => {
        if (ipQ   && !e.ip.toLowerCase().includes(ipQ))     return false;
        if (pathQ && !e.path.toLowerCase().includes(pathQ)) return false;
        return true;
      })
      .slice(0, limit);
  }
}
