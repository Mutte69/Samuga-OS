import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const app: Express = express();

// Railway (and most PaaS providers) sit behind a reverse proxy.
// Without this, req.secure is always false, so express-session refuses to
// set Set-Cookie when cookie.secure: true — the session row is written to
// Postgres but the browser never receives the cookie, breaking cross-origin auth.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS_ORIGIN: space-separated list of allowed origins
// e.g. "https://workspacesamuga-admin.up.railway.app"
// Required in production; falls back to mirroring any origin only in development.
const rawCorsOrigin = process.env.CORS_ORIGIN?.trim();
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !rawCorsOrigin) {
  throw new Error(
    "CORS_ORIGIN environment variable is required in production. " +
    "Set it to the admin frontend URL, e.g. https://workspacesamuga-admin.up.railway.app",
  );
}

const corsOrigin: string | string[] | boolean = rawCorsOrigin
  ? rawCorsOrigin.split(/\s+/).filter(Boolean)
  : true; // dev-only fallback: mirror any origin

console.log("[cors] allowed origins:", corsOrigin);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

// Ensure the session table exists before the session middleware starts.
// We do this explicitly with raw SQL instead of relying on connect-pg-simple's
// createTableIfMissing (which reads table.sql from __dirname — unreliable after bundling).
await pool.query(`
  CREATE TABLE IF NOT EXISTS "session" (
    "sid"    varchar        NOT NULL COLLATE "default",
    "sess"   json           NOT NULL,
    "expire" timestamp(6)   NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
  );
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`);

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // In production the admin frontend is on a different origin (cross-site),
      // so we need SameSite=None + Secure so the browser will include the cookie
      // in cross-origin requests made with credentials: 'include'.
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

export default app;
