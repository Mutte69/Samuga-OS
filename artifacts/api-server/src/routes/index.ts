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

export default router;
