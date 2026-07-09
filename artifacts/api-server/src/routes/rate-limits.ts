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
 */
router.get("/v1/rate-limit-events", requireAdminSession, async (req, res): Promise<void> => {
  const rawLimit = req.query.limit;
  const limit = Math.min(
    200,
    Math.max(1, Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 50),
  );
  const events = await getRecentRateLimitEvents(limit);
  res.json({ events, total: events.length });
});

export default router;
