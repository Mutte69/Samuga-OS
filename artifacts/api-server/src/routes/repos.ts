import { Router, type IRouter } from "express";
import { requireAdminSession } from "../middlewares/session-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Warn at startup only when neither credential is configured.
// GITHUB_TOKEN alone is sufficient for the authenticated /user/repos endpoint.
// GITHUB_OWNER alone allows the public /users/:owner/repos endpoint (public repos only).
if (!process.env.GITHUB_TOKEN?.trim() && !process.env.GITHUB_OWNER?.trim()) {
  logger.warn(
    "Neither GITHUB_TOKEN nor GITHUB_OWNER is set — GET /repos will return 503",
  );
}

router.get("/repos", requireAdminSession, async (_req, res): Promise<void> => {
  // Read at request time so a redeploy with updated env vars is picked up
  // without a code change.
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_OWNER = process.env.GITHUB_OWNER?.trim();

  if (!GITHUB_TOKEN && !GITHUB_OWNER) {
    res.status(503).json({
      error:
        "GitHub not configured. Set GITHUB_TOKEN (recommended) or GITHUB_OWNER on the server.",
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

  logger.info(
    { owner: GITHUB_OWNER ?? "(from token)", authenticated: !!GITHUB_TOKEN },
    "Fetching GitHub repositories",
  );

  let page = 1;
  const allRepos: unknown[] = [];

  while (true) {
    // When a token is present, use the authenticated /user/repos endpoint so
    // that private repositories are included — the owner is inferred from the
    // token itself, so GITHUB_OWNER is not required.
    //
    // Without a token, fall back to the public /users/:owner/repos endpoint
    // (public repos only, lower rate limit, requires GITHUB_OWNER).
    const url = GITHUB_TOKEN
      ? `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`
      : `https://api.github.com/users/${encodeURIComponent(GITHUB_OWNER!)}/repos?per_page=100&page=${page}&sort=updated`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, owner: GITHUB_OWNER ?? "(from token)", body },
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

  logger.info(
    { owner: GITHUB_OWNER ?? "(from token)", count: repos.length },
    "Repos fetched",
  );
  res.json({ repos, total: repos.length });
});

export default router;
