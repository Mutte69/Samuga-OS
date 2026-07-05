import { Router, type IRouter } from "express";
import { db, projectsTable, projectMetricsTable, projectEventsTable, aiConversationsTable, websiteVisitsTable } from "@workspace/db";
import { count, desc, eq, sql } from "drizzle-orm";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

router.get("/v1/overview", requireAdminSession, async (_req, res): Promise<void> => {
  const [
    [{ value: totalEvents }],
    [{ value: totalMetrics }],
    [{ value: totalConversations }],
    [{ value: totalVisits }],
    recentEvents,
    projectBreakdownRaw,
  ] = await Promise.all([
    db.select({ value: count() }).from(projectEventsTable),
    db.select({ value: count() }).from(projectMetricsTable),
    db.select({ value: count() }).from(aiConversationsTable),
    db.select({ value: count() }).from(websiteVisitsTable),
    db
      .select({
        id: projectEventsTable.id,
        projectId: projectEventsTable.projectId,
        eventType: projectEventsTable.eventType,
        message: projectEventsTable.message,
        occurredAt: projectEventsTable.occurredAt,
      })
      .from(projectEventsTable)
      .orderBy(desc(projectEventsTable.occurredAt))
      .limit(20),
    db
      .select({
        projectId: projectEventsTable.projectId,
        eventCount: count(),
      })
      .from(projectEventsTable)
      .groupBy(projectEventsTable.projectId),
  ]);

  // Enrich recentEvents with project names
  const projects = await db.select().from(projectsTable);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  res.json({
    totalEvents: Number(totalEvents),
    totalMetrics: Number(totalMetrics),
    totalConversations: Number(totalConversations),
    totalVisits: Number(totalVisits),
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      projectName: projectMap.get(e.projectId)?.name ?? "Unknown",
      eventType: e.eventType,
      message: e.message,
      occurredAt: e.occurredAt,
    })),
    projectBreakdown: projectBreakdownRaw.map((r) => ({
      projectId: r.projectId,
      projectName: projectMap.get(r.projectId)?.name ?? "Unknown",
      eventCount: Number(r.eventCount),
    })),
  });
});

export default router;
