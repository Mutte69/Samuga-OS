import { Router, type IRouter } from "express";
import { requireAdminSession } from "../middlewares/session-auth";
import { eventBus, type LiveEvent, type IngestErrorEvent } from "../lib/eventBus";
import type { RateLimitEvent, RateLimitSpikeEvent } from "../lib/rateLimitStore";
import { logger } from "../lib/logger";
import { telemetry } from "../lib/telemetry";

const router: IRouter = Router();

// ── Active SSE connection counter ────────────────────────────────────────────
// Used to report queue_size to the Hub so operators can see how many admin
// clients are currently connected.
let activeConnections = 0;

// GET /v1/live — Server-Sent Events stream for authenticated admin clients
router.get("/v1/live", requireAdminSession, (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  activeConnections++;
  telemetry.metric("queue_size", activeConnections, "connections");

  // Send an initial "connected" event so the client knows the stream is alive
  res.write(`event: connected\ndata: {}\n\n`);

  // Heartbeat every 15 seconds so the client can detect a server-side restart
  // within one missed interval (~15 s) rather than waiting for the backoff timer.
  // Named events are used because SSE comment lines are not exposed to the
  // browser's EventSource API and cannot be detected by JavaScript.
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: {}\n\n`);
    } catch {
      // client already disconnected
    }
  }, 15_000);

  function onLive(evt: LiveEvent) {
    try {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    } catch {
      // client disconnected between events
    }
  }

  function onRateLimit(evt: { type: "rate_limit"; data: RateLimitEvent }) {
    try {
      res.write(`event: rate_limit\ndata: ${JSON.stringify(evt.data)}\n\n`);
    } catch {
      // client disconnected between events
    }
  }

  function onIngestError(evt: IngestErrorEvent) {
    try {
      res.write(`event: ingest_error\ndata: ${JSON.stringify(evt)}\n\n`);
    } catch {
      // client disconnected between events
    }
  }

  function onRateLimitSpike(evt: { type: "rate_limit_spike"; data: RateLimitSpikeEvent }) {
    try {
      res.write(`event: rate_limit_spike\ndata: ${JSON.stringify(evt.data)}\n\n`);
    } catch {
      // client disconnected between events
    }
  }

  eventBus.on("live", onLive);
  eventBus.on("rate_limit", onRateLimit);
  eventBus.on("ingest_error", onIngestError);
  eventBus.on("rate_limit_spike", onRateLimitSpike);

  req.on("close", () => {
    clearInterval(heartbeat);
    activeConnections = Math.max(0, activeConnections - 1);
    telemetry.metric("queue_size", activeConnections, "connections");
    eventBus.off("live", onLive);
    eventBus.off("rate_limit", onRateLimit);
    eventBus.off("ingest_error", onIngestError);
    eventBus.off("rate_limit_spike", onRateLimitSpike);
    logger.debug("SSE client disconnected");
  });
});

export default router;
