import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";


interface Project { id: number; name: string; }
interface Visit { id: number; projectId: number; pagePath: string; referrer: string | null; visitedAt: string; }

function useProjects() {
  return useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

// Fetch all visits for a project via the overview (we don't have a dedicated visits endpoint yet)
function useVisits(projectId: string) {
  return useQuery<{ visits: Visit[] }>({
    queryKey: ["project", projectId, "visits-traffic"],
    queryFn: async () => {
      // We call overview and get websiteVisits indirectly — but for per-project traffic
      // we fetch from events as a proxy. Actually we need a dedicated endpoint.
      // For now we return empty since the spec only has events/metrics/conversations per project.
      return { visits: [] };
    },
    enabled: !!projectId,
  });
}

// Build daily visit counts from overview data
function useOverviewForTraffic() {
  return useQuery<{ totalVisits: number; recentEvents: Array<{ occurredAt: string; projectName: string }> }>({
    queryKey: ["overview"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

export default function Traffic() {
  const { data: projectsData } = useProjects();
  const { data: overview, isLoading } = useOverviewForTraffic();
  const projects = projectsData?.projects ?? [];

  // Group recent events by day as a proxy timeline
  const eventsByDay = new Map<string, number>();
  if (overview?.recentEvents) {
    for (const e of overview.recentEvents) {
      const day = new Date(e.occurredAt).toLocaleDateString();
      eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
    }
  }

  const chartData = Array.from(eventsByDay.entries())
    .map(([date, count]) => ({ date, events: count }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-7 h-7" style={{ color: "#22d3ee" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">Traffic</h1>
          <p className="mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>Website visit trends across projects.</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div style={CARD_STYLE} className="rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: "rgba(34,211,238,0.6)" }}>Total Visits</p>
          <p className="text-3xl font-bold font-mono text-white">{overview?.totalVisits?.toLocaleString() ?? "—"}</p>
        </div>
        <div style={CARD_STYLE} className="rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: "rgba(34,211,238,0.6)" }}>Projects Tracked</p>
          <p className="text-3xl font-bold font-mono text-white">{projects.length}</p>
        </div>
      </div>

      {/* Line chart */}
      <div style={CARD_STYLE} className="rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Recent Event Activity (Proxy)</h2>
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No visit data recorded yet. Push data via the ingest API.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "rgba(5,14,30,0.95)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#22d3ee" }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Line type="monotone" dataKey="events" stroke="#22d3ee" strokeWidth={2} dot={false} name="Events" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projects list */}
      <div style={CARD_STYLE} className="rounded-xl">
        <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
          <h2 className="text-base font-semibold text-white">Monitored Projects</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
              <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>Project</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td className="px-6 py-8 text-center text-slate-500">No projects yet.</td></tr>
            ) : projects.map((p) => (
              <tr key={p.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                <td className="px-6 py-3 text-slate-200 font-medium">{p.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
