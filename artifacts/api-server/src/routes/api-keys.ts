import { Router, type IRouter } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { CreateApiKeyBody, DeleteApiKeyParams } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

router.get("/v1/api-keys", requireAdminSession, async (_req, res): Promise<void> => {
  const keys = await db.select().from(apiKeysTable).orderBy(apiKeysTable.createdAt);
  res.json(keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPreview: k.keyPreview,
    createdAt: k.createdAt.toISOString(),
    lastUsed: k.lastUsed ? k.lastUsed.toISOString() : null,
  })));
});

router.post("/v1/api-keys", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rawKey = `sk_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPreview = `${rawKey.slice(0, 10)}...`;

  const [created] = await db
    .insert(apiKeysTable)
    .values({ name: parsed.data.name, keyHash, keyPreview })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    key: rawKey,
    keyPreview: created.keyPreview,
    createdAt: created.createdAt.toISOString(),
  });
});

router.delete("/v1/api-keys/:id", requireAdminSession, async (req, res): Promise<void> => {
  const params = DeleteApiKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
