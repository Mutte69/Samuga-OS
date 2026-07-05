import { Request, Response, NextFunction } from "express";

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { adminUser?: string };
  if (!session.adminUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
