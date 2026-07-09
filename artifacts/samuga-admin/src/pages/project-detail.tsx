import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useLive } from "@/context/LiveContext";
import { apiFetch } from "@/lib/api-fetch";


interface Project { id: number; name: string; slug: string; description: string | null; createdAt: string; }
interface Metric { id: number; projectId: number; metricName: string; value: string; unit: string | null; recordedAt: string; }
interface ProjectEvent { id: number; projectId: number; eventType: string; message: string; metadata: unknown; occurredAt: string; }
interface Conversation { id: number; projectId: number; sessionId: string; userMessage: string; assistantMessage: string; model: string | null; tokensUsed: number | null; startedAt: string; }

const TAB_STYLE_BASE = "px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 cursor-pointer";
const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

function useProjectData<T>(projectId: string, resource: string) {
  return useQuery<T>({
    queryKey: ["project", projectId, resource],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects/${projectId}/${resource}`);
      if (!res.ok) throw new Error(`Failed to fetch ${resource}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

function useProjects() {
  return useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={CARD_STYLE} className="rounded-xl overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function MetricsTab({ id }: { id: string }) {
  const { data, isLoading } = useProjectData<{ metrics: Metric[] }>(id, "metrics");
  if (isLoading) return <Spinner />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead><tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
          {["Metric", "Value", "Unit", "Recorded At"].map(h => <Th key={h}>{h}</Th>)}
        </tr></thead>
        <tbody>
          {(data?.metrics ?? []).length === 0 ? <EmptyRow cols={4} /> : (data?.metrics ?? []).map(m => (
            <tr key={m.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <Td>{m.metricName}</Td>
              <Td mono>{m.value}</Td>
              <Td>{m.unit ?? "—"}</Td>
              <Td mono dim>{new Date(m.recordedAt).toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function EventsTab({ id }: { id: string }) {
  const { data, isLoading } = useProjectData<{ events: ProjectEvent[] }>(id, "events");
  if (isLoading) return <Spinner />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead><tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
          {["Type", "Message", "Occurred At"].map(h => <Th key={h}>{h}</Th>)}
        </tr></thead>
        <tbody>
          {(data?.events ?? []).length === 0 ? <EmptyRow cols={3} /> : (data?.events ?? []).map(e => (
            <tr key={e.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <Td>
                <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${e.eventType === "error" ? "bg-red-900/40 text-red-400" : "bg-cyan-900/30 text-cyan-400"}`}>
                  {e.eventType}
                </span>
              </Td>
              <Td>{e.message}</Td>
              <Td mono dim>{new Date(e.occurredAt).toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function ConversationsTab({ id }: { id: string }) {
  const { data, isLoading } = useProjectData<{ conversations: Conversation[] }>(id, "conversations");
  if (isLoading) return <Spinner />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead><tr className="border-b" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
          {["Session", "User Message", "Model", "Tokens", "Started At"].map(h => <Th key={h}>{h}</Th>)}
        </tr></thead>
        <tbody>
          {(data?.conversations ?? []).length === 0 ? <EmptyRow cols={5} /> : (data?.conversations ?? []).map(c => (
            <tr key={c.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <Td mono dim>{c.sessionId.slice(0, 12)}…</Td>
              <Td><span className="max-w-xs block truncate">{c.userMessage}</span></Td>
              <Td>{c.model ?? "—"}</Td>
              <Td mono>{c.tokensUsed?.toLocaleString() ?? "—"}</Td>
              <Td mono dim>{new Date(c.startedAt).toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left text-xs uppercase tracking-wider font-mono" style={{ color: "rgba(34,211,238,0.6)" }}>{children}</th>;
}
function Td({ children, mono, dim }: { children: React.ReactNode; mono?: boolean; dim?: boolean }) {
  return <td className={`px-6 py-3 ${mono ? "font-mono text-xs" : ""} ${dim ? "text-slate-500" : "text-slate-300"}`}>{children}</td>;
}
function EmptyRow({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="px-6 py-8 text-center text-slate-500">No data yet.</td></tr>;
}
function Spinner() {
  return (
    <div className="py-12 flex justify-center">
      <div className="animate-spin w-6 h-6 border-4 rounded-full" style={{ borderColor: "rgba(34,211,238,0.3)", borderTopColor: "#22d3ee" }} />
    </div>
  );
}

const TABS = [
  { key: "metrics", label: "Metrics" },
  { key: "events", label: "Events" },
  { key: "conversations", label: "Conversations" },
] as const;

type Tab = typeof TABS[number]["key"];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: projectsData } = useProjects();
  const project = projectsData?.projects.find((p) => String(p.id) === id);
  const [tab, setTab] = useState<Tab>("events");
  const queryClient = useQueryClient();
  const { subscribe } = useLive();

  // Invalidate the currently-viewed tab's query when a relevant live update arrives
  useEffect(() => {
    if (!id) return;
    return subscribe((payload) => {
      if (String(payload.projectId) !== id) return;
      if (payload.type === "event" && (tab === "events")) {
        queryClient.invalidateQueries({ queryKey: ["project", id, "events"] });
      } else if (payload.type === "metric" && tab === "metrics") {
        queryClient.invalidateQueries({ queryKey: ["project", id, "metrics"] });
      }
    });
  }, [subscribe, queryClient, id, tab]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm mb-4 hover:text-cyan-300 transition-colors" style={{ color: "rgba(34,211,238,0.7)" }}>
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        <h1 className="text-3xl font-bold text-white">{project?.name ?? `Project #${id}`}</h1>
        {project?.description && <p className="mt-1 text-slate-400">{project.description}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-lg" style={{ background: "rgba(5,14,30,0.7)", border: "1px solid rgba(34,211,238,0.15)", width: "fit-content" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={TAB_STYLE_BASE + (tab === t.key ? " text-white" : " text-slate-400 hover:text-slate-200")}
            style={tab === t.key ? { background: "rgba(34,211,238,0.15)", color: "#22d3ee" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "metrics" && <MetricsTab id={id} />}
      {tab === "events" && <EventsTab id={id} />}
      {tab === "conversations" && <ConversationsTab id={id} />}
    </div>
  );
}
