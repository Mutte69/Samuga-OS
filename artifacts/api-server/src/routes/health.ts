import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Root probe: pid1 health-checks the artifact at its path prefix (GET /api)
// before Cloud Run probes the configured /api/healthz. Must return 2xx.
router.get("/", (_req, res) => {
  res.json({ api: "samuga-ai", status: "ok" });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
