import { EventEmitter } from "events";
import type { RateLimitEvent } from "./rateLimitStore";

export interface LiveEvent {
  type: "event" | "metric" | "rate_limit";
  projectId?: number;
  data: Record<string, unknown>;
}

export interface RateLimitLiveEvent {
  type: "rate_limit";
  data: RateLimitEvent;
}

class LiveEventBus extends EventEmitter {}

// Singleton shared across the process
export const eventBus = new LiveEventBus();
eventBus.setMaxListeners(500); // allow many SSE clients
