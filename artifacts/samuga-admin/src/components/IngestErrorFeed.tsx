/**
 * IngestErrorFeed — shows recent ingest failures in real time.
 *
 * Appends live ingest_error SSE events as they arrive so operators can
 * immediately see which calls failed, why, and when.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { IngestErrorPayload } from "@/context/LiveContext";
import { useLiveIngestErrors } from "@/context/LiveContext";

const CARD_STYLE = {
  background: "rgba(5,14,30,0.7)",
  border: "1px solid rgba(34,211,238,0.18)",
  backdropFilter: "blur(12px)",
};

function StatusBadge({ status }: { status: number }) {
  const isClientError = status >= 400 && status < 500;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold font-mono"
      style={{
        background: isClientError ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.15)",
        color: isClientError ? "#fbbf24" : "#f87171",
        border: `1px solid ${isClientError ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)"}`,
      }}
    >
      {status}
    </span>
  );
}

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

const MAX_FEED_ITEMS = 50;

export function IngestErrorFeed() {
  const subscribeIngestError = useLiveIngestErrors();
  const [events, setEvents] = useState<IngestErrorPayload[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return subscribeIngestError((evt) => {
      if (seenIdsRef.current.has(evt.id)) return;
      seenIdsRef.current.add(evt.id);
      setEvents((prev) => [evt, ...prev].slice(0, MAX_FEED_ITEMS));
    });
  }, [subscribeIngestError]);

  return (
    <div style={CARD_STYLE} className="rounded-xl">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between border-b"
        style={{ borderColor: "rgba(34,211,238,0.12)" }}
      >
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <h2 className="text-base font-semibold text-white">Ingest Errors</h2>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "#f87171",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          live feed
        </span>
      </div>

      {/* Body */}
      {events.length === 0 ? (
        <p className="px-6 py-10 text-center text-slate-500 text-sm">
          No ingest errors recorded yet. Failed calls will appear here in real time.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: "rgba(34,211,238,0.08)" }}
              >
                {["Status", "Endpoint", "Error", "Time"].map((h) => (
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
              {events.map((evt, i) => (
                <tr
                  key={evt.id}
                  className="border-b hover:bg-white/5 transition-colors"
                  style={{
                    borderColor: "rgba(255,255,255,0.04)",
                    background:
                      i === 0 ? "rgba(239,68,68,0.04)" : undefined,
                  }}
                >
                  <td className="px-5 py-2.5">
                    <StatusBadge status={evt.status} />
                  </td>
                  <td className="px-5 py-2.5 font-mono text-cyan-300 text-xs">
                    {evt.endpoint}
                  </td>
                  <td className="px-5 py-2.5 text-slate-300 text-xs max-w-xs truncate" title={evt.error}>
                    {evt.error}
                    {evt.projectSlug && (
                      <span className="ml-1.5 text-slate-500 font-mono">
                        ({evt.projectSlug})
                      </span>
                    )}
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
