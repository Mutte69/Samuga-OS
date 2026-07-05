import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getProjectVisits, listProjects } from "@workspace/api-client-react";
import type { Project, WebsiteVisit } from "@workspace/api-client-react";

const PROJECT_COLORS = [
  "#22d3ee", "#a78bfa", "#34d399", "#fb923c", "#f472b6", "#facc15", "#60a5fa",
];

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

type DateRange = 7 | 30 | 90;
const DATE_RANGE_OPTIONS: { label: string; days: DateRange }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

/** ISO date string for today */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date string for N days ago (inclusive lower bound) */
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Aggregate visits by ISO date YYYY-MM-DD, optionally within a date window */
function groupByDay(
  visits: WebsiteVisit[],
  fromDate?: string,
  toDate?: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const day = new Date(v.visitedAt).toISOString().slice(0, 10);
    if (fromDate && day < fromDate) continue;
    if (toDate && day > toDate) continue;
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

/** Build a 7-day sparkline array for a specific page path (index 0 = 6 days ago, index 6 = today) */
function pageSparkline(allVisits: WebsiteVisit[], pagePath: string): number[] {
  const counts: number[] = Array(7).fill(0);
  const now = new Date();
  for (const v of allVisits) {
    if ((v.pagePath || "/") !== pagePath) continue;
    const visitDate = new Date(v.visitedAt);
    const diffDays = Math.floor((now.getTime() - visitDate.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays < 7) {
      counts[6 - diffDays] += 1;
    }
  }
  return counts;
}

/** Render a tiny SVG sparkline */
function Sparkline({ data, color = "#22d3ee" }: { data: number[]; color?: string }) {
  const w = 64;
  const h = 24;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const pointsStr = pts.join(" ");
  // Build a filled area path
  const areaPath = `M0,${h} ${pts.map((p) => `L${p}`).join(" ")} L${w},${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="spk-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spk-fill)" />
      <polyline
        points={pointsStr}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Aggregate visits by pagePath, sorted descending */
function topPagesByPath(visits: WebsiteVisit[]): Array<{ path: string; count: number; share: number }> {
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const p = v.pagePath || "/";
    counts[p] = (counts[p] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .map(([path, count]) => ({ path, count, share: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregate visits by referrer; null/empty → "Direct" */
function topReferrers(visits: WebsiteVisit[]): Array<{ label: string; count: number; share: number }> {
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const label = v.referrer?.trim() || "Direct";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, share: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Aggregate visits by country; null/empty → "Unknown" */
function topCountries(visits: WebsiteVisit[]): Array<{ label: string; count: number; share: number }> {
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const label = v.country?.trim() || "Unknown";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, share: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Build recharts data: [{date, <projectName>: count, ...}] */
function buildChartData(
  projects: Project[],
  visitsByProject: Record<number, Record<string, number>>,
): Array<Record<string, string | number>> {
  const dateSet = new Set<string>();
  for (const counts of Object.values(visitsByProject)) {
    for (const d of Object.keys(counts)) dateSet.add(d);
  }
  if (dateSet.size === 0) return [];
  return Array.from(dateSet)
    .sort()
    .map((date) => {
      const row: Record<string, string | number> = { date };
      for (const p of projects) {
        row[p.name] = visitsByProject[p.id]?.[date] ?? 0;
      }
      return row;
    });
}

export default function Traffic() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pageSearch, setPageSearch] = useState("");

  const isCustom = customFrom !== "" || customTo !== "";

  // ── 1. Fetch projects ──────────────────────────────────────────────────
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });
  const projects = projectsData?.projects ?? [];

  // ── 2. Fetch visits for every project in parallel ──────────────────────
  const visitQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project", p.id, "visits", 10000] as const,
      queryFn: () => getProjectVisits(p.id, { limit: 10000 }),
      enabled: projects.length > 0,
    })),
  });

  // ── 3. Derive filtered chart data ──────────────────────────────────────
  const fromDate = isCustom ? (customFrom || "1970-01-01") : daysAgoISO(dateRange);
  const toDate = isCustom ? (customTo || todayISO()) : todayISO();

  const visitsByProject: Record<number, Record<string, number>> = {};
  const rawVisitsByProject: Record<number, WebsiteVisit[]> = {};
  for (let i = 0; i < projects.length; i++) {
    const result = visitQueries[i];
    if (result?.data?.visits) {
      rawVisitsByProject[projects[i].id] = result.data.visits;
      // filtered by date range
      visitsByProject[projects[i].id] = groupByDay(result.data.visits, fromDate, toDate);
    }
  }

  const totalVisits = Object.values(visitsByProject).reduce(
    (sum, counts) => sum + Object.values(counts).reduce((s, v) => s + v, 0),
    0,
  );

  const chartData = buildChartData(projects, visitsByProject);
  const isLoading = projectsLoading || visitQueries.some((q) => q.isLoading);
  const hasData = chartData.some((row) =>
    projects.some((p) => (row[p.name] as number) > 0),
  );

  // ── 4. Top pages for selected project (date-range filtered) ────────────
  const rawForTopPages: WebsiteVisit[] =
    selectedProjectId === "all"
      ? Object.values(rawVisitsByProject).flat()
      : (rawVisitsByProject[selectedProjectId as number] ?? []);

  const visitsForTopPages = rawForTopPages.filter((v) => {
    const day = new Date(v.visitedAt).toISOString().slice(0, 10);
    return day >= fromDate && day <= toDate;
  });

  const topPages = topPagesByPath(visitsForTopPages);
  const filteredTopPages = pageSearch.trim()
    ? topPages.filter((row) => row.path.toLowerCase().includes(pageSearch.trim().toLowerCase()))
    : topPages;
  const referrers = topReferrers(visitsForTopPages);
  const countries = topCountries(visitsForTopPages);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-7 h-7" style={{ color: "#22d3ee" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">Traffic</h1>
          <p className="mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>
            Website visit trends across projects.
          </p>
        </div>
      </div>

      {/* Date-range controls: presets + custom range */}
      <div className="flex items-center gap-2 flex-wrap">
        {DATE_RANGE_OPTIONS.map(({ label, days }) => (
          <button
            key={days}
            onClick={() => { setDateRange(days); setCustomFrom(""); setCustomTo(""); }}
            className="px-4 py-1.5 rounded-lg text-sm font-mono transition-colors"
            style={
              !isCustom && dateRange === days
                ? {
                    background: "rgba(34,211,238,0.15)",
                    border: "1px solid rgba(34,211,238,0.6)",
                    color: "#22d3ee",
                  }
                : {
                    background: "rgba(5,14,30,0.5)",
                    border: "1px solid rgba(34,211,238,0.18)",
                    color: "rgba(148,163,184,0.8)",
                  }
            }
          >
            {label}
          </button>
        ))}

        {/* Divider */}
        <span style={{ color: "rgba(148,163,184,0.3)", fontSize: 12 }}>|</span>

        {/* Custom from */}
        <input
          type="date"
          value={customFrom}
          max={customTo || todayISO()}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
          style={{
            background: "rgba(5,14,30,0.9)",
            border: isCustom && customFrom
              ? "1px solid rgba(34,211,238,0.6)"
              : "1px solid rgba(34,211,238,0.25)",
            color: customFrom ? "#e2e8f0" : "rgba(148,163,184,0.6)",
          }}
        />
        <span className="text-xs font-mono" style={{ color: "rgba(148,163,184,0.5)" }}>→</span>
        <input
          type="date"
          value={customTo}
          min={customFrom || undefined}
          max={todayISO()}
          onChange={(e) => setCustomTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
          style={{
            background: "rgba(5,14,30,0.9)",
            border: isCustom && customTo
              ? "1px solid rgba(34,211,238,0.6)"
              : "1px solid rgba(34,211,238,0.25)",
            color: customTo ? "#e2e8f0" : "rgba(148,163,184,0.6)",
          }}
        />
        {isCustom && (
          <button
            onClick={() => { setCustomFrom(""); setCustomTo(""); }}
            className="px-2 py-1.5 rounded-lg text-xs font-mono transition-colors"
            style={{
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.3)",
              color: "rgba(248,113,113,0.8)",
            }}
          >
            ✕ clear
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div style={CARD_STYLE} className="rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: "rgba(34,211,238,0.6)" }}>
            Total Visits
          </p>
          <p className="text-3xl font-bold font-mono text-white">
            {isLoading ? "—" : totalVisits.toLocaleString()}
          </p>
          <p className="text-xs mt-1 font-mono" style={{ color: "rgba(148,163,184,0.5)" }}>
            {isCustom ? `${fromDate} → ${toDate}` : `Last ${dateRange} days`}
          </p>
        </div>
        <div style={CARD_STYLE} className="rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: "rgba(34,211,238,0.6)" }}>
            Projects Tracked
          </p>
          <p className="text-3xl font-bold font-mono text-white">{projects.length}</p>
        </div>
      </div>

      {/* Line chart — one line per project */}
      <div style={CARD_STYLE} className="rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Daily Visits by Project</h2>
          <span className="text-xs font-mono" style={{ color: "rgba(148,163,184,0.5)" }}>
            {fromDate} → {toDate}
          </span>
        </div>
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div
              className="animate-spin w-6 h-6 border-4 rounded-full"
              style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }}
            />
          </div>
        ) : !hasData ? (
          <p className="text-slate-500 text-sm text-center py-8">
            No visit data recorded yet. Push data via the ingest API.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "rgba(5,14,30,0.95)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0", marginBottom: 4 }}
                itemStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              {projects.map((p, i) => (
                <Line
                  key={p.id}
                  type="monotone"
                  dataKey={p.name}
                  stroke={PROJECT_COLORS[i % PROJECT_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Referrer + Country breakdown panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Referrers */}
        <div style={CARD_STYLE} className="rounded-xl">
          <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
            <h2 className="text-base font-semibold text-white">Top Referrers</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(148,163,184,0.5)" }}>
              Where visitors are coming from
            </p>
          </div>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
            </div>
          ) : referrers.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No referrer data yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {referrers.map((r) => (
                <li key={r.label} className="px-6 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                  <span className="flex-1 text-xs font-mono text-slate-200 truncate" title={r.label}>{r.label}</span>
                  <span className="text-xs font-mono text-slate-400 w-10 text-right">{r.count.toLocaleString()}</span>
                  <div className="w-24 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <div className="h-full rounded-full" style={{ width: `${r.share}%`, background: "#22d3ee" }} />
                    </div>
                    <span className="text-xs font-mono w-9 text-right" style={{ color: "#22d3ee" }}>{r.share.toFixed(1)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top Countries */}
        <div style={CARD_STYLE} className="rounded-xl">
          <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
            <h2 className="text-base font-semibold text-white">Top Countries</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(148,163,184,0.5)" }}>
              Geographic distribution of visitors
            </p>
          </div>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
            </div>
          ) : countries.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No country data yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {countries.map((c) => (
                <li key={c.label} className="px-6 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                  <span className="flex-1 text-xs font-mono text-slate-200 truncate" title={c.label}>{c.label}</span>
                  <span className="text-xs font-mono text-slate-400 w-10 text-right">{c.count.toLocaleString()}</span>
                  <div className="w-24 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <div className="h-full rounded-full" style={{ width: `${c.share}%`, background: "#a78bfa" }} />
                    </div>
                    <span className="text-xs font-mono w-9 text-right" style={{ color: "#a78bfa" }}>{c.share.toFixed(1)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Top Pages table */}
      <div style={CARD_STYLE} className="rounded-xl">
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap"
          style={{ borderColor: "rgba(34,211,238,0.12)" }}
        >
          <h2 className="text-base font-semibold text-white">Top Pages</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Path search */}
            <input
              type="text"
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              placeholder="Filter by path…"
              className="rounded-lg px-3 py-1.5 text-sm font-mono text-slate-200 outline-none placeholder:text-slate-500"
              style={{
                background: "rgba(5,14,30,0.9)",
                border: "1px solid rgba(34,211,238,0.25)",
                color: "#e2e8f0",
                minWidth: 160,
              }}
            />
            {/* Project filter */}
            <select
              value={selectedProjectId}
              onChange={(e) =>
                setSelectedProjectId(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="rounded-lg px-3 py-1.5 text-sm font-mono text-slate-200 outline-none focus:ring-1"
              style={{
                background: "rgba(5,14,30,0.9)",
                border: "1px solid rgba(34,211,238,0.25)",
                color: "#e2e8f0",
                /* @ts-ignore */
                focusRingColor: "#22d3ee",
              }}
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div
              className="animate-spin w-6 h-6 border-4 rounded-full"
              style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }}
            />
          </div>
        ) : topPages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            No visit data for the selected project.
          </p>
        ) : filteredTopPages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            No pages match <span className="font-mono text-slate-400">"{pageSearch}"</span>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono w-8" style={{ color: "rgba(34,211,238,0.6)" }}>#</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Page Path</th>
                <th className="px-6 py-3 text-center text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>7d Trend</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Visits</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopPages.map((row, idx) => {
                const sparkData = pageSparkline(rawForTopPages, row.path);
                const isFlat = sparkData.every((v) => v === 0);
                return (
                  <tr
                    key={row.path}
                    className="border-b hover:bg-white/5 transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    <td className="px-6 py-3 font-mono text-slate-500 text-xs">{idx + 1}</td>
                    <td className="px-6 py-3 text-slate-200 font-mono text-xs break-all">{row.path}</td>
                    <td className="px-6 py-3 flex justify-center items-center">
                      {isFlat ? (
                        <span className="text-xs font-mono" style={{ color: "rgba(148,163,184,0.3)" }}>—</span>
                      ) : (
                        <Sparkline data={sparkData} />
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-slate-300">{row.count.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-mono">
                      <span style={{ color: "#22d3ee" }}>{row.share.toFixed(1)}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Projects table */}
      <div style={CARD_STYLE} className="rounded-xl">
        <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
          <h2 className="text-base font-semibold text-white">Monitored Projects</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
              <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Project</th>
              <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Visits (window)</th>
              <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Color</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No projects yet.</td>
              </tr>
            ) : projects.map((p, i) => {
              const projectTotal = Object.values(visitsByProject[p.id] ?? {}).reduce((s, v) => s + v, 0);
              return (
                <tr key={p.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <td className="px-6 py-3 text-slate-200 font-medium">{p.name}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-300">{projectTotal.toLocaleString()}</td>
                  <td className="px-6 py-3">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
