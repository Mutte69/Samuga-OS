import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { telemetry } from "./lib/telemetry";
import { pool } from "@workspace/db";

const app: Express = express();

// Trust ALL upstream proxy hops (Replit CDN, Railway, Cloudflare, etc.).
// This ensures req.secure = true for HTTPS requests regardless of chain depth,
// which is required for express-session to set the Set-Cookie header when
// cookie.secure: true.  Safe because our app is always deployed behind a
// managed PaaS proxy — it is never directly exposed to the internet.
app.set("trust proxy", true);

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
  // On Replit both the frontend and API are served at the same domain so
  // CORS is not needed — this is not an error.  On Railway (cross-origin),
  // set CORS_ORIGIN to the frontend URL.
  logger.warn(
    "CORS_ORIGIN is not set — using open CORS (all origins). " +
    "Set CORS_ORIGIN to your frontend URL if running cross-origin (e.g. on Railway).",
  );
}

const corsOrigins = rawCorsOrigin ? rawCorsOrigin.split(/\s+/).filter(Boolean) : [];
const isCrossOrigin = corsOrigins.length > 0;

// Cross-origin (Railway / separate domains): allow specific origins + send credentials.
// Same-origin (Replit / shared domain): CORS middleware just passes through;
//   browsers don't enforce CORS for same-origin requests so no credentials header needed.
//   We explicitly set origin: false so we never reflect arbitrary origins with credentials.
const corsOptions = isCrossOrigin
  ? { origin: corsOrigins, credentials: true }
  : { origin: false };

logger.info(
  { mode: isCrossOrigin ? "cross-origin" : "same-origin", allowedOrigins: corsOrigins },
  "[cors] configuration",
);

app.use(cors(corsOptions));
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

// ── Core tables bootstrap ────────────────────────────────────────────────────
// These tables are defined in lib/db schema but have no Drizzle migration runner,
// so we ensure they exist here alongside the session table.
const coreTables = [
  `CREATE TABLE IF NOT EXISTS "system_logs" (
    "id"          serial       PRIMARY KEY,
    "source_repo" text         NOT NULL,
    "log_level"   text         NOT NULL,
    "message"     text         NOT NULL,
    "timestamp"   timestamptz  NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "user_analytics" (
    "id"               serial       PRIMARY KEY,
    "platform"         text         NOT NULL,
    "user_identifier"  text         NOT NULL,
    "action_performed" text         NOT NULL,
    "data_payload"     jsonb,
    "timestamp"        timestamptz  NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "system_configs" (
    "id"          serial       PRIMARY KEY,
    "key"         text         NOT NULL UNIQUE,
    "value"       text         NOT NULL,
    "description" text,
    "webhook_url" text,
    "updated_at"  timestamptz  NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "api_keys" (
    "id"          serial       PRIMARY KEY,
    "name"        text         NOT NULL,
    "key_hash"    text         NOT NULL UNIQUE,
    "key_preview" text         NOT NULL,
    "created_at"  timestamptz  NOT NULL DEFAULT now(),
    "last_used"   timestamptz
  )`,
];

for (const ddl of coreTables) {
  try {
    await pool.query(ddl);
  } catch (err) {
    logger.warn({ err }, "Failed to create core table (non-fatal)");
  }
}

