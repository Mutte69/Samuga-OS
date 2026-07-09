/**
 * Rate-limit event store.
 * Writes each hit to the database for durable history, and keeps a small
 * in-memory ring buffer so reads are fast even if the DB is slow.
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

const MAX_EVENTS = 200;
const events: RateLimitEvent[] = [];
let counter = 0;

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

/** Return recent events from the DB, newest first. Falls back to in-memory on error. */
export async function getRecentRateLimitEvents(limit = 50): Promise<RateLimitEvent[]> {
  try {
    const { rows } = await pool.query<{
      id: number;
      ip: string;
      path: string;
      hit_count: number;
      occurred_at: Date;
    }>(
      `SELECT id, ip, path, hit_count, occurred_at
       FROM rate_limit_events
       ORDER BY occurred_at DESC
       LIMIT $1`,
      [limit],
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
    return events.slice(-limit).reverse();
  }
}
