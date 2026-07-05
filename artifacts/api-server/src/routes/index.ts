import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import logsRouter from "./logs";
import analyticsRouter from "./analytics";
import configsRouter from "./configs";
import apiKeysRouter from "./api-keys";
import aiRouter from "./ai";
import dashboardRouter from "./dashboard";
import reposRouter from "./repos";
import ingestRouter from "./ingest";
import projectsRouter from "./projects";
import overviewRouter from "./overview";
import liveRouter from "./live";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(logsRouter);
router.use(analyticsRouter);
router.use(configsRouter);
router.use(apiKeysRouter);
router.use(aiRouter);
router.use(dashboardRouter);
router.use(reposRouter);
router.use(ingestRouter);
router.use(projectsRouter);
router.use(overviewRouter);
router.use(liveRouter);

export default router;
