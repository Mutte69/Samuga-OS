import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export interface RateLimitPayload {
  id: string;
  ip: string;
  path: string;
  timestamp: string;
  hitCount: number;
}

export interface LivePayload {
  type: "event" | "metric";
  projectId: number;
  data: Record<string, unknown>;
}

type Listener = (payload: LivePayload) => void;
type RateLimitListener = (payload: RateLimitPayload) => void;

const MAX_TOASTS = 3;
let activeToastCount = 0;

export const DEFAULT_MUTE_MS = 5 * 60 * 1000; // 5 minutes

interface LiveContextValue {
  isLive: boolean;
  isMuted: boolean;
  muteUntil: Date | null;
  /** Subscribe to live payloads. Returns an unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
  /** Subscribe to rate-limit events. Returns an unsubscribe function. */
  subscribeRateLimit: (listener: RateLimitListener) => () => void;
  /** Mute toasts for the given duration (default 5 min). */
  mute: (durationMs?: number) => void;
  /** Unmute immediately. */
  unmute: () => void;
}

const LiveContext = createContext<LiveContextValue>({
  isLive: false,
  isMuted: false,
  muteUntil: null,
  subscribe: () => () => {},
  subscribeRateLimit: () => () => {},
  mute: () => {},
  unmute: () => {},
});

export function useLive() {
  return useContext(LiveContext);
}

/**
 * Subscribe to real-time rate-limit hit events from the SSE stream.
 * Returns an unsubscribe function (call it in a useEffect cleanup).
 */
export function useLiveRateLimits() {
  const { subscribeRateLimit } = useContext(LiveContext);
  return subscribeRateLimit;
}

const SSE_URL = "/api/v1/live";
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;
const BASE_TITLE = document.title || "Samuga Admin";

/** Request notification permission once, silently. */
async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Fire a browser Notification if permitted. */
function fireNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, icon: "/favicon.ico", tag: "samuga-error" });
  // Auto-close after 8 s so it doesn't linger forever
  setTimeout(() => n.close(), 8_000);
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [muteUntil, setMuteUntil] = useState<Date | null>(null);
  const muteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const rateLimitListenersRef = useRef<Set<RateLimitListener>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const retryMsRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unread error count while the tab is hidden
  const unreadErrorsRef = useRef(0);

  // Track auth state — treat as authenticated only when we have user data
  const { data: meData, isSuccess: isAuthenticated } = useGetMe({
    query: { retry: false, staleTime: 30_000, queryKey: getGetMeQueryKey() },
  });
  // Suppress unused variable warning — we only care about the auth flag
  void meData;

  const isMuted = muteUntil !== null && muteUntil > new Date();

  const mute = useCallback((durationMs: number = DEFAULT_MUTE_MS) => {
    if (muteTimerRef.current) clearTimeout(muteTimerRef.current);
    const until = new Date(Date.now() + durationMs);
    setMuteUntil(until);
    muteTimerRef.current = setTimeout(() => {
      setMuteUntil(null);
      muteTimerRef.current = null;
    }, durationMs);
  }, []);

  const unmute = useCallback(() => {
    if (muteTimerRef.current) clearTimeout(muteTimerRef.current);
    muteTimerRef.current = null;
    setMuteUntil(null);
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const subscribeRateLimit = useCallback((listener: RateLimitListener) => {
    rateLimitListenersRef.current.add(listener);
    return () => { rateLimitListenersRef.current.delete(listener); };
  }, []);

  // Clear unread badge when the user returns to the tab
  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) {
        unreadErrorsRef.current = 0;
        document.title = BASE_TITLE;
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    // Don't open SSE until the user is authenticated
    if (!isAuthenticated) {
      // If we somehow have a stale connection from before, close it
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
      setIsLive(false);
      return;
    }

    // Ask for notification permission in the background (non-blocking)
    void requestNotificationPermission();

    let destroyed = false;
    // Reset backoff whenever we (re)connect due to a fresh login
    retryMsRef.current = INITIAL_RETRY_MS;

    function connect() {
      if (destroyed) return;

      const es = new EventSource(SSE_URL, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (destroyed) return;
        setIsLive(true);
        retryMsRef.current = INITIAL_RETRY_MS; // reset backoff on success
      });

      // Default message event — live events (event / metric types)
      es.onmessage = (e) => {
        if (destroyed) return;
        try {
          const payload = JSON.parse(e.data) as LivePayload;
          listenersRef.current.forEach((fn) => fn(payload));
        } catch {
          // malformed JSON — ignore
        }
      };

      // Named "rate_limit" event from the server
      es.addEventListener("rate_limit", (e) => {
        if (destroyed) return;
        try {
          const payload = JSON.parse(e.data) as RateLimitPayload;
          rateLimitListenersRef.current.forEach((fn) => fn(payload));

          // Also show a brief toast so operators notice even if not on Overview
          if (activeToastCount < MAX_TOASTS) {
            activeToastCount++;
            const onDismiss = () => { activeToastCount = Math.max(0, activeToastCount - 1); };
            toast.warning(`Rate limit hit: ${payload.ip} → ${payload.path}`, {
              duration: 4000,
              onDismiss,
              onAutoClose: onDismiss,
            });
          }
        } catch {
          // malformed JSON — ignore
        }
      });

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

    // When the browser comes back online, skip the backoff and reconnect immediately
    function handleOnline() {
      if (destroyed) return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // Only reconnect if we don't already have an open connection
      if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
        retryMsRef.current = INITIAL_RETRY_MS;
        connect();
      }
    }

    window.addEventListener("online", handleOnline);

    return () => {
      destroyed = true;
      window.removeEventListener("online", handleOnline);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      esRef.current?.close();
      esRef.current = null;
      setIsLive(false);
    };
  }, [isAuthenticated]);

  // Fire toasts (and background alerts) when live events arrive
  useEffect(() => {
    const unsub = subscribe((payload) => {
      if (payload.type !== "event") return;

      const data = payload.data;
      const eventType = typeof data.eventType === "string" ? data.eventType : "";
      const projectName =
        typeof data.projectName === "string" ? data.projectName : `Project ${payload.projectId}`;
      const message =
        typeof data.message === "string" ? data.message : eventType || "New event";

      // ── Background alerts (only for errors, only when tab is hidden) ──
      if (eventType === "error" && document.hidden) {
        unreadErrorsRef.current += 1;
        const count = unreadErrorsRef.current;
        document.title = `(${count}) ${BASE_TITLE}`;
        // Fire a browser notification; silently no-ops if permission denied
        fireNotification(`${projectName} error`, message);
      }

      // ── Toasts — suppressed while muted ──
      if (muteUntil !== null && muteUntil > new Date()) return;

      if (activeToastCount >= MAX_TOASTS) return;

      activeToastCount++;
      const onDismiss = () => { activeToastCount = Math.max(0, activeToastCount - 1); };

      if (eventType === "error") {
        toast.error(`${projectName}: ${message}`, {
          duration: 6000,
          onDismiss,
          onAutoClose: onDismiss,
        });
      } else {
        toast(`${projectName}: ${message}`, {
          duration: 4000,
          style: { borderLeft: "3px solid #06b6d4" },
          onDismiss,
          onAutoClose: onDismiss,
        });
      }
    });

    return unsub;
  }, [subscribe, muteUntil]);

  return (
    <LiveContext.Provider value={{ isLive, isMuted, muteUntil, subscribe, subscribeRateLimit, mute, unmute }}>
      {children}
    </LiveContext.Provider>
  );
}
