import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";


interface Project { id: number; name: string; }

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

function useTableData(projectId: string, table: string) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: ["explorer", projectId, table],
    queryFn: async () => {
      if (!projectId || !table) return [];
      const res = await fetch(`/api/v1/projects/${projectId}/${table}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      // Each endpoint returns different keys
      return json.metrics ?? json.events ?? json.conversations ?? [];
    },
    enabled: !!projectId && !!table,
  });
}

const TABLES = [
  { key: "metrics", label: "project_metrics" },
  { key: "events", label: "project_events" },
  { key: "conversations", label: "ai_conversations" },
] as const;

type TableKey = typeof TABLES[number]["key"];

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

export default function DataExplorer() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<TableKey>("events");
  const { data: projectsData } = useProjects();
  const { data: rows, isLoading } = useTableData(selectedProject, selectedTable);

  const projects = projectsData?.projects ?? [];
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Database className="w-7 h-7" style={{ color: "#22d3ee" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">Data Explorer</h1>
          <p className="mt-0.5" style={{ color: "rgba(148,163,184,0.8)" }}>Read-only view of raw project data tables.</p>
        </div>
      </div>

      {/* Selectors */}
      <div style={CARD_STYLE} className="rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-300">Project</label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="rounded-md px-3 py-1.5 text-sm text-white"
            style={{ background: "rgba(5,14,30,0.9)", border: "1px solid rgba(34,211,238,0.25)" }}
          >
            <option value="">— Select —</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-300">Table</label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value as TableKey)}
            className="rounded-md px-3 py-1.5 text-sm text-white font-mono"
            style={{ background: "rgba(5,14,30,0.9)", border: "1px solid rgba(34,211,238,0.25)" }}
          >
            {TABLES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        {rows && (
          <span className="text-xs font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>
            {rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
        {!selectedProject ? (
          <div className="px-6 py-12 text-center">
            <Database className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(34,211,238,0.3)" }} />
            <p className="text-slate-500">Select a project to explore its data.</p>
          </div>
        ) : isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs uppercase tracking-wider font-mono whitespace-nowrap" style={{ color: "rgba(34,211,238,0.6)" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).length === 0 ? (
                  <tr><td colSpan={Math.max(columns.length, 1)} className="px-6 py-8 text-center text-slate-500">No rows.</td></tr>
                ) : (rows ?? []).map((row, i) => (
                  <tr key={i} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    {columns.map((col) => {
                      const val = row[col];
                      const display = val === null || val === undefined ? "—" : typeof val === "object" ? JSON.stringify(val) : String(val);
                      return (
                        <td key={col} className="px-4 py-2.5 font-mono text-xs text-slate-300 max-w-xs truncate whitespace-nowrap">
                          {display}
                        </td>
                      );
                    })}
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
