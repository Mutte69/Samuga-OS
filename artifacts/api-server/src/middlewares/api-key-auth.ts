import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers["x-api-key"] as string | undefined;
  if (!key) {
    res.status(401).json({ error: "Missing X-Api-Key header" });
    return;
  }

  const keyHash = createHash("sha256").update(key).digest("hex");
  const [apiKey] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.keyHash, keyHash));

  if (!apiKey) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // Update lastUsed asynchronously (don't block the request)
  db.update(apiKeysTable)
    .set({ lastUsed: new Date() })
    .where(eq(apiKeysTable.id, apiKey.id))
    .catch(() => {});

  next();
}
