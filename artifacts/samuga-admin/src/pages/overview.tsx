import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, MessageSquare, Globe, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLive } from "@/context/LiveContext";

interface OverviewStats {
  totalEvents: number;
  totalMetrics: number;
  totalConversations: number;
  totalVisits: number;
  recentEvents: Array<{
    id: number;
    projectId: number;
    projectName: string;
    eventType: string;
    message: string;
    occurredAt: string;
  }>;
  projectBreakdown: Array<{
    projectId: number;
    projectName: string;
    eventCount: number;
  }>;
}

function useOverviewStats() {
  return useQuery<OverviewStats>({
    queryKey: ["overview"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overview");
      return res.json();
    },
  });
}

const KPI_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.25)",
  backdropFilter: "blur(12px)",
};

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div style={KPI_STYLE} className="rounded-xl p-6 flex items-start gap-4">
      <div className="rounded-lg p-2.5" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-sm text-slate-400 font-medium">{title}</p>
        <p className="text-3xl font-bold font-mono mt-1" style={{ color }}>
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

export default function Overview() {
  const { data: stats, isLoading } = useOverviewStats();
  const queryClient = useQueryClient();
  const { subscribe } = useLive();

  // Invalidate overview on any live event or metric arriving
  useEffect(() => {
    return subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    });
  }, [subscribe, queryClient]);

  if (isLoading || !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Data Master Hub</h1>
        <p className="mt-1" style={{ color: "rgba(148,163,184,0.8)" }}>Aggregate activity across all Samuga projects.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Events" value={stats.totalEvents} icon={Zap} color="#22d3ee" />
        <KpiCard title="Metrics Recorded" value={stats.totalMetrics} icon={Activity} color="#a78bfa" />
        <KpiCard title="AI Conversations" value={stats.totalConversations} icon={MessageSquare} color="#34d399" />
        <KpiCard title="Website Visits" value={stats.totalVisits} icon={Globe} color="#fbbf24" />
      </div>

      {/* Per-project event bar chart */}
      <div style={CARD_STYLE} className="rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Events by Project</h2>
        {stats.projectBreakdown.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No event data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.projectBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="projectName" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "rgba(5,14,30,0.95)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
                itemStyle={{ color: "#22d3ee" }}
              />
              <Bar dataKey="eventCount" fill="#22d3ee" radius={[4, 4, 0, 0]} name="Events" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent events table */}
      <div style={CARD_STYLE} className="rounded-xl">
        <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
          <h2 className="text-base font-semibold text-white">Recent Events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                {["Project", "Type", "Message", "Time"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentEvents.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No events yet.</td></tr>
              ) : stats.recentEvents.map((e) => (
                <tr key={e.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <td className="px-6 py-3 font-medium text-slate-200">{e.projectName}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${e.eventType === "error" ? "bg-red-900/40 text-red-400" : "bg-cyan-900/30 text-cyan-400"}`}>
                      {e.eventType}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-400 max-w-xs truncate">{e.message}</td>
                  <td className="px-6 py-3 text-slate-500 font-mono text-xs">{new Date(e.occurredAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
