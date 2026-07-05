import { Router, type IRouter } from "express";
import { db, systemLogsTable } from "@workspace/db";
import { and, count, desc, ilike, eq } from "drizzle-orm";
import { IngestLogBody, ListLogsQueryParams } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";
import { requireApiKey } from "../middlewares/api-key-auth";

const router: IRouter = Router();

// External ingestion — API key auth
router.post("/v1/logs", requireApiKey, async (req, res): Promise<void> => {
  const parsed = IngestLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { source_repo, log_level, message } = parsed.data;
  const [log] = await db
    .insert(systemLogsTable)
    .values({ sourceRepo: source_repo, logLevel: log_level, message })
    .returning();

  res.status(201).json({
    id: log.id,
    source_repo: log.sourceRepo,
    log_level: log.logLevel,
    message: log.message,
    timestamp: log.timestamp.toISOString(),
  });
});

// Admin query — session auth
router.get("/v1/logs", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = ListLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { source_repo, log_level, limit = 100, offset = 0, search } = parsed.data;

  const conditions = [];
  if (source_repo) conditions.push(eq(systemLogsTable.sourceRepo, source_repo));
  if (log_level) conditions.push(eq(systemLogsTable.logLevel, log_level));
  if (search) conditions.push(ilike(systemLogsTable.message, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ value: total }]] = await Promise.all([
    db.select().from(systemLogsTable).where(where).orderBy(desc(systemLogsTable.timestamp)).limit(limit).offset(offset),
    db.select({ value: count() }).from(systemLogsTable).where(where),
  ]);

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      source_repo: l.sourceRepo,
      log_level: l.logLevel,
      message: l.message,
      timestamp: l.timestamp.toISOString(),
    })),
    total: Number(total),
  });
});

export default router;
