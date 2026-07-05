import { EventEmitter } from "events";

export interface LiveEvent {
  type: "event" | "metric";
  projectId: number;
  data: Record<string, unknown>;
}

class LiveEventBus extends EventEmitter {}

// Singleton shared across the process
export const eventBus = new LiveEventBus();
eventBus.setMaxListeners(500); // allow many SSE clients
