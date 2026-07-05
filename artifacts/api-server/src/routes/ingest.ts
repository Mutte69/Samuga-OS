import { Router, type IRouter } from "express";
import { db, projectEventsTable, projectMetricsTable, aiConversationsTable, websiteVisitsTable } from "@workspace/db";
import { requireIngestKey } from "../middleware/requireIngestKey";
import { eventBus } from "../lib/eventBus";

const router: IRouter = Router();

// ── POST /ingest/event ──────────────────────────────────────────────────────
router.post("/ingest/event", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, event_type, message, metadata } = req.body ?? {};
  if (typeof project_id !== "number" || typeof event_type !== "string" || typeof message !== "string") {
    res.status(400).json({ error: "Required fields: project_id (number), event_type (string), message (string)" });
    return;
  }
  const [row] = await db
    .insert(projectEventsTable)
    .values({ projectId: project_id, eventType: event_type, message, metadata: metadata ?? null })
    .returning();

  // Broadcast to live SSE clients
  eventBus.emit("live", { type: "event", projectId: project_id, data: row });

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/metric ─────────────────────────────────────────────────────
router.post("/ingest/metric", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, metric_name, value, unit } = req.body ?? {};
  if (typeof project_id !== "number" || typeof metric_name !== "string" || value === undefined) {
    res.status(400).json({ error: "Required fields: project_id (number), metric_name (string), value (number)" });
    return;
  }
  const [row] = await db
    .insert(projectMetricsTable)
    .values({ projectId: project_id, metricName: metric_name, value: String(value), unit: unit ?? null })
    .returning();

  // Broadcast to live SSE clients
  eventBus.emit("live", { type: "metric", projectId: project_id, data: row });

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/conversation ───────────────────────────────────────────────
router.post("/ingest/conversation", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, session_id, user_message, assistant_message, model, tokens_used } = req.body ?? {};
  if (
    typeof project_id !== "number" ||
    typeof session_id !== "string" ||
    typeof user_message !== "string" ||
    typeof assistant_message !== "string"
  ) {
    res.status(400).json({ error: "Required fields: project_id, session_id, user_message, assistant_message" });
    return;
  }
  const [row] = await db
    .insert(aiConversationsTable)
    .values({
      projectId: project_id,
      sessionId: session_id,
      userMessage: user_message,
      assistantMessage: assistant_message,
      model: model ?? null,
      tokensUsed: typeof tokens_used === "number" ? tokens_used : null,
    })
    .returning();
  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/website-visit ──────────────────────────────────────────────
router.post("/ingest/website-visit", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, page_path, referrer, user_agent, country } = req.body ?? {};
  if (typeof project_id !== "number" || typeof page_path !== "string") {
    res.status(400).json({ error: "Required fields: project_id (number), page_path (string)" });
    return;
  }
  const [row] = await db
    .insert(websiteVisitsTable)
    .values({
      projectId: project_id,
      pagePath: page_path,
      referrer: referrer ?? null,
      userAgent: user_agent ?? null,
      country: country ?? null,
    })
    .returning();
  res.status(201).json({ ok: true, id: row.id });
});

export default router;
