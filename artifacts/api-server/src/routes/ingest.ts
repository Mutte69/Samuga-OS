import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, projectEventsTable, projectMetricsTable, aiConversationsTable, websiteVisitsTable, projectsTable } from "@workspace/db";
import { requireIngestKey } from "../middleware/requireIngestKey";
import { ingestRateLimit } from "../middleware/ingestRateLimit";
import { eventBus, type IngestErrorEvent } from "../lib/eventBus";
import { telemetry } from "../lib/telemetry";
import geoip from "geoip-lite";

/** Emit an ingest_error event to all SSE clients. */
function emitIngestError(
  endpoint: string,
  status: number,
  error: string,
  extra?: Pick<IngestErrorEvent, "projectId" | "projectSlug">,
): void {
  const evt: IngestErrorEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    endpoint,
    error,
    status,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  eventBus.emit("ingest_error", evt);
}

/** Resolve a two-letter country code from a request IP, or return null. */
function countryFromRequest(req: import("express").Request): string | null {
  // Trust X-Forwarded-For when behind a proxy (Replit's reverse proxy sets it)
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ??
    req.socket.remoteAddress ??
    "";
  if (!ip) return null;
  const geo = geoip.lookup(ip);
  return geo?.country ?? null;
}

const router: IRouter = Router();

// Apply rate limiting to every ingest route
router.use(ingestRateLimit);

// ── Helper: resolve a numeric project ID from project_id or project_slug ────
async function resolveProjectId(
  project_id: unknown,
  project_slug: unknown,
): Promise<{ id: number } | { error: string; status: number }> {
  if (typeof project_id === "number") {
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, project_id))
      .limit(1);
    if (!project) {
      return { error: `No project found with id ${project_id}`, status: 404 };
    }
    return { id: project.id };
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

// ── Helper: check if a PostgreSQL error is a foreign-key violation ───────────
function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23503"
  );
}

// ── GET /ingest/projects ────────────────────────────────────────────────────
// Returns paginated projects so bots can enumerate available slugs.
// Query params: limit (default 100, max 500), offset (default 0)
router.get("/ingest/projects", requireIngestKey, async (req, res): Promise<void> => {
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 500;

  const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10);
  const rawOffset = parseInt(String(req.query.offset ?? 0), 10);

  const limit = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(projectsTable);

  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, slug: projectsTable.slug })
    .from(projectsTable)
    .orderBy(projectsTable.slug)
    .limit(limit)
    .offset(offset);

  const nextOffset = offset + projects.length;
  const hasMore = nextOffset < count;

  res.json({
    data: projects,
    total: count,
    limit,
    offset,
    next: hasMore ? nextOffset : null,
  });
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
    const errMsg = "Required fields: (project_id or project_slug), event_type (string), message (string)";
    emitIngestError("/ingest/event", 400, errMsg);
    res.status(400).json({ error: errMsg });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    emitIngestError("/ingest/event", resolved.status, resolved.error, {
      projectId: typeof project_id === "number" ? project_id : undefined,
      projectSlug: typeof project_slug === "string" ? project_slug : undefined,
    });
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const ingestStart = Date.now();
  let row: typeof projectEventsTable.$inferSelect;
  try {
    [row] = await db
      .insert(projectEventsTable)
      .values({ projectId: resolved.id, eventType: event_type, message, metadata: metadata ?? null })
      .returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      telemetry.metric("failed_actions", 1, "count");
      emitIngestError("/ingest/event", 404, "Project not found", { projectId: resolved.id });
      res.status(404).json({ error: "Project not found" });
      return;
    }
    throw err;
  }

  const ingestDuration = Date.now() - ingestStart;
  telemetry.metric("items_ingested", 1, "count");
  telemetry.metric("events_ingested", 1, "count");
  telemetry.metric("articles_processed", 1, "count");
  telemetry.metric("ingest_duration_ms", ingestDuration, "ms");

  // Broadcast to live SSE clients
  eventBus.emit("live", { type: "event", projectId: resolved.id, data: row });

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/metric ─────────────────────────────────────────────────────
router.post("/ingest/metric", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, project_slug, metric_name, value, unit } = req.body ?? {};
  if (typeof metric_name !== "string" || value === undefined) {
    const errMsg = "Required fields: (project_id or project_slug), metric_name (string), value (number)";
    emitIngestError("/ingest/metric", 400, errMsg);
    res.status(400).json({ error: errMsg });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    emitIngestError("/ingest/metric", resolved.status, resolved.error, {
      projectId: typeof project_id === "number" ? project_id : undefined,
      projectSlug: typeof project_slug === "string" ? project_slug : undefined,
    });
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const ingestStart = Date.now();
  let row: typeof projectMetricsTable.$inferSelect;
  try {
    [row] = await db
      .insert(projectMetricsTable)
      .values({ projectId: resolved.id, metricName: metric_name, value: String(value), unit: unit ?? null })
      .returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      telemetry.metric("failed_actions", 1, "count");
      emitIngestError("/ingest/metric", 404, "Project not found", { projectId: resolved.id });
      res.status(404).json({ error: "Project not found" });
      return;
    }
    throw err;
  }

  const ingestDuration = Date.now() - ingestStart;
  telemetry.metric("items_ingested", 1, "count");
  telemetry.metric("metrics_recorded", 1, "count");
  telemetry.metric("articles_published", 1, "count");
  telemetry.metric("ingest_duration_ms", ingestDuration, "ms");

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
    const errMsg = "Required fields: (project_id or project_slug), session_id, user_message, assistant_message";
    emitIngestError("/ingest/conversation", 400, errMsg);
    res.status(400).json({ error: errMsg });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    emitIngestError("/ingest/conversation", resolved.status, resolved.error, {
      projectId: typeof project_id === "number" ? project_id : undefined,
      projectSlug: typeof project_slug === "string" ? project_slug : undefined,
    });
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const ingestStart = Date.now();
  let row: typeof aiConversationsTable.$inferSelect;
  try {
    [row] = await db
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
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      telemetry.metric("failed_actions", 1, "count");
      emitIngestError("/ingest/conversation", 404, "Project not found", { projectId: resolved.id });
      res.status(404).json({ error: "Project not found" });
      return;
    }
    throw err;
  }

  const ingestDuration = Date.now() - ingestStart;
  telemetry.metric("items_ingested", 1, "count");
  telemetry.metric("conversations_recorded", 1, "count");
  telemetry.metric("ingest_duration_ms", ingestDuration, "ms");
  if (typeof tokens_used === "number") {
    telemetry.metric("tokens_used", tokens_used, "tokens");
  }

  res.status(201).json({ ok: true, id: row.id });
});

