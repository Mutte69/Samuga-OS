/**
 * In-memory ring buffer for recent rate-limit events.
 * Holds up to MAX_EVENTS entries; oldest are evicted first.
 * No persistence — restarts clear the buffer.
 */

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

/** Record a new rate-limit hit and return the stored entry. */
export function recordRateLimitHit(ip: string, path: string, hitCount: number): RateLimitEvent {
  const evt: RateLimitEvent = {
    id: `${Date.now()}-${++counter}`,
    ip,
    path,
    timestamp: new Date().toISOString(),
    hitCount,
  };
  events.push(evt);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }
  return evt;
}

/** Return a snapshot of recent events, newest first. */
export function getRecentRateLimitEvents(limit = 50): RateLimitEvent[] {
  return events.slice(-limit).reverse();
}
