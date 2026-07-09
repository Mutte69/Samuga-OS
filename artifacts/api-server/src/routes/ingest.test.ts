/**
 * Integration tests for the four ingest POST endpoints.
 *
 * Verifies that each endpoint:
 *   1. Returns 404 with { error: "No project found with slug ..." } for an unknown slug.
 *   2. Returns 404 with { error: "No project found with id ..." } for a non-existent numeric id.
 *   3. Returns 201 with { ok: true, id: <number> } when the project exists.
 *
 * The database, middleware, eventBus, and telemetry are all mocked so these
 * tests run without a real Postgres connection or API key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ── vi.hoisted: declare shared mock state before vi.mock factories run ───────
//
// vi.mock factories are hoisted to the top of the file at compile time.
// Any variables they reference must also be hoisted via vi.hoisted(), otherwise
// you get "Cannot access '...' before initialization".

const { mockSelectResult, mockInsertResult, mockFns } = vi.hoisted(() => {
  const mockSelectResult: { id: number }[] = [];
  const mockInsertResult: { id: number }[] = [{ id: 99 }];

  const mockLimit = vi.fn(async () => mockSelectResult);
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  const mockReturning = vi.fn(async () => mockInsertResult);
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  return {
    mockSelectResult,
    mockInsertResult,
    mockFns: {
      mockLimit,
      mockWhere,
      mockFrom,
      mockSelect,
      mockReturning,
      mockValues,
      mockInsert,
    },
  };
});

// ── Mock @workspace/db before any import resolves it ────────────────────────
//
// lib/db/src/index.ts throws at module evaluation if DATABASE_URL is absent,
// so we replace the entire module with a controllable stub.

vi.mock("@workspace/db", () => ({
  db: { select: mockFns.mockSelect, insert: mockFns.mockInsert },
  projectsTable: { id: "id", slug: "slug" },
  projectEventsTable: {},
  projectMetricsTable: {},
  aiConversationsTable: {},
  websiteVisitsTable: {},
  pool: {},
}));

// ── Mock middleware and side-effect modules ──────────────────────────────────

vi.mock("../middleware/requireIngestKey", () => ({
  requireIngestKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/ingestRateLimit", () => ({
  ingestRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/eventBus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("../lib/telemetry", () => ({
  telemetry: { metric: vi.fn() },
}));

vi.mock("geoip-lite", () => ({
  default: { lookup: vi.fn(() => null) },
}));

// ── Import the router under test (after all vi.mock declarations) ────────────

import ingestRouter from "./ingest";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(ingestRouter);
  return app;
}

/** Minimal valid bodies for each endpoint (keyed by route suffix). */
const validBodies = {
  event: {
    project_slug: "my-project",
    event_type: "click",
    message: "User clicked button",
  },
  metric: {
    project_slug: "my-project",
    metric_name: "response_time",
    value: 123,
  },
  conversation: {
    project_slug: "my-project",
    session_id: "sess-1",
    user_message: "Hello",
    assistant_message: "Hi there",
  },
  "website-visit": {
    project_slug: "my-project",
    page_path: "/home",
  },
} as const;

/** Wire up the db mock chain; called in beforeEach after vi.clearAllMocks(). */
function resetDbMock(selectResult: { id: number }[] = []) {
  mockSelectResult.length = 0;
  for (const row of selectResult) mockSelectResult.push(row);

  mockInsertResult.length = 0;
  mockInsertResult.push({ id: 99 });

  const { mockLimit, mockWhere, mockFrom, mockSelect, mockReturning, mockValues, mockInsert } =
    mockFns;

  mockLimit.mockImplementation(async () => mockSelectResult);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
  mockSelect.mockReturnValue({ from: mockFrom });

  mockReturning.mockImplementation(async () => mockInsertResult);
  mockValues.mockReturnValue({ returning: mockReturning });
  mockInsert.mockReturnValue({ values: mockValues });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ingest endpoints – slug / id resolution", () => {
  let app: Express;

  beforeEach(() => {
    app = buildApp();
    vi.clearAllMocks();
    // Default: no project found (select returns []).
    resetDbMock();
  });

  // ── /ingest/event ─────────────────────────────────────────────────────────

  describe("POST /ingest/event", () => {
    const endpoint = "/ingest/event";

    it("returns 404 with a slug message for an unknown slug", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.event, project_slug: "ghost-slug" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("ghost-slug"),
      });
    });

    it("returns 404 with an id message for a non-existent numeric project_id", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.event, project_slug: undefined, project_id: 99999 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("99999"),
      });
    });

    it("returns 201 ok for a valid project resolved by slug", async () => {
      resetDbMock([{ id: 1 }]);
      const res = await request(app).post(endpoint).send(validBodies.event);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });

    it("returns 201 ok for a valid project resolved by numeric id", async () => {
      resetDbMock([{ id: 1 }]);
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.event, project_slug: undefined, project_id: 1 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });
  });

  // ── /ingest/metric ────────────────────────────────────────────────────────

  describe("POST /ingest/metric", () => {
    const endpoint = "/ingest/metric";

    it("returns 404 with a slug message for an unknown slug", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.metric, project_slug: "no-such-project" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("no-such-project"),
      });
    });

    it("returns 404 with an id message for a non-existent numeric project_id", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.metric, project_slug: undefined, project_id: 77777 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("77777"),
      });
    });

    it("returns 201 ok for a valid project resolved by slug", async () => {
      resetDbMock([{ id: 2 }]);
      const res = await request(app).post(endpoint).send(validBodies.metric);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });

    it("returns 201 ok for a valid project resolved by numeric id", async () => {
      resetDbMock([{ id: 2 }]);
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.metric, project_slug: undefined, project_id: 2 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });
  });

  // ── /ingest/conversation ──────────────────────────────────────────────────

  describe("POST /ingest/conversation", () => {
    const endpoint = "/ingest/conversation";

    it("returns 404 with a slug message for an unknown slug", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.conversation, project_slug: "unknown-slug" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("unknown-slug"),
      });
    });

    it("returns 404 with an id message for a non-existent numeric project_id", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.conversation, project_slug: undefined, project_id: 55555 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("55555"),
      });
    });

    it("returns 201 ok for a valid project resolved by slug", async () => {
      resetDbMock([{ id: 3 }]);
      const res = await request(app)
        .post(endpoint)
        .send(validBodies.conversation);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });

    it("returns 201 ok for a valid project resolved by numeric id", async () => {
      resetDbMock([{ id: 3 }]);
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies.conversation, project_slug: undefined, project_id: 3 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });
  });

  // ── /ingest/website-visit ─────────────────────────────────────────────────

  describe("POST /ingest/website-visit", () => {
    const endpoint = "/ingest/website-visit";

    it("returns 404 with a slug message for an unknown slug", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies["website-visit"], project_slug: "missing-slug" });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("missing-slug"),
      });
    });

    it("returns 404 with an id message for a non-existent numeric project_id", async () => {
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies["website-visit"], project_slug: undefined, project_id: 33333 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringContaining("33333"),
      });
    });

    it("returns 201 ok for a valid project resolved by slug", async () => {
      resetDbMock([{ id: 4 }]);
      const res = await request(app)
        .post(endpoint)
        .send(validBodies["website-visit"]);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });

    it("returns 201 ok for a valid project resolved by numeric id", async () => {
      resetDbMock([{ id: 4 }]);
      const res = await request(app)
        .post(endpoint)
        .send({ ...validBodies["website-visit"], project_slug: undefined, project_id: 4 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, id: expect.any(Number) });
    });
  });
});
