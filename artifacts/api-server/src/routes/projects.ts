import { Router, type IRouter } from "express";
import { db, projectsTable, projectMetricsTable, projectEventsTable, aiConversationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

function parseParamId(raw: unknown): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(String(str), 10);
}

// GET /v1/projects — list all projects
router.get("/v1/projects", requireAdminSession, async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(projectsTable.name);
  res.json({ projects });
});

// GET /v1/projects/:id/metrics — last 500 rows desc
router.get("/v1/projects/:id/metrics", requireAdminSession, async (req, res): Promise<void> => {
  const id = parseParamId(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const metrics = await db
    .select().from(projectMetricsTable)
    .where(eq(projectMetricsTable.projectId, id))
    .orderBy(desc(projectMetricsTable.recordedAt)).limit(500);
  res.json({ metrics });
});

// GET /v1/projects/:id/events — last 500 rows desc
router.get("/v1/projects/:id/events", requireAdminSession, async (req, res): Promise<void> => {
  const id = parseParamId(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const events = await db
    .select().from(projectEventsTable)
    .where(eq(projectEventsTable.projectId, id))
    .orderBy(desc(projectEventsTable.occurredAt)).limit(500);
  res.json({ events });
});

// GET /v1/projects/:id/conversations — last 200 rows desc
router.get("/v1/projects/:id/conversations", requireAdminSession, async (req, res): Promise<void> => {
  const id = parseParamId(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const conversations = await db
    .select().from(aiConversationsTable)
    .where(eq(aiConversationsTable.projectId, id))
    .orderBy(desc(aiConversationsTable.startedAt)).limit(200);
  res.json({ conversations });
});

export default router;
