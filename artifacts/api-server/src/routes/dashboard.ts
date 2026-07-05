import { Router, type IRouter } from "express";
import { db, systemLogsTable, userAnalyticsTable, systemConfigsTable, apiKeysTable } from "@workspace/db";
import { count, gte, sql } from "drizzle-orm";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

router.get("/v1/dashboard/stats", requireAdminSession, async (_req, res): Promise<void> => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    [{ value: totalLogs }],
    [{ value: totalAnalytics }],
    [{ value: totalConfigs }],
    [{ value: totalApiKeys }],
    logsByLevelRaw,
    recentLogsRaw,
    recentAnalyticsRaw,
    platformBreakdownRaw,
  ] = await Promise.all([
    db.select({ value: count() }).from(systemLogsTable),
    db.select({ value: count() }).from(userAnalyticsTable),
    db.select({ value: count() }).from(systemConfigsTable),
    db.select({ value: count() }).from(apiKeysTable),
    db
      .select({ level: systemLogsTable.logLevel, count: count() })
      .from(systemLogsTable)
      .groupBy(systemLogsTable.logLevel),
    db
      .select({
        hour: sql<string>`date_trunc('hour', ${systemLogsTable.timestamp})`,
        count: count(),
      })
      .from(systemLogsTable)
      .where(gte(systemLogsTable.timestamp, since24h))
      .groupBy(sql`date_trunc('hour', ${systemLogsTable.timestamp})`)
      .orderBy(sql`date_trunc('hour', ${systemLogsTable.timestamp})`),
    db
      .select({
        hour: sql<string>`date_trunc('hour', ${userAnalyticsTable.timestamp})`,
        count: count(),
      })
      .from(userAnalyticsTable)
      .where(gte(userAnalyticsTable.timestamp, since24h))
      .groupBy(sql`date_trunc('hour', ${userAnalyticsTable.timestamp})`)
      .orderBy(sql`date_trunc('hour', ${userAnalyticsTable.timestamp})`),
    db
      .select({ platform: userAnalyticsTable.platform, count: count() })
      .from(userAnalyticsTable)
      .groupBy(userAnalyticsTable.platform),
  ]);

  // Merge logs + analytics by hour for recentActivity chart
  const hourMap = new Map<string, { hour: string; logs: number; analytics: number }>();
  for (const r of recentLogsRaw) {
    const h = r.hour;
    if (!hourMap.has(h)) hourMap.set(h, { hour: h, logs: 0, analytics: 0 });
    hourMap.get(h)!.logs = Number(r.count);
  }
  for (const r of recentAnalyticsRaw) {
    const h = r.hour;
    if (!hourMap.has(h)) hourMap.set(h, { hour: h, logs: 0, analytics: 0 });
    hourMap.get(h)!.analytics = Number(r.count);
  }

  const recentActivity = Array.from(hourMap.values())
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .map((r) => ({ hour: r.hour, logs: r.logs, analytics: r.analytics }));

  res.json({
    totalLogs: Number(totalLogs),
    totalAnalytics: Number(totalAnalytics),
    totalConfigs: Number(totalConfigs),
    totalApiKeys: Number(totalApiKeys),
    logsByLevel: logsByLevelRaw.map((r) => ({ level: r.level, count: Number(r.count) })),
    recentActivity,
    platformBreakdown: platformBreakdownRaw.map((r) => ({ platform: r.platform, count: Number(r.count) })),
  });
});

export default router;
