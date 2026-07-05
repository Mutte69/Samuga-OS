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

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Startup telemetry (non-blocking) ─────────────────────────────────────
  // probe() logs env var presence, shows the exact URL being called, sends a
  // hub_integration_test event immediately, and logs the Hub's response.
  // Wrapped in void so server startup is never delayed.
  void (async () => {
    await telemetry.probe();
    telemetry.event("info", "service_started", {
      port,
      node_env: process.env.NODE_ENV ?? "development",
    });
  })();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");
  telemetry.event("warn", "service_stopped", { signal });

  // Give the fire-and-forget service_stopped event a moment to fire
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
