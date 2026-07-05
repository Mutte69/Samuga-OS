import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export function requireIngestKey(req: Request, res: Response, next: NextFunction): void {
  const ingestKey = process.env.INGEST_API_KEY;
  if (!ingestKey) {
    res.status(503).json({ error: "Ingest not configured" });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const providedKey = authHeader.slice("Bearer ".length);

  try {
    const a = Buffer.from(providedKey.padEnd(ingestKey.length, "\0"));
    const b = Buffer.from(ingestKey.padEnd(providedKey.length, "\0"));
    const keyBuf = Buffer.from(providedKey);
    const expectedBuf = Buffer.from(ingestKey);

    if (
      keyBuf.length !== expectedBuf.length ||
      !timingSafeEqual(keyBuf, expectedBuf)
    ) {
      res.status(401).json({ error: "Invalid ingest API key" });
      return;
    }

    // suppress unused var warnings
    void a; void b;
  } catch {
    res.status(401).json({ error: "Invalid ingest API key" });
    return;
  }

  next();
}
