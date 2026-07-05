import { Router, type IRouter } from "express";
import { db, systemConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpsertConfigBody, DeleteConfigParams, PushConfigParams } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

router.get("/v1/configs", requireAdminSession, async (_req, res): Promise<void> => {
  const configs = await db.select().from(systemConfigsTable).orderBy(systemConfigsTable.key);
  res.json(configs.map((c) => ({
    id: c.id,
    key: c.key,
    value: c.value,
    description: c.description,
    webhook_url: c.webhookUrl,
    updatedAt: c.updatedAt.toISOString(),
  })));
});

router.post("/v1/configs", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = UpsertConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { key, value, description, webhook_url } = parsed.data;
  const [config] = await db
    .insert(systemConfigsTable)
    .values({ key, value, description: description ?? null, webhookUrl: webhook_url ?? null })
    .onConflictDoUpdate({
      target: systemConfigsTable.key,
      set: { value, description: description ?? null, webhookUrl: webhook_url ?? null, updatedAt: new Date() },
    })
    .returning();

  res.json({
    id: config.id,
    key: config.key,
    value: config.value,
    description: config.description,
    webhook_url: config.webhookUrl,
    updatedAt: config.updatedAt.toISOString(),
  });
});

router.delete("/v1/configs/:key", requireAdminSession, async (req, res): Promise<void> => {
  const params = DeleteConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(systemConfigsTable).where(eq(systemConfigsTable.key, params.data.key)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Config not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/v1/configs/:key/push", requireAdminSession, async (req, res): Promise<void> => {
  const params = PushConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [config] = await db.select().from(systemConfigsTable).where(eq(systemConfigsTable.key, params.data.key));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }

  if (!config.webhookUrl) {
    res.json({ success: false, statusCode: 0, message: "No webhook URL configured for this config" });
    return;
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: config.key, value: config.value }),
      signal: AbortSignal.timeout(10_000),
    });
    res.json({ success: response.ok, statusCode: response.status, message: response.ok ? "Pushed successfully" : `Webhook returned ${response.status}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook request failed";
    res.json({ success: false, statusCode: 0, message });
  }
});

export default router;
