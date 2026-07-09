import { Router, type IRouter } from "express";
import { requireAdminSession } from "../middlewares/session-auth";
import { getRecentRateLimitEvents } from "../lib/rateLimitStore";

const router: IRouter = Router();

/**
 * GET /v1/rate-limit-events
 * Returns the most recent rate-limit hits from the database.
 * Protected — admin session required.
 *
 * Query params:
 *   limit  (optional, default 50, max 200)
 *   ip     (optional) — case-insensitive substring match on the IP field
 *   path   (optional) — case-insensitive substring match on the path field
 */
router.get("/v1/rate-limit-events", requireAdminSession, async (req, res): Promise<void> => {
  const rawLimit = req.query.limit;
  const limit = Math.min(
    200,
    Math.max(1, Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 50),
  );

  const ip   = typeof req.query.ip   === "string" ? req.query.ip.trim()   : undefined;
  const path = typeof req.query.path === "string" ? req.query.path.trim() : undefined;

  const events = await getRecentRateLimitEvents(limit, {
    ip:   ip   || undefined,
    path: path || undefined,
  });
  res.json({ events, total: events.length });
});

export default router;
