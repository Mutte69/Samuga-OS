import { Router, type IRouter } from "express";
import { requireAdminSession } from "../middlewares/session-auth";
import { eventBus, type LiveEvent } from "../lib/eventBus";
import type { RateLimitEvent } from "../lib/rateLimitStore";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /v1/live — Server-Sent Events stream for authenticated admin clients
router.get("/v1/live", requireAdminSession, (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send an initial "connected" event so the client knows the stream is alive
  res.write(`event: connected\ndata: {}\n\n`);

  // Heartbeat every 25 seconds to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25_000);

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

  eventBus.on("live", onLive);
  eventBus.on("rate_limit", onRateLimit);

  req.on("close", () => {
    clearInterval(heartbeat);
    eventBus.off("live", onLive);
    eventBus.off("rate_limit", onRateLimit);
    logger.debug("SSE client disconnected");
  });
});

export default router;
