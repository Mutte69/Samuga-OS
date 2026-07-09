/**
 * RateLimitPanel — shows recently throttled IPs in real time.
 *
 * Loads historical events via REST on mount, then appends live events
 * from the SSE stream as they arrive.
 *
 * Operators can filter by IP prefix or partial path using the search bar.
 * Filtering is client-side so the SSE stream keeps flowing uninterrupted.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldAlert, X } from "lucide-react";
import type { RateLimitPayload } from "@/context/LiveContext";
import { useLiveRateLimits } from "@/context/LiveContext";

interface RateLimitEvent {
  id: string;
  ip: string;
  path: string;
  timestamp: string;
  hitCount: number;
}

function useHistoricalRateLimits() {
  return useQuery<{ events: RateLimitEvent[] }>({
    queryKey: ["rate-limit-events"],
    queryFn: async () => {
      const res = await fetch("/api/v1/rate-limit-events?limit=50", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch rate-limit events");
      return res.json();
    },
    staleTime: 30_000,
  });
}

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function update() {
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diff < 60) setLabel(`${diff}s ago`);
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`);
      else setLabel(new Date(iso).toLocaleTimeString());
    }
    update();
    const id = setInterval(update, 5_000);
    return () => clearInterval(id);
  }, [iso]);

  return <span>{label}</span>;
}

/** Highlight matching text within a string */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "rgba(34,211,238,0.25)",
          color: "#22d3ee",
          borderRadius: "2px",
          padding: "0 1px",
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function matchesFilter(
  evt: { ip: string; path: string },
  filter: string,
): boolean {
  if (!filter) return true;
  const q = filter.toLowerCase();
  return (
    evt.ip.toLowerCase().includes(q) || evt.path.toLowerCase().includes(q)
  );
}

export function RateLimitPanel() {
  const { data, isLoading } = useHistoricalRateLimits();
  const subscribeRateLimit = useLiveRateLimits();

  // Filter state
  const [filter, setFilter] = useState("");

  // Prepend live events at the top (cap at 100 to avoid DOM bloat)
  const [liveEvents, setLiveEvents] = useState<RateLimitPayload[]>([]);
  const liveIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return subscribeRateLimit((evt) => {
      if (liveIdsRef.current.has(evt.id)) return;
      liveIdsRef.current.add(evt.id);
      setLiveEvents((prev) => [evt, ...prev].slice(0, 100));
    });
  }, [subscribeRateLimit]);

  // Merge: live events first, then historical (deduplicated by id)
  const historical = data?.events ?? [];
  const historicalFiltered = historical.filter(
    (e) => !liveIdsRef.current.has(e.id),
  );
  const merged = [...liveEvents, ...historicalFiltered];

  // Apply client-side filter
  const visible = merged.filter((e) => matchesFilter(e, filter));

  return (
    <div style={CARD_STYLE} className="rounded-xl">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between border-b"
        style={{ borderColor: "rgba(34,211,238,0.12)" }}
      >
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">
            Rate-Limited IPs
          </h2>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(251,191,36,0.12)",
            color: "#fbbf24",
            border: "1px solid rgba(251,191,36,0.3)",
          }}
        >
          last 50 hits
        </span>
      </div>

      {/* Filter bar */}
      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: "rgba(34,211,238,0.08)" }}
      >
        <div className="relative flex items-center">
          <Search
            className="absolute left-3 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "rgba(34,211,238,0.5)" }}
          />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by IP address or path…"
            className="w-full text-xs font-mono pl-8 pr-8 py-2 rounded-lg outline-none transition-colors"
            style={{
              background: "rgba(34,211,238,0.05)",
              border: "1px solid rgba(34,211,238,0.15)",
              color: "#e2e8f0",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "rgba(34,211,238,0.4)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "rgba(34,211,238,0.15)")
            }
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-2.5 p-0.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Clear filter"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
        {filter && (
          <p className="mt-1.5 text-xs" style={{ color: "rgba(34,211,238,0.5)" }}>
            {visible.length} of {merged.length} event
            {merged.length !== 1 ? "s" : ""} match
          </p>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="py-10 flex justify-center">
          <div
            className="animate-spin w-6 h-6 border-4 rounded-full"
            style={{
              borderColor: "rgba(34,211,238,0.3)",
              borderTopColor: "#22d3ee",
            }}
          />
        </div>
      ) : merged.length === 0 ? (
        <p className="px-6 py-10 text-center text-slate-500 text-sm">
          No rate-limit events recorded yet. Throttled requests will appear here
          in real time.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-slate-500 text-sm">
          No events match{" "}
          <span className="font-mono text-slate-400">"{filter}"</span>. Try a
          different IP or path fragment.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: "rgba(34,211,238,0.08)" }}
              >
                {["IP Address", "Path", "Hit Count", "Time"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs uppercase tracking-wider font-mono"
                    style={{ color: "rgba(34,211,238,0.6)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((evt, i) => (
                <tr
                  key={evt.id}
                  className="border-b hover:bg-white/5 transition-colors"
                  style={{
                    borderColor: "rgba(255,255,255,0.04)",
                    // Flash new live rows slightly
                    background:
                      i < liveEvents.length
                        ? "rgba(251,191,36,0.04)"
                        : undefined,
                  }}
                >
                  <td className="px-5 py-2.5 font-mono text-amber-300 text-xs">
                    <Highlight text={evt.ip} query={filter} />
                  </td>
                  <td className="px-5 py-2.5 font-mono text-slate-300 text-xs truncate max-w-xs">
                    <Highlight text={evt.path} query={filter} />
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-bold font-mono"
                      style={{
                        background: "rgba(239,68,68,0.15)",
                        color: "#f87171",
                        border: "1px solid rgba(239,68,68,0.3)",
                      }}
                    >
                      {evt.hitCount}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-slate-500 font-mono text-xs">
                    <RelativeTime iso={evt.timestamp} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
