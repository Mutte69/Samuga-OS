import { EventEmitter } from "events";
import type { RateLimitEvent, RateLimitSpikeEvent } from "./rateLimitStore";

export interface LiveEvent {
  type: "event" | "metric" | "rate_limit";
  projectId?: number;
  data: Record<string, unknown>;
}

export interface RateLimitLiveEvent {
  type: "rate_limit";
  data: RateLimitEvent;
}

export interface RateLimitSpikeLiveEvent {
  type: "rate_limit_spike";
  data: RateLimitSpikeEvent;
}

/** Emitted by ingest routes when a call fails (4xx / 5xx). */
export interface IngestErrorEvent {
  id: string;
  endpoint: string;
  error: string;
  status: number;
  timestamp: string;
  projectId?: number;
  projectSlug?: string;
}

class LiveEventBus extends EventEmitter {}

// Singleton shared across the process
export const eventBus = new LiveEventBus();
eventBus.setMaxListeners(500); // allow many SSE clients