// ── POST /ingest/website-visit ──────────────────────────────────────────────
router.post("/ingest/website-visit", requireIngestKey, async (req, res): Promise<void> => {
  const { project_id, project_slug, page_path, referrer, user_agent, country } = req.body ?? {};
  if (typeof page_path !== "string") {
    const errMsg = "Required fields: (project_id or project_slug), page_path (string)";
    emitIngestError("/ingest/website-visit", 400, errMsg);
    res.status(400).json({ error: errMsg });
    return;
  }
  const resolved = await resolveProjectId(project_id, project_slug);
  if ("error" in resolved) {
    emitIngestError("/ingest/website-visit", resolved.status, resolved.error, {
      projectId: typeof project_id === "number" ? project_id : undefined,
      projectSlug: typeof project_slug === "string" ? project_slug : undefined,
    });
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  // Use caller-supplied country if present; otherwise geo-resolve from request IP
  const resolvedCountry: string | null =
    typeof country === "string" && country.length > 0
      ? country
      : countryFromRequest(req);

  const ingestStart = Date.now();
  let row: typeof websiteVisitsTable.$inferSelect;
  try {
    [row] = await db
      .insert(websiteVisitsTable)
      .values({
        projectId: resolved.id,
        pagePath: page_path,
        referrer: referrer ?? null,
        userAgent: user_agent ?? null,
        country: resolvedCountry,
      })
      .returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      telemetry.metric("failed_actions", 1, "count");
      emitIngestError("/ingest/website-visit", 404, "Project not found", { projectId: resolved.id });
      res.status(404).json({ error: "Project not found" });
      return;
    }
    throw err;
  }

  const ingestDuration = Date.now() - ingestStart;
  telemetry.metric("items_ingested", 1, "count");
  telemetry.metric("visits_recorded", 1, "count");
  telemetry.metric("ingest_duration_ms", ingestDuration, "ms");

  res.status(201).json({ ok: true, id: row.id });
});

export default router;
