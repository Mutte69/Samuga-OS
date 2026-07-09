import { useListRepos } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import {
  GitFork,
  ExternalLink,
  Lock,
  Globe,
  RefreshCw,
  Clock,
  Code2,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListReposQueryKey } from "@workspace/api-client-react";

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-pink-600",
  C: "bg-gray-500",
  Shell: "bg-lime-600",
  HTML: "bg-orange-400",
  CSS: "bg-purple-500",
};

function LanguageDot({ language }: { language: string | null | undefined }) {
  if (!language) return null;
  const color = LANGUAGE_COLORS[language] ?? "bg-slate-400";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      {language}
    </span>
  );
}

export default function Repos() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, error } = useListRepos({
    query: { queryKey: getListReposQueryKey(), retry: false },
  });

  // Extract the most useful error message available:
  //   1. Structured { error: "..." } payload from the API (most actionable)
  //   2. error.message for network / parse failures ("Failed to fetch", etc.)
  //   3. Generic fallback
  const serverMessage: string =
    error?.data?.error ??
    (error instanceof Error ? error.message : null) ??
    "Failed to load repositories. Check that GITHUB_OWNER and GITHUB_TOKEN are set on the API server.";

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListReposQueryKey() });
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground mt-1">
            GitHub repositories for this owner — read-only view.
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitFork className="w-4 h-4" />
          <span>
            <span className="text-foreground font-semibold">{data.total}</span>{" "}
            {data.total === 1 ? "repository" : "repositories"}
          </span>
          <span className="mx-2 text-border">·</span>
          <Lock className="w-3.5 h-3.5" />
          <span>{data.repos.filter((r) => r.private).length} private</span>
          <span className="mx-2 text-border">·</span>
          <Globe className="w-3.5 h-3.5" />
          <span>{data.repos.filter((r) => !r.private).length} public</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="p-5 space-y-3 animate-pulse border-border/50"
            >
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-4/5" />
              <div className="flex gap-2 pt-1">
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-3 bg-muted rounded w-20" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <Card className="p-8 text-center border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-destructive/60" />
          <p className="font-semibold text-destructive">Failed to load repositories</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            {serverMessage}
          </p>
          {apiError?.response?.status && (
            <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
              HTTP {apiError.response.status}
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Retry
          </Button>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !isError && data && data.repos.length === 0 && (
        <Card className="p-12 text-center border-border/50">
          <GitFork className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-muted-foreground">No repositories found for this owner.</p>
        </Card>
      )}

      {/* Repo grid */}
      {!isLoading && data && data.repos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.repos.map((repo) => (
            <Card
              key={repo.full_name}
              className="p-5 flex flex-col gap-3 border-border/50 bg-card hover:border-primary/30 hover:shadow-md transition-all"
            >
              {/* Name + visibility */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Code2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="font-semibold text-sm truncate" title={repo.name}>
                    {repo.name}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    repo.private
                      ? "text-orange-500 border-orange-500/40 shrink-0"
                      : "text-green-500 border-green-500/40 shrink-0"
                  }
                >
                  {repo.private ? (
                    <><Lock className="w-2.5 h-2.5 mr-1" />Private</>
                  ) : (
                    <><Globe className="w-2.5 h-2.5 mr-1" />Public</>
                  )}
                </Badge>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.5rem]">
                {repo.description ?? (
                  <span className="italic opacity-60">No description provided.</span>
                )}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-4 pt-1">
                <LanguageDot language={repo.language} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {format(parseISO(repo.updated_at), "MMM d, yyyy")}
                </span>
              </div>

              {/* Default branch */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitFork className="w-3 h-3" />
                <span className="font-mono">{repo.default_branch}</span>
              </div>

              {/* Action */}
              <div className="pt-1 mt-auto">
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                    Open on GitHub
                  </Button>
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
