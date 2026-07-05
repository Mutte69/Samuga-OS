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

/** Aggregate visits by ISO date YYYY-MM-DD */
function groupByDay(visits: WebsiteVisit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const day = new Date(v.visitedAt).toISOString().slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
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

  // ── 1. Fetch projects ──────────────────────────────────────────────────
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });
  const projects = projectsData?.projects ?? [];

  // ── 2. Fetch visits for every project in parallel ──────────────────────
  const visitQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project", p.id, "visits"] as const,
      queryFn: () => getProjectVisits(p.id),
      enabled: projects.length > 0,
    })),
  });

  // ── 3. Derive chart data from stable query results ─────────────────────
  const visitsByProject: Record<number, Record<string, number>> = {};
  const rawVisitsByProject: Record<number, WebsiteVisit[]> = {};
  for (let i = 0; i < projects.length; i++) {
    const result = visitQueries[i];
    if (result?.data?.visits) {
      visitsByProject[projects[i].id] = groupByDay(result.data.visits);
      rawVisitsByProject[projects[i].id] = result.data.visits;
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

  // ── 4. Top pages for selected project ─────────────────────────────────
  const visitsForTopPages: WebsiteVisit[] =
    selectedProjectId === "all"
      ? Object.values(rawVisitsByProject).flat()
      : (rawVisitsByProject[selectedProjectId as number] ?? []);

  const topPages = topPagesByPath(visitsForTopPages);

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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div style={CARD_STYLE} className="rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: "rgba(34,211,238,0.6)" }}>
            Total Visits
          </p>
          <p className="text-3xl font-bold font-mono text-white">
            {isLoading ? "—" : totalVisits.toLocaleString()}
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
        <h2 className="text-base font-semibold text-white mb-4">Daily Visits by Project</h2>
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

      {/* Top Pages table */}
      <div style={CARD_STYLE} className="rounded-xl">
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap"
          style={{ borderColor: "rgba(34,211,238,0.12)" }}
        >
          <h2 className="text-base font-semibold text-white">Top Pages</h2>
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
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono w-8" style={{ color: "rgba(34,211,238,0.6)" }}>#</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Page Path</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Visits</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((row, idx) => (
                <tr
                  key={row.path}
                  className="border-b hover:bg-white/5 transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <td className="px-6 py-3 font-mono text-slate-500 text-xs">{idx + 1}</td>
                  <td className="px-6 py-3 text-slate-200 font-mono text-xs break-all">{row.path}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-300">{row.count.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right font-mono">
                    <span style={{ color: "#22d3ee" }}>{row.share.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
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
              <th className="px-6 py-3 text-right text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Total Visits</th>
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
