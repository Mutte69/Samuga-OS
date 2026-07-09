import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { ProtectedRoute } from "../ProtectedRoute";
import samugaLogo from "@assets/SamugaNewsBot_Profile_1783224477392.png";
import { useLive, DEFAULT_MUTE_MS } from "../../context/LiveContext";
import { BellOff, Bell, ChevronDown } from "lucide-react";

function StarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    interface Star {
      x: number;
      y: number;
      r: number;
      speed: number;
      phase: number;
    }

    let stars: Star[] = [];
    let animId: number;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Regenerate stars on resize
      stars = Array.from({ length: 180 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.008 + 0.002,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.016;
      for (const star of stars) {
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * star.speed * 60 + star.phase));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${alpha})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

const MUTE_OPTIONS = [
  { label: "5 min", ms: 5 * 60 * 1000 },
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "30 min", ms: 30 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "Custom…", ms: null },
] as const;

function useCountdown(muteUntil: Date | null): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!muteUntil) { setLabel(""); return; }

    function tick() {
      const remaining = muteUntil!.getTime() - Date.now();
      if (remaining <= 0) { setLabel(""); return; }
      const totalSec = Math.ceil(remaining / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setLabel(m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`);
    }

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [muteUntil]);

  return label;
}

function MuteControl() {
  const { isMuted, muteUntil, mute, unmute } = useLive();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("60");
  const [customError, setCustomError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const countdown = useCountdown(muteUntil);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
        setCustomError("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus the input when the custom panel opens
  useEffect(() => {
    if (showCustom) {
      setTimeout(() => customInputRef.current?.focus(), 0);
    }
  }, [showCustom]);

  function handleCustomApply() {
    const mins = parseInt(customMinutes, 10);
    if (isNaN(mins) || mins < 1 || mins > 480) {
      setCustomError("Enter 1–480 min");
      return;
    }
    mute(mins * 60 * 1000);
    setOpen(false);
    setShowCustom(false);
    setCustomError("");
  }

  if (isMuted) {
    return (
      <button
        onClick={unmute}
        title="Toasts muted — click to unmute"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
          bg-amber-500/20 border border-amber-500/40 text-amber-300
          hover:bg-amber-500/30 transition-colors cursor-pointer select-none"
      >
        <BellOff className="w-3.5 h-3.5" />
        <span>Muted {countdown && `· ${countdown}`}</span>
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setShowCustom(false); setCustomError(""); }}
        title="Mute live toasts"
        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
          bg-white/5 border border-white/10 text-sky-300/70
          hover:bg-white/10 hover:text-sky-200 transition-colors cursor-pointer select-none"
      >
        <Bell className="w-3.5 h-3.5" />
        <span>Mute</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-lg overflow-hidden shadow-xl
            border border-white/10 bg-slate-900/95 backdrop-blur-sm z-50"
          style={{ minWidth: showCustom ? "10rem" : "9rem" }}
        >
          {showCustom ? (
            <div className="px-3 py-2.5 flex flex-col gap-2">
              <p className="text-xs text-slate-300 font-medium">Custom duration</p>
              <div className="flex items-center gap-1.5">
                <input
                  ref={customInputRef}
                  type="number"
                  min={1}
                  max={480}
                  value={customMinutes}
                  onChange={(e) => { setCustomMinutes(e.target.value); setCustomError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCustomApply(); if (e.key === "Escape") { setShowCustom(false); setCustomError(""); } }}
                  className="w-16 px-2 py-1 rounded text-xs bg-slate-800 border border-white/15
                    text-slate-100 focus:outline-none focus:border-sky-500 [appearance:textfield]
                    [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-slate-400">min</span>
              </div>
              {customError && <p className="text-xs text-red-400">{customError}</p>}
              <div className="flex gap-1.5">
                <button
                  onClick={handleCustomApply}
                  className="flex-1 px-2 py-1 rounded text-xs font-medium
                    bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
                >
                  Apply
                </button>
                <button
                  onClick={() => { setShowCustom(false); setCustomError(""); }}
                  className="flex-1 px-2 py-1 rounded text-xs
                    bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            MUTE_OPTIONS.map(({ label, ms }) =>
              ms === null ? (
                <button
                  key="custom"
                  onClick={() => setShowCustom(true)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-400
                    hover:bg-white/10 hover:text-slate-200 transition-colors cursor-pointer border-t border-white/5"
                >
                  Custom…
                </button>
              ) : (
                <button
                  key={ms}
                  onClick={() => { mute(ms); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-200
                    hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Mute for {label}
                </button>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

function ShellHeader() {
  const { isLive } = useLive();

  return (
    <div
      className="fixed top-0 right-0 flex items-center gap-3 px-4 py-2"
      style={{ zIndex: 20 }}
    >
      {/* Live indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}
        />
        <span className="text-xs text-slate-400">{isLive ? "Live" : "Offline"}</span>
      </div>

      {/* Mute control */}
      {isLive && <MuteControl />}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      {/* Space backdrop */}
      <div
        className="fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(14,30,60,0.8) 0%, transparent 60%), " +
            "radial-gradient(ellipse at 80% 20%, rgba(8,20,50,0.6) 0%, transparent 50%), " +
            "hsl(222 47% 4%)",
          zIndex: 0,
        }}
      />

      {/* Twinkling stars */}
      <StarCanvas />

      {/* Samuga logo watermark */}
      <img
        src={samugaLogo}
        alt=""
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "58%",
          transform: "translate(-50%, -50%)",
          width: "380px",
          height: "380px",
          objectFit: "contain",
          opacity: 0.09,
          pointerEvents: "none",
          zIndex: 1,
          animation: "logoFloat 8s ease-in-out infinite",
          filter: "blur(1px)",
        }}
      />

      {/* Floating header with live indicator + mute */}
      <ShellHeader />

      {/* App shell */}
      <div className="relative flex h-screen w-full overflow-hidden" style={{ zIndex: 10 }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
