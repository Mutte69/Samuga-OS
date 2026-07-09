import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FolderKanban, AlertTriangle, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

function useProjects() {
  return useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/projects");
      if (!res.ok) throw new Error(`Projects API returned ${res.status}`);
      return res.json();
    },
    retry: 1,
  });
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.2)",
  backdropFilter: "blur(12px)",
};

export default function Projects() {
  const { data, isLoading, isError, error } = useProjects();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div
          className="animate-spin w-8 h-8 border-4 rounded-full"
          style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <AlertTriangle className="w-10 h-10" style={{ color: "#f87171" }} />
        <p className="text-slate-400 text-sm text-center max-w-md">
          {(error as Error)?.message ?? "Could not load projects. Check that the API server is reachable."}
        </p>
      </div>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Projects</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(148,163,184,0.8)" }}>
            All registered Samuga projects and their active slugs.
          </p>
        </div>
        {projects.length > 0 && (
          <span
            className="text-xs font-mono px-3 py-1 rounded-full"
            style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", color: "#22d3ee" }}
          >
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {projects.length === 0 ? (
        <div style={CARD_STYLE} className="rounded-xl p-12 text-center">
          <FolderKanban className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(34,211,238,0.4)" }} />
          <p className="text-slate-400">No projects registered yet.</p>
        </div>
      ) : (
        <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "rgba(34,211,238,0.1)", background: "rgba(34,211,238,0.04)" }}
                >
                  {["ID", "Name", "Slug", "Created"].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono"
                      style={{ color: "rgba(34,211,238,0.6)" }}
                    >
                      {h}
                    </th>
                  ))}
                  {/* spacer for the action column */}
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b transition-colors hover:bg-white/5 group"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-slate-500">{project.id}</td>
                    <td className="px-6 py-3">
                      <span className="font-medium text-white group-hover:text-cyan-300 transition-colors">
                        {project.name}
                      </span>
                      {project.description && (
                        <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{project.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded"
                        style={{ background: "rgba(34,211,238,0.08)", color: "#22d3ee" }}
                      >
                        /{project.slug}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-500">
                      {new Date(project.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/projects/${project.id}`}
                        className="inline-flex items-center gap-1 text-xs transition-colors opacity-0 group-hover:opacity-100"
                        style={{ color: "rgba(34,211,238,0.8)" }}
                      >
                        View <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
