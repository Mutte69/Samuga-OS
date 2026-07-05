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
      const res = await fetch(
        `/api/v1/projects/${projectId}/${table}${table === "visits" ? "?limit=500" : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.metrics ?? json.events ?? json.conversations ?? json.visits ?? [];
    },
    enabled: !!projectId && !!table,
  });
}

const TABLES = [
  { key: "events",        label: "project_events" },
  { key: "metrics",       label: "project_metrics" },
  { key: "conversations", label: "ai_conversations" },
  { key: "visits",        label: "website_visits" },
] as const;

type TableKey = typeof TABLES[number]["key"];

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span style={{ color: "rgba(148,163,184,0.35)" }}>—</span>;
  }
  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs" style={{ color: "#a78bfa" }}>
        {JSON.stringify(value).slice(0, 120)}
      </span>
    );
  }
  const str = String(value);
  // ISO timestamps → readable local time
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return <span>{new Date(str).toLocaleString()}</span>;
  }
  return <span>{str.length > 80 ? str.slice(0, 80) + "…" : str}</span>;
}

export default function DataExplorer() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<TableKey>("events");
  const { data: projectsData } = useProjects();
  const { data: rows, isLoading, error } = useTableData(selectedProject, selectedTable);

  const projects = projectsData?.projects ?? [];
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Database className="w-7 h-7 shrink-0" style={{ color: "#22d3ee" }} />
        <div>
          <h1 className="text-3xl font-bold text-white">Data Explorer</h1>
          <p className="mt-0.5 text-sm" style={{ color: "rgba(148,163,184,0.8)" }}>
            Read-only view of raw project data tables — events, metrics, conversations, and visits.
          </p>
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

        {rows !== undefined && (
          <span className="text-xs font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>
            {rows.length.toLocaleString()} row{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
        {!selectedProject ? (
          <div className="px-6 py-16 text-center">
            <Database className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(34,211,238,0.25)" }} />
            <p className="text-slate-500 text-sm">Select a project above to browse its data.</p>
          </div>
        ) : isLoading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-red-400 text-sm font-mono">Failed to load {selectedTable} data.</p>
          </div>
        ) : columns.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <Database className="w-10 h-10 mx-auto" style={{ color: "rgba(34,211,238,0.2)" }} />
            <p className="text-slate-500 text-sm">No rows in <span className="font-mono text-slate-400">{TABLES.find(t => t.key === selectedTable)?.label}</span> for this project.</p>
            <p className="text-xs font-mono" style={{ color: "rgba(148,163,184,0.4)" }}>
              Push data via the ingest API — see TELEMETRY_SETUP.md
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)", background: "rgba(34,211,238,0.03)" }}>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs uppercase tracking-wider font-mono whitespace-nowrap"
                      style={{ color: "rgba(34,211,238,0.6)" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b hover:bg-white/5 transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 font-mono text-xs text-slate-300 max-w-xs truncate whitespace-nowrap">
                        <CellValue value={row[col]} />
                      </td>
                    ))}
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
