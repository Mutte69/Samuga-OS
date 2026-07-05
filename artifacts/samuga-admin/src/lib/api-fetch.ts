/**
 * Thin fetch wrapper used by all hub pages.
 *
 * In Replit dev the two services share a proxy domain so relative paths
 * (`/api/v1/...`) work fine.  On Railway (or any multi-service deployment)
 * the admin frontend and API server live on different domains.  Set
 * VITE_API_BASE_URL at build time (e.g. https://samuga-api.up.railway.app)
 * and every request will be sent to the correct host.
 *
 * The same env var is already consumed by main.tsx → setBaseUrl() for the
 * generated api-client-react functions (listProjects, getProjectVisits, …).
 * This helper provides the same behaviour for pages that call fetch() directly.
 */
const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/**
 * Drop-in replacement for `fetch` that:
 * - Prepends VITE_API_BASE_URL when set (handles cross-origin Railway setup)
 * - Always sends session cookies (`credentials: "include"`)
 * - Accepts the same RequestInit overrides as fetch
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, { credentials: "include", ...init });
}

/** The resolved API base — useful for constructing non-fetch URLs (e.g. EventSource). */
export const API_BASE = BASE;
