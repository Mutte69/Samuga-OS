import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/api-fetch";

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

/** localStorage key that persists the operator's notification preference. */
const NOTIFICATION_PREF_KEY = "samuga-notification-pref";

/**
 * Read the persisted notification preference from localStorage.
 * Falls back to the live browser permission state if nothing is stored yet.
 */
function readStoredNotificationPref(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  try {
    const stored = localStorage.getItem(NOTIFICATION_PREF_KEY);
    if (stored === "granted" || stored === "denied" || stored === "default") {
      return stored;
    }
  } catch {
    // localStorage may be unavailable in some private-browsing contexts
  }
  // Nothing stored — mirror the current browser permission so we start accurate
  return Notification.permission;
}

/** Persist the notification permission result to localStorage. */
function storeNotificationPref(perm: NotificationPermission): void {
  try {
    localStorage.setItem(NOTIFICATION_PREF_KEY, perm);
  } catch {
    // ignore write failures
  }
}

/**
 * Request notification permission once (only when the stored pref is "default").
 * Persists the result to localStorage so subsequent mounts skip the prompt.
 * Returns true if permission is (now) granted.
 */
async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;

  // If the browser already knows the answer, persist it and return
  if (Notification.permission === "granted") {
    storeNotificationPref("granted");
    return true;
  }
  if (Notification.permission === "denied") {
    storeNotificationPref("denied");
    return false;
  }

  // Check what we stored on a previous session
  const stored = readStoredNotificationPref();
  if (stored === "denied") {
    // The operator explicitly denied on a previous session — don't re-prompt
    return false;
  }

  // "default" or nothing stored — ask the user
  const result = await Notification.requestPermission();
  storeNotificationPref(result);
  return result === "granted";
}

/** Fire a browser Notification if permitted. */
function fireNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, icon: "/favicon.ico", tag: "samuga-error" });
  // Auto-close after 8 s so it doesn't linger forever
  setTimeout(() => n.close(), 8_000);
}

interface LiveContextValue {
  isLive: boolean;
  isMuted: boolean;
  muteUntil: Date | null;
  /** Number of toasts suppressed since mute started. Resets when unmuted or mute expires. */
  suppressedCount: number;
  /** Whether the operator has granted browser notification permission. */
  notificationsEnabled: boolean;
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
  suppressedCount: 0,
  notificationsEnabled: false,
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

// Use the same base as apiFetch so the SSE stream reaches the correct host
// in Railway (where admin frontend and API server are separate services).
const SSE_URL = `${API_BASE}/api/v1/live`;
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;
// How long to wait for a heartbeat before treating the connection as dead.
// The server sends one every 15 s; we allow 20 s to absorb network jitter.
const HEARTBEAT_TIMEOUT_MS = 20_000;
const BASE_TITLE = document.title || "Samuga Admin";

// ── Favicon badge helpers ──────────────────────────────────────────────────

/** Cache the original favicon href so we can restore it on clear. */
let originalFaviconHref: string | null = null;

function getFaviconEl(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>("link[rel~='icon']");
}

/**
 * Draw a red circle badge (with count) over the current favicon.
 * Falls back gracefully when Canvas or favicon manipulation is unsupported.
 */
function setFaviconBadge(count: number): void {
  try {
    const link = getFaviconEl();
    if (!link) return;

    // Snapshot the original href once
    if (originalFaviconHref === null) {
      originalFaviconHref = link.href;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    // Allow cross-origin SVG favicon to load onto the canvas
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(img, 0, 0, 32, 32);

      // Red badge circle in the bottom-right corner
      const badgeR = 9;
      const cx = 32 - badgeR;
      const cy = 32 - badgeR;
      ctx.beginPath();
      ctx.arc(cx, cy, badgeR, 0, 2 * Math.PI);
      ctx.fillStyle = "#ef4444";
      ctx.fill();

      // White count text
      const label = count > 99 ? "99+" : String(count);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${label.length > 2 ? 7 : 9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 0.5);

      link.href = canvas.toDataURL("image/png");
    };
    img.onerror = () => {
      // If the favicon image fails to load (e.g. SVG CORS), draw a plain red dot
      ctx.clearRect(0, 0, 32, 32);
      const badgeR = 9;
      const cx = 32 - badgeR;
      const cy = 32 - badgeR;
      ctx.beginPath();
      ctx.arc(cx, cy, badgeR, 0, 2 * Math.PI);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      const label = count > 99 ? "99+" : String(count);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${label.length > 2 ? 7 : 9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 0.5);
      link.href = canvas.toDataURL("image/png");
    };
    img.src = originalFaviconHref;
  } catch {
    // Canvas or favicon manipulation not supported — silently ignore
  }
}

/** Restore the favicon to the original icon and clear the badge. */
function clearFaviconBadge(): void {
  try {
    if (originalFaviconHref === null) return;
    const link = getFaviconEl();
    if (!link) return;
    link.href = originalFaviconHref;
  } catch {
    // ignore
  }
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [muteUntil, setMuteUntil] = useState<Date | null>(null);
  const [suppressedCount, setSuppressedCount] = useState(0);
  // Initialise from localStorage so the value is correct on first render
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    () => readStoredNotificationPref() === "granted",
  );

