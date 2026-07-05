import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FolderKanban, Clock, AlertTriangle } from "lucide-react";
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
      const res = await apiFetch(`/api/v1/projects`);
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
        <div className="animate-spin w-8 h-8 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
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
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Projects</h1>
        <p className="mt-1" style={{ color: "rgba(148,163,184,0.8)" }}>All tracked Samuga projects and their activity.</p>
      </div>

      {projects.length === 0 ? (
        <div style={CARD_STYLE} className="rounded-xl p-12 text-center">
          <FolderKanban className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(34,211,238,0.4)" }} />
          <p className="text-slate-400">No projects found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <div
                style={CARD_STYLE}
                className="rounded-xl p-5 cursor-pointer transition-all duration-200 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)] group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="rounded-lg p-2" style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)" }}>
                    <FolderKanban className="w-5 h-5" style={{ color: "#22d3ee" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">{project.name}</h3>
                    <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(34,211,238,0.6)" }}>/{project.slug}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">{project.description ?? "No description."}</p>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(148,163,184,0.6)" }}>
                  <Clock className="w-3.5 h-3.5" />
                  <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
