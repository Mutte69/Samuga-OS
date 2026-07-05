import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";

export interface LivePayload {
  type: "event" | "metric";
  projectId: number;
  data: Record<string, unknown>;
}

type Listener = (payload: LivePayload) => void;

interface LiveContextValue {
  isLive: boolean;
  /** Subscribe to live payloads. Returns an unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
}

const LiveContext = createContext<LiveContextValue>({
  isLive: false,
  subscribe: () => () => {},
});

export function useLive() {
  return useContext(LiveContext);
}

const SSE_URL = "/api/v1/live";
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const retryMsRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const es = new EventSource(SSE_URL, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (destroyed) return;
        setIsLive(true);
        retryMsRef.current = INITIAL_RETRY_MS; // reset backoff on success
      });

      es.onmessage = (e) => {
        if (destroyed) return;
        try {
          const payload = JSON.parse(e.data) as LivePayload;
          listenersRef.current.forEach((fn) => fn(payload));
        } catch {
          // malformed JSON — ignore
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setIsLive(false);
        if (!destroyed) {
          retryTimerRef.current = setTimeout(() => {
            retryMsRef.current = Math.min(retryMsRef.current * 1.5, MAX_RETRY_MS);
            connect();
          }, retryMsRef.current);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
      setIsLive(false);
    };
  }, []);

  return (
    <LiveContext.Provider value={{ isLive, subscribe }}>
      {children}
    </LiveContext.Provider>
  );
}
