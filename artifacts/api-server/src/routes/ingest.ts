import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectEventsTable, projectMetricsTable, aiConversationsTable, websiteVisitsTable, projectsTable } from "@workspace/db";
import { requireIngestKey } from "../middleware/requireIngestKey";
import { ingestRateLimit } from "../middleware/ingestRateLimit";
import { eventBus } from "../lib/eventBus";

const router: IRouter = Router();

// Apply rate limiting to every ingest route
router.use(ingestRateLimit);

// ── Helper: resolve a numeric project ID from project_id or project_slug ────
async function resolveProjectId(
  project_id: unknown,
  project_slug: unknown,
): Promise<{ id: number } | { error: string; status: number }> {
  if (typeof project_id === "number") {
    return { id: project_id };
  }
  if (typeof project_slug === "string") {
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.slug, project_slug))
      .limit(1);
    if (!project) {
      return { error: `No project found with slug "${project_slug}"`, status: 404 };
    }
    return { id: project.id };
  }
  return { error: "Required: project_id (number) or project_slug (string)", status: 400 };
}

// ── GET /ingest/projects ────────────────────────────────────────────────────
// Returns all projects so bots can enumerate available slugs.
router.get("/ingest/projects", requireIngestKey, async (_req, res): Promise<void> => {
  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, slug: projectsTable.slug })
    .from(projectsTable)
    .orderBy(projectsTable.slug);
  res.json(projects);
});

// ── GET /ingest/project?slug=<slug> ─────────────────────────────────────────
// Public lookup (ingest key required) — bots use this to resolve a slug to an ID.
router.get("/ingest/project", requireIngestKey, async (req, res): Promise<void> => {
  const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "Required query param: slug" });
    return;
  }
  const [project] = await db
    .select({ id: projectsTable.id, name: projectsTable.name, slug: projectsTable.slug })
    .from(projectsTable)
    .where(eq(projectsTable.slug, slug))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: `No project found with slug "${slug}"` });
    return;
  }
  res.json(project);
});

// ── POST /ingest/event ──────────────────────────────────────────────────────
router.post("/ingest/event", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, project_slug, event_type, message, metadata } = req.body ?? {};
  if (typeof event_type !== "string" || typeof message !== "string") {
    res.status(400).json({ error: "Required fields: (project_id or project_slug), event_type (string), message (string)" });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const [row] = await db
    .insert(projectEventsTable)
    .values({ projectId: resolved.id, eventType: event_type, message, metadata: metadata ?? null })
    .returning();

  // Broadcast to live SSE clients
  eventBus.emit("live", { type: "event", projectId: resolved.id, data: row });

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/metric ─────────────────────────────────────────────────────
router.post("/ingest/metric", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, project_slug, metric_name, value, unit } = req.body ?? {};
  if (typeof metric_name !== "string" || value === undefined) {
    res.status(400).json({ error: "Required fields: (project_id or project_slug), metric_name (string), value (number)" });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const [row] = await db
    .insert(projectMetricsTable)
    .values({ projectId: resolved.id, metricName: metric_name, value: String(value), unit: unit ?? null })
    .returning();

  // Broadcast to live SSE clients
  eventBus.emit("live", { type: "metric", projectId: resolved.id, data: row });

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/conversation ───────────────────────────────────────────────
router.post("/ingest/conversation", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, project_slug, session_id, user_message, assistant_message, model, tokens_used } = req.body ?? {};
  if (
    typeof session_id !== "string" ||
    typeof user_message !== "string" ||
    typeof assistant_message !== "string"
  ) {
    res.status(400).json({ error: "Required fields: (project_id or project_slug), session_id, user_message, assistant_message" });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const [row] = await db
    .insert(aiConversationsTable)
    .values({
      projectId: resolved.id,
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
  const { project_id, project_slug, page_path, referrer, user_agent, country } = req.body ?? {};
  if (typeof page_path !== "string") {
    res.status(400).json({ error: "Required fields: (project_id or project_slug), page_path (string)" });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const [row] = await db
    .insert(websiteVisitsTable)
    .values({
      projectId: resolved.id,
      pagePath: page_path,
      referrer: referrer ?? null,
      userAgent: user_agent ?? null,
      country: country ?? null,
    })
    .returning();
  res.status(201).json({ ok: true, id: row.id });
});

export default router;
