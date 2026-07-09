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