  const muteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const rateLimitListenersRef = useRef<Set<RateLimitListener>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const retryMsRef = useRef(INITIAL_RETRY_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSuppressedCount(0);
    muteTimerRef.current = setTimeout(() => {
      setMuteUntil(null);
      setSuppressedCount(0);
      muteTimerRef.current = null;
    }, durationMs);
  }, []);

  const unmute = useCallback(() => {
    if (muteTimerRef.current) clearTimeout(muteTimerRef.current);
    muteTimerRef.current = null;
    setMuteUntil(null);
    setSuppressedCount(0);
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
        clearFaviconBadge();
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

    // Ask for notification permission in the background (non-blocking).
    // requestNotificationPermission persists the result to localStorage and
    // skips the browser prompt if the operator already answered on a previous session.
    void requestNotificationPermission().then((granted) => {
      setNotificationsEnabled(granted);
    });

    let destroyed = false;
    // Reset backoff whenever we (re)connect due to a fresh login
    retryMsRef.current = INITIAL_RETRY_MS;

    function clearHeartbeatTimer() {
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    }

    function connect() {
      if (destroyed) return;

      const es = new EventSource(SSE_URL, { withCredentials: true });
      esRef.current = es;

      // Arms (or re-arms) the missed-heartbeat watchdog.
      // If the server goes silent for longer than HEARTBEAT_TIMEOUT_MS the
      // connection is considered dead and we reconnect immediately — without
      // waiting for the exponential back-off timer.
      function resetHeartbeatTimer() {
        clearHeartbeatTimer();
        heartbeatTimerRef.current = setTimeout(() => {
          if (destroyed) return;
          // Close the stale connection and reconnect right away
          es.close();
          esRef.current = null;
          setIsLive(false);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryMsRef.current = INITIAL_RETRY_MS; // restart backoff fresh
          connect();
        }, HEARTBEAT_TIMEOUT_MS);
      }

      es.addEventListener("connected", () => {
        if (destroyed) return;
        setIsLive(true);
        retryMsRef.current = INITIAL_RETRY_MS; // reset backoff on success
        resetHeartbeatTimer(); // start watching for heartbeats
      });

      // Reset the watchdog each time the server sends a heartbeat
      es.addEventListener("heartbeat", () => {
        if (destroyed) return;
        resetHeartbeatTimer();
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
        clearHeartbeatTimer(); // stop watchdog — we're already reconnecting
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
      clearHeartbeatTimer();
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
        setFaviconBadge(count);
        // Fire a browser notification; silently no-ops if permission denied
        fireNotification(`${projectName} error`, message);
      }

      // ── Toasts — suppressed while muted ──
      if (muteUntil !== null && muteUntil > new Date()) {
        setSuppressedCount((c) => c + 1);
        return;
      }

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
    <LiveContext.Provider value={{ isLive, isMuted, muteUntil, suppressedCount, notificationsEnabled, subscribe, subscribeRateLimit, mute, unmute }}>
      {children}
    </LiveContext.Provider>
  );
}
