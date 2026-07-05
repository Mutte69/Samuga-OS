import { useEffect, useRef } from "react";
import "./_group.css";

// ─── Static data (no API needed for mockup) ─────────────────────────────────
const NAV_ITEMS = [
  { label: "Overview", icon: "⬡", active: true },
  { label: "Logs Explorer", icon: "⌥" },
  { label: "Analytics", icon: "◈" },
  { label: "Remote Configs", icon: "⚙" },
  { label: "API Keys", icon: "⬡" },
  { label: "AI Analyzer", icon: "✦" },
  { label: "Repositories", icon: "⌥" },
];

const STATS = [
  { label: "Total Logs Ingested", value: "1,247,832", trend: "+12.4%", up: true },
  { label: "Analytics Events", value: "483,021", trend: "+8.1%", up: true },
  { label: "Active Configs", value: "14", trend: "stable", up: null },
  { label: "API Keys", value: "7", trend: "-1 revoked", up: false },
];

const LINE_DATA = [
  { h: "00", logs: 120, analytics: 80 },
  { h: "02", logs: 90, analytics: 60 },
  { h: "04", logs: 75, analytics: 45 },
  { h: "06", logs: 110, analytics: 70 },
  { h: "08", logs: 210, analytics: 150 },
  { h: "10", logs: 340, analytics: 200 },
  { h: "12", logs: 290, analytics: 180 },
  { h: "14", logs: 380, analytics: 240 },
  { h: "16", logs: 420, analytics: 280 },
  { h: "18", logs: 390, analytics: 260 },
  { h: "20", logs: 310, analytics: 200 },
  { h: "22", logs: 180, analytics: 130 },
];

const PIE_SLICES = [
  { label: "INFO", pct: 58, color: "#22d3ee" },
  { label: "DEBUG", pct: 25, color: "#6366f1" },
  { label: "WARN", pct: 11, color: "#f59e0b" },
  { label: "ERROR", pct: 6, color: "#ef4444" },
];

const BAR_DATA = [
  { platform: "discord", count: 520 },
  { platform: "telegram", count: 310 },
  { platform: "twitter", count: 190 },
  { platform: "webhook", count: 420 },
  { platform: "internal", count: 270 },
];

