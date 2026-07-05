import app from "./app";
import { logger } from "./lib/logger";
import { telemetry } from "./lib/telemetry";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Holds the integration-test timer so shutdown() can cancel it if it hasn't
// fired yet — prevents a stale hub_integration_test from emitting after stop.
let integrationTestTimer: ReturnType<typeof setTimeout> | undefined;

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Startup telemetry ────────────────────────────────────────────────────
  telemetry.event("info", "service_started", {
    port,
    node_env: process.env.NODE_ENV ?? "development",
  });

  // ── Hub connectivity test (fires 3 s after startup) ──────────────────────
  // Sends a distinctive event + metric so the operator can immediately confirm
  // this project appears in Data Master Hub → Overview, Recent Events, Projects.
  integrationTestTimer = setTimeout(() => {
    telemetry.event("info", "hub_integration_test", {
      message: "Data Master Hub integration verified — events and metrics are flowing",
    });
    telemetry.metric("integration_test_ok", 1, "count");
  }, 3_000);
  integrationTestTimer.unref();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  // Cancel the integration-test timer if it hasn't fired yet
  if (integrationTestTimer !== undefined) {
    clearTimeout(integrationTestTimer);
    integrationTestTimer = undefined;
  }

  logger.info({ signal }, "Shutdown signal received");
  telemetry.event("warn", "service_stopped", { signal });

  // Give telemetry a moment to fire before closing the server
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  // Hard exit if server hasn't closed within 5 s
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  telemetry.event("error", `uncaught_exception: ${err.message}`, {
    stack: err.stack?.slice(0, 400),
  });
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason }, "Unhandled rejection");
  telemetry.event("error", `unhandled_rejection: ${msg}`);
});
