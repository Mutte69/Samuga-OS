import { Router, type IRouter } from "express";
import { db, userAnalyticsTable } from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { IngestTelemetryBody, ListAnalyticsQueryParams } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";
import { requireApiKey } from "../middlewares/api-key-auth";

const router: IRouter = Router();

// External ingestion — API key auth
router.post("/v1/telemetry", requireApiKey, async (req, res): Promise<void> => {
  const parsed = IngestTelemetryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { platform, user_identifier, action_performed, data_payload } = parsed.data;
  const [record] = await db
    .insert(userAnalyticsTable)
    .values({
      platform,
      userIdentifier: user_identifier,
      actionPerformed: action_performed,
      dataPayload: data_payload ?? null,
    })
    .returning();

  res.status(201).json({
    id: record.id,
    platform: record.platform,
    user_identifier: record.userIdentifier,
    action_performed: record.actionPerformed,
    data_payload: record.dataPayload,
    timestamp: record.timestamp.toISOString(),
  });
});

// Admin query — session auth
router.get("/v1/analytics", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = ListAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { platform, action, limit = 100, offset = 0 } = parsed.data;

  const conditions = [];
  if (platform) conditions.push(eq(userAnalyticsTable.platform, platform));
  if (action) conditions.push(eq(userAnalyticsTable.actionPerformed, action));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, [{ value: total }]] = await Promise.all([
    db.select().from(userAnalyticsTable).where(where).orderBy(desc(userAnalyticsTable.timestamp)).limit(limit).offset(offset),
    db.select({ value: count() }).from(userAnalyticsTable).where(where),
  ]);

  res.json({
    analytics: records.map((r) => ({
      id: r.id,
      platform: r.platform,
      user_identifier: r.userIdentifier,
      action_performed: r.actionPerformed,
      data_payload: r.dataPayload,
      timestamp: r.timestamp.toISOString(),
    })),
    total: Number(total),
  });
});

export default router;
