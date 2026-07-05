import { Router, type IRouter } from "express";
import { requireAdminSession } from "../middlewares/session-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
const GITHUB_OWNER = process.env.GITHUB_OWNER?.trim();

if (!GITHUB_OWNER) {
  logger.warn(
    "GITHUB_OWNER environment variable is not set — GET /repos will return 503",
  );
}

// GITHUB_TOKEN is intentionally not validated at startup — it is optional for
// public repos. Missing token reduces rate-limit to 60 req/h; still functional.

router.get("/repos", requireAdminSession, async (_req, res): Promise<void> => {
  if (!GITHUB_OWNER) {
    res.status(503).json({
      error: "GitHub owner not configured. Set GITHUB_OWNER on the server.",
    });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (GITHUB_TOKEN) {
    // Token is only ever used server-side — never forwarded to the client.
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  logger.info({ owner: GITHUB_OWNER }, "Fetching GitHub repositories");

  let page = 1;
  const allRepos: unknown[] = [];

  // GitHub paginates at 100 items/page; walk all pages.
  while (true) {
    const url = `https://api.github.com/users/${encodeURIComponent(GITHUB_OWNER)}/repos?per_page=100&page=${page}&sort=updated`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, owner: GITHUB_OWNER, body },
        "GitHub API error",
      );
      res.status(502).json({
        error: `GitHub API returned ${response.status}`,
        detail: body,
      });
      return;
    }

    const batch = (await response.json()) as unknown[];
    allRepos.push(...batch);

    if (batch.length < 100) break; // last page
    page++;
  }

  // Shape the response — only expose the fields the frontend needs.
  // This ensures the GitHub token and any sensitive metadata stay server-side.
  const repos = allRepos.map((r: any) => ({
    name: r.name as string,
    full_name: r.full_name as string,
    html_url: r.html_url as string,
    description: (r.description ?? null) as string | null,
    default_branch: r.default_branch as string,
    private: r.private as boolean,
    updated_at: r.updated_at as string,
    language: (r.language ?? null) as string | null,
  }));

  logger.info({ owner: GITHUB_OWNER, count: repos.length }, "Repos fetched");
  res.json({ repos, total: repos.length });
});

export default router;
