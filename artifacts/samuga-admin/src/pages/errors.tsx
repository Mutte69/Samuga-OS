import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useLive } from "@/context/LiveContext";
import { apiFetch } from "@/lib/api-fetch";

interface Project { id: number; name: string; slug: string; }
interface ProjectEvent { id: number; projectId: number; eventType: string; message: string; metadata: unknown; occurredAt: string; }

function useProjects() {
  return useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects`);
      if (!res.ok) throw new Error(`Projects API returned ${res.status}`);
      return res.json();
    },
    retry: 1,
  });
}

function useProjectEvents(projectId: string) {
  return useQuery<{ events: ProjectEvent[] }>({
    queryKey: ["project", projectId, "events"],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects/${projectId}/events`);
      if (!res.ok) throw new Error(`Events API returned ${res.status}`);
      return res.json();
    },
    enabled: !!projectId,
    retry: 1,
  });
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

export default function Errors() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { data: projectsData, isError: projectsError } = useProjects();
  const { data: eventsData, isLoading, isError: eventsError } = useProjectEvents(selectedProject);
  const queryClient = useQueryClient();
  const { subscribe } = useLive();

  const projects = projectsData?.projects ?? [];
  const errors = (eventsData?.events ?? []).filter((e) => e.eventType === "error");
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Invalidate events for the selected project when a live event arrives for it
  useEffect(() => {
    if (!selectedProject) return;
    return subscribe((payload) => {
      if (payload.type === "event" && String(payload.projectId) === selectedProject) {
        queryClient.invalidateQueries({ queryKey: ["project", selectedProject, "events"] });
      }
    });
  }, [subscribe, queryClient, selectedProject]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-7 h-7" style={{ color: "#f87171" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">Errors</h1>
          <p className="mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>Events with type = error, filterable by project.</p>
        </div>
      </div>

      {/* Filter */}
      <div style={CARD_STYLE} className="rounded-xl p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-slate-300">Filter by project</label>
        {projectsError ? (
          <p className="text-sm text-red-400">Could not load projects — check API connectivity.</p>
        ) : (
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
        )}
      </div>

      {/* Table */}
      <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
        {!selectedProject ? (
          <div className="px-6 py-12 text-center text-slate-500">Select a project above to view errors.</div>
        ) : isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
          </div>
        ) : eventsError ? (
          <div className="px-6 py-12 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#f87171" }} />
            <p className="text-red-400 text-sm">Could not load events for this project.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                  {["Project", "Message", "Occurred At"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errors.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No errors found for this project.</td></tr>
                ) : errors.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <td className="px-6 py-3 font-medium text-slate-200">{projectMap.get(e.projectId)?.name ?? `#${e.projectId}`}</td>
                    <td className="px-6 py-3 text-red-400">{e.message}</td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-500">{new Date(e.occurredAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