// ─── Star canvas ─────────────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    interface Star { x: number; y: number; r: number; o: number; dir: number; speed: number }
    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.2,
      o: Math.random() * 0.6 + 0.1,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: Math.random() * 0.003 + 0.001,
    }));

    let raf: number;
    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 1;
      stars.forEach(s => {
        s.o += s.speed * s.dir;
        if (s.o > 0.8 || s.o < 0.05) s.dir *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 230, 255, ${s.o})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ─── Mini SVG line chart ──────────────────────────────────────────────────────
function MiniLineChart() {
  const W = 500, H = 160;
  const maxVal = 450;
  const toY = (v: number) => H - 8 - ((v / maxVal) * (H - 16));
  const toX = (i: number) => (i / (LINE_DATA.length - 1)) * W;

  const logsPath = LINE_DATA.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.logs).toFixed(1)}`).join(" ");
  const analyticsPath = LINE_DATA.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.analytics).toFixed(1)}`).join(" ");
  const logsArea = logsPath + ` L${W},${H} L0,${H} Z`;
  const analyticsArea = analyticsPath + ` L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="glogs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ganalytics" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1="0" y1={H - 8 - t * (H - 16)} x2={W} y2={H - 8 - t * (H - 16)}
          stroke="rgba(34,211,238,0.07)" strokeWidth="1" />
      ))}
      <path d={logsArea} fill="url(#glogs)" />
      <path d={analyticsArea} fill="url(#ganalytics)" />
      <path d={logsPath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={analyticsPath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {LINE_DATA.filter((_, i) => i % 3 === 0).map((d, _, arr) => (
        <text key={d.h} x={toX(LINE_DATA.indexOf(d))} y={H - 1} fontSize="9" fill="rgba(148,163,184,0.7)" textAnchor="middle">{d.h}:00</text>
      ))}
    </svg>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────────────────
function DonutChart() {
  const cx = 80, cy = 80, r = 58, inner = 38;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;
  return (
    <svg viewBox="0 0 160 160" className="w-36 h-36">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="20" />
      {PIE_SLICES.map(s => {
        const dash = (s.pct / 100) * circumference;
        const offset = (1 - cumulative / 100) * circumference;
        cumulative += s.pct;
        return (
          <circle key={s.label} cx={cx} cy={cy} r={r}
            fill="none" stroke={s.color} strokeWidth="20"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 4px ${s.color}80)` }}
          />
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">58%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(148,163,184,0.8)" fontSize="9">INFO</text>
    </svg>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function BarChart() {
  const max = Math.max(...BAR_DATA.map(d => d.count));
  const W = 440, H = 120;
  const barW = 56, gap = (W - barW * BAR_DATA.length) / (BAR_DATA.length + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {BAR_DATA.map((d, i) => {
        const bh = (d.count / max) * H;
        const x = gap + i * (barW + gap);
        const y = H - bh;
        return (
          <g key={d.platform}>
            <rect x={x} y={y} width={barW} height={bh} rx="4" fill="url(#gbar)"
              style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.4))" }} />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize="10">{d.platform}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SpaceDashboard() {
  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#050a18", fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Galaxy background ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Deep space gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 130% 80% at 50% -10%, #0a1628 0%, #06101e 40%, #050a14 100%)",
        }} />
        {/* Milky way band */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 60% 35% at 60% 40%, rgba(30,58,120,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 25% at 30% 60%, rgba(49,46,129,0.12) 0%, transparent 70%)",
        }} />
        {/* Subtle nebula glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 50% 30% at 80% 70%, rgba(6,182,212,0.05) 0%, transparent 60%), radial-gradient(ellipse 40% 20% at 20% 30%, rgba(99,102,241,0.05) 0%, transparent 60%)",
        }} />
        <StarField />
        {/* Watermark logo */}
        <div className="samuga-watermark" />
      </div>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 220,
        background: "rgba(5,14,30,0.85)",
        borderRight: "1px solid rgba(34,211,238,0.12)",
        backdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            background: "rgba(34,211,238,0.15)",
            border: "1px solid rgba(34,211,238,0.4)",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
            boxShadow: "0 0 12px rgba(34,211,238,0.25)",
          }}>✦</div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em" }}>SAMUGA AI</div>
            <div style={{ color: "rgba(34,211,238,0.5)", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase" }}>Ops Console</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((item) => (
            <button key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              fontSize: 13, fontWeight: item.active ? 600 : 400,
              background: item.active ? "rgba(34,211,238,0.12)" : "transparent",
              color: item.active ? "#22d3ee" : "rgba(148,163,184,0.8)",
              boxShadow: item.active ? "inset 0 0 0 1px rgba(34,211,238,0.25), 0 0 16px rgba(34,211,238,0.08)" : "none",
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 14, opacity: item.active ? 1 : 0.6 }}>{item.icon}</span>
              {item.label}
              {item.active && <span style={{
                marginLeft: "auto", width: 5, height: 5, borderRadius: "50%",
                background: "#22d3ee", boxShadow: "0 0 8px #22d3ee",
              }} />}
            </button>
          ))}
        </nav>

        {/* Disconnect */}
        <div style={{ padding: "12px 12px 20px", borderTop: "1px solid rgba(34,211,238,0.08)" }}>
          <button style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            color: "rgba(148,163,184,0.6)", fontSize: 13,
          }}>
            <span>⏻</span> Disconnect
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 5 }}>
        <div style={{ padding: "36px 32px", maxWidth: 960, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ color: "white", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Command Center</h1>
            <p style={{ color: "rgba(148,163,184,0.7)", fontSize: 14, marginTop: 6 }}>Live overview of data orchestration and telemetry.</p>
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {STATS.map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(34,211,238,0.15)",
                borderRadius: 12,
                padding: "18px 20px",
                backdropFilter: "blur(12px)",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{ position: "absolute", top: 0, right: 0, left: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)" }} />
                <div style={{ color: "rgba(148,163,184,0.7)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{s.label}</div>
                <div style={{ color: "white", fontSize: 24, fontWeight: 700, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{
                  marginTop: 6, fontSize: 11,
                  color: s.up === true ? "#22d3ee" : s.up === false ? "#f87171" : "rgba(148,163,184,0.5)",
                }}>{s.trend}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, marginBottom: 14 }}>
            {/* Line chart */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(34,211,238,0.12)",
              borderRadius: 12, padding: "20px 20px 10px",
              backdropFilter: "blur(12px)", overflow: "hidden", position: "relative",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, left: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ color: "rgba(226,232,240,0.9)", fontSize: 13, fontWeight: 600 }}>Ingestion Timeline (24h)</span>
                <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                  <span style={{ color: "#22d3ee", display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 20, height: 2, background: "#22d3ee", borderRadius: 1 }} />Logs</span>
                  <span style={{ color: "#818cf8", display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 20, height: 2, background: "#818cf8", borderRadius: 1 }} />Analytics</span>
                </div>
              </div>
              <div style={{ height: 150 }}><MiniLineChart /></div>
            </div>

            {/* Donut */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(34,211,238,0.12)",
              borderRadius: 12, padding: "20px 24px",
              backdropFilter: "blur(12px)", minWidth: 220, position: "relative",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, left: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)" }} />
              <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Log Severity</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><DonutChart /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {PIE_SLICES.map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block", boxShadow: `0 0 5px ${s.color}` }} />
                      <span style={{ color: "rgba(148,163,184,0.8)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase" }}>{s.label}</span>
                    </div>
                    <span style={{ color: "rgba(226,232,240,0.8)", fontFamily: "monospace" }}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(34,211,238,0.12)",
            borderRadius: 12, padding: "20px 20px 14px",
            backdropFilter: "blur(12px)", position: "relative",
          }}>
            <div style={{ position: "absolute", top: 0, right: 0, left: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)" }} />
            <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Platform Telemetry Breakdown</div>
            <BarChart />
          </div>

        </div>
      </main>
    </div>
  );
}
