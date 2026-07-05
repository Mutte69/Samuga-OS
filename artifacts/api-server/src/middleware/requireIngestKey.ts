import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

/**
 * Authenticates ingest endpoint requests via INGEST_API_KEY.
 *
 * Accepts the key in either format (both are checked in order):
 *   x-api-key: <key>
 *   Authorization: Bearer <key>
 *
 * Reads INGEST_API_KEY at request time so a missing env var → 503, not a crash.
 */
export function requireIngestKey(req: Request, res: Response, next: NextFunction): void {
  const ingestKey = process.env.INGEST_API_KEY;
  if (!ingestKey) {
    res.status(503).json({ error: "Ingest not configured" });
    return;
  }

  // Extract the provided key from either accepted header
  let providedKey: string | undefined;

  const xApiKey = req.headers["x-api-key"];
  if (xApiKey && typeof xApiKey === "string" && xApiKey.length > 0) {
    providedKey = xApiKey;
  } else {
    const authHeader = req.headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.slice("Bearer ".length);
    }
  }

  if (!providedKey) {
    res.status(401).json({
      error: "Missing authentication. Provide x-api-key header or Authorization: Bearer <key>",
    });
    return;
  }

  try {
    const keyBuf = Buffer.from(providedKey);
    const expectedBuf = Buffer.from(ingestKey);

    if (keyBuf.length !== expectedBuf.length || !timingSafeEqual(keyBuf, expectedBuf)) {
      res.status(401).json({ error: "Invalid ingest API key" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid ingest API key" });
    return;
  }

  next();
}