// ── Rate-limit events table ──────────────────────────────────────────────────
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "rate_limit_events" (
      "id"          serial       PRIMARY KEY,
      "ip"          text         NOT NULL,
      "path"        text         NOT NULL,
      "hit_count"   integer      NOT NULL,
      "occurred_at" timestamptz  NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_rate_limit_events_occurred_at"
      ON "rate_limit_events" ("occurred_at" DESC);
  `);
} catch (err) {
  logger.warn({ err }, "Failed to create rate_limit_events table (non-fatal)");
}

// ── New project tables bootstrap ────────────────────────────────────────────
const newTables = [
  `CREATE TABLE IF NOT EXISTS "projects" (
    "id"          serial        PRIMARY KEY,
    "name"        text          NOT NULL,
    "slug"        text          NOT NULL UNIQUE,
    "description" text,
    "created_at"  timestamptz   NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "project_metrics" (
    "id"           serial      PRIMARY KEY,
    "project_id"   integer     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    "metric_name"  text        NOT NULL,
    "value"        numeric     NOT NULL,
    "unit"         text,
    "recorded_at"  timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "project_events" (
    "id"          serial      PRIMARY KEY,
    "project_id"  integer     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    "event_type"  text        NOT NULL,
    "message"     text        NOT NULL,
    "metadata"    jsonb,
    "occurred_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "ai_conversations" (
    "id"                serial      PRIMARY KEY,
    "project_id"        integer     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    "session_id"        text        NOT NULL,
    "user_message"      text        NOT NULL,
    "assistant_message" text        NOT NULL,
    "model"             text,
    "tokens_used"       integer,
    "started_at"        timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "website_visits" (
    "id"          serial      PRIMARY KEY,
    "project_id"  integer     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    "page_path"   text        NOT NULL,
    "referrer"    text,
    "user_agent"  text,
    "country"     text,
    "visited_at"  timestamptz NOT NULL DEFAULT now()
  )`,
];

for (const ddl of newTables) {
  try {
    await pool.query(ddl);
  } catch (err) {
    logger.warn({ err }, "Failed to create table (non-fatal)");
  }
}

// Seed the five core projects (idempotent)
const seedProjects = [
  { name: "Samuga-OS", slug: "samuga-os", description: "Core operating system and orchestration layer" },
  { name: "samuga-news-bot", slug: "samuga-news-bot", description: "Automated news scraping and summarisation bot" },
  { name: "samugatravels-miniapp", slug: "samugatravels-miniapp", description: "Telegram mini-app for Samuga Travels bookings" },
  { name: "Samuga-Travels", slug: "samuga-travels", description: "Travel booking and itinerary management platform" },
  { name: "Samuga-Media", slug: "samuga-media", description: "Media publishing and content distribution hub" },
];

for (const p of seedProjects) {
  try {
    await pool.query(
      `INSERT INTO projects (name, slug, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [p.name, p.slug, p.description],
    );
  } catch (err) {
    logger.warn({ err, slug: p.slug }, "Failed to seed project (non-fatal)");
  }
}

// Warn if INGEST_API_KEY is not set
if (!process.env.INGEST_API_KEY) {
  logger.warn("INGEST_API_KEY is not set — ingest endpoints will return 503");
}

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
      // SameSite=None is required only for CROSS-ORIGIN setups (e.g. Railway where
      // the admin frontend and API server are on different domains).
      // On Replit both are served at the same domain, so SameSite=Lax is correct
      // and avoids the strict "Secure required" enforcement that SameSite=None imposes.
      //
      // We detect cross-origin by whether CORS_ORIGIN is explicitly configured:
      //   - CORS_ORIGIN set  → cross-origin Railway setup → SameSite=None + Secure
      //   - CORS_ORIGIN unset → same-origin Replit setup  → SameSite=Lax
      secure: isCrossOrigin ? true : isProduction,
      sameSite: isCrossOrigin ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// ── Per-request telemetry middleware ─────────────────────────────────────────
// Fires after every completed API request: tracks request count + response time.
// Uses res.on("finish") so it never blocks the response.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    const isError = res.statusCode >= 500;
    const isClientErr = res.statusCode >= 400 && res.statusCode < 500;

    telemetry.metric("requests_handled", 1, "count");
    telemetry.metric("response_time_ms", elapsed, "ms");

    if (isError) {
      telemetry.metric("failed_actions", 1, "count");
      telemetry.event("error", `${req.method} ${req.path} → ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: elapsed,
      });
    } else if (!isClientErr) {
      telemetry.metric("successful_actions", 1, "count");
    }
  });
  next();
});

app.use("/api", router);

export default app;
