import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";


interface Project { id: number; name: string; }
interface Conversation { id: number; sessionId: string; userMessage: string; assistantMessage: string; model: string | null; tokensUsed: number | null; startedAt: string; }

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

function useConversations(projectId: string) {
  return useQuery<{ conversations: Conversation[] }>({
    queryKey: ["project", projectId, "conversations"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${projectId}/conversations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!projectId,
  });
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

export default function AiAnalytics() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { data: projectsData } = useProjects();
  const { data: convData, isLoading } = useConversations(selectedProject);

  const projects = projectsData?.projects ?? [];
  const conversations = convData?.conversations ?? [];

  // Compute stats
  const totalConvs = conversations.length;
  const totalTokens = conversations.reduce((s, c) => s + (c.tokensUsed ?? 0), 0);
  const avgTokens = totalConvs > 0 ? Math.round(totalTokens / totalConvs) : 0;

  // Model breakdown
  const modelMap = new Map<string, number>();
  for (const c of conversations) {
    const m = c.model ?? "unknown";
    modelMap.set(m, (modelMap.get(m) ?? 0) + 1);
  }
  const modelBreakdown = Array.from(modelMap.entries()).map(([model, count]) => ({ model, count }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <BrainCircuit className="w-7 h-7" style={{ color: "#a78bfa" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">AI Analytics</h1>
          <p className="mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>Conversation volume, model usage, and token stats.</p>
        </div>
      </div>

      {/* Project selector */}
      <div style={CARD_STYLE} className="rounded-xl p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-slate-300">Project</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="rounded-md px-3 py-1.5 text-sm text-white"
          style={{ background: "rgba(5,14,30,0.9)", border: "1px solid rgba(34,211,238,0.25)" }}
        >
          <option value="">— Select a project —</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProject && !isLoading && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Conversations", value: totalConvs.toLocaleString(), color: "#a78bfa" },
              { label: "Total Tokens", value: totalTokens.toLocaleString(), color: "#22d3ee" },
              { label: "Avg Tokens / Conv", value: avgTokens.toLocaleString(), color: "#34d399" },
            ].map((s) => (
              <div key={s.label} style={CARD_STYLE} className="rounded-xl p-5">
                <p className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: `${s.color}99` }}>{s.label}</p>
                <p className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Model breakdown */}
          {modelBreakdown.length > 0 && (
            <div style={CARD_STYLE} className="rounded-xl">
              <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
                <h2 className="text-base font-semibold text-white">Model Usage</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                    {["Model", "Conversations"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelBreakdown.map((m) => (
                    <tr key={m.model} className="border-b hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <td className="px-6 py-3 text-purple-300 font-mono">{m.model}</td>
                      <td className="px-6 py-3 text-slate-200 font-mono">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conversation list */}
          <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
              <h2 className="text-base font-semibold text-white">Conversations</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                    {["Session", "User Message", "Model", "Tokens", "Started At"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversations.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No conversations yet.</td></tr>
                  ) : conversations.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <td className="px-6 py-3 font-mono text-xs text-slate-500">{c.sessionId.slice(0, 12)}…</td>
                      <td className="px-6 py-3 text-slate-300 max-w-xs truncate">{c.userMessage}</td>
                      <td className="px-6 py-3 text-purple-300 font-mono text-xs">{c.model ?? "—"}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-400">{c.tokensUsed?.toLocaleString() ?? "—"}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-500">{new Date(c.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedProject && isLoading && (
        <div className="py-12 flex justify-center">
          <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
        </div>
      )}

      {!selectedProject && (
        <div style={CARD_STYLE} className="rounded-xl p-12 text-center">
          <BrainCircuit className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(167,139,250,0.4)" }} />
          <p className="text-slate-400">Select a project above to view AI analytics.</p>
        </div>
      )}
    </div>
  );
}
