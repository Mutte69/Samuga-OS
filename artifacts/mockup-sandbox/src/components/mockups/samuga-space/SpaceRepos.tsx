import "./_group.css";
import { useEffect, useRef } from "react";

const NAV_ITEMS = [
  { label: "Overview", icon: "⬡" },
  { label: "Logs Explorer", icon: "⌥" },
  { label: "Analytics", icon: "◈" },
  { label: "Remote Configs", icon: "⚙" },
  { label: "API Keys", icon: "⬡" },
  { label: "AI Analyzer", icon: "✦" },
  { label: "Repositories", icon: "⌥", active: true },
];

const REPOS = [
  { name: "Samuga-OS", full_name: "Mutte69/Samuga-OS", description: "Centralized admin OS for Samuga AI — data ingestion, telemetry, config management.", language: "TypeScript", private: false, default_branch: "main", updated_at: "2025-07-04" },
  { name: "samuga-discord-bot", full_name: "Mutte69/samuga-discord-bot", description: "Discord integration bot for Samuga AI newsroom. Real-time alerts and digest publishing.", language: "Python", private: true, default_branch: "main", updated_at: "2025-07-01" },
  { name: "samuga-telegram", full_name: "Mutte69/samuga-telegram", description: "Telegram publisher bot. Handles digest formatting and Markdown rendering.", language: "Python", private: true, default_branch: "dev", updated_at: "2025-06-28" },
  { name: "samuga-crawler", full_name: "Mutte69/samuga-crawler", description: "Async news crawler and parser. RSS, scraping, deduplication pipeline.", language: "Python", private: true, default_branch: "main", updated_at: "2025-06-24" },
  { name: "samuga-infra", full_name: "Mutte69/samuga-infra", description: "Railway deployment configs, environment orchestration, monitoring setup.", language: "Shell", private: true, default_branch: "main", updated_at: "2025-06-18" },
  { name: "samuga-docs", full_name: "Mutte69/samuga-docs", description: "Public documentation and architecture notes for Samuga AI platform.", language: null, private: false, default_branch: "main", updated_at: "2025-06-10" },
];

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3b82f6",
  Python: "#22c55e",
  Shell: "#84cc16",
};

function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.2 + 0.2,
      o: Math.random() * 0.6 + 0.1,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: Math.random() * 0.003 + 0.001,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
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

export function SpaceRepos() {
  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#050a18", fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif" }}>

      {/* Galaxy background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 130% 80% at 50% -10%, #0a1628 0%, #06101e 40%, #050a14 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 60% 35% at 60% 40%, rgba(30,58,120,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 25% at 30% 60%, rgba(49,46,129,0.12) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 50% 30% at 80% 70%, rgba(6,182,212,0.05) 0%, transparent 60%), radial-gradient(ellipse 40% 20% at 20% 30%, rgba(99,102,241,0.05) 0%, transparent 60%)",
        }} />
        <StarField />
        <div className="samuga-watermark" />
      </div>

      {/* Sidebar */}
      <aside style={{
        width: 220, background: "rgba(5,14,30,0.85)",
        borderRight: "1px solid rgba(34,211,238,0.12)",
        backdropFilter: "blur(16px)",
        display: "flex", flexDirection: "column", zIndex: 10, position: "relative",
      }}>
        <div style={{ padding: "24px 20px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            background: "rgba(34,211,238,0.15)",
            border: "1px solid rgba(34,211,238,0.4)",
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, boxShadow: "0 0 12px rgba(34,211,238,0.25)",
          }}>✦</div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em" }}>SAMUGA AI</div>
            <div style={{ color: "rgba(34,211,238,0.5)", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase" }}>Ops Console</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              fontSize: 13, fontWeight: item.active ? 600 : 400,
              background: item.active ? "rgba(34,211,238,0.12)" : "transparent",
              color: item.active ? "#22d3ee" : "rgba(148,163,184,0.8)",
              boxShadow: item.active ? "inset 0 0 0 1px rgba(34,211,238,0.25), 0 0 16px rgba(34,211,238,0.08)" : "none",
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

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 5 }}>
        <div style={{ padding: "36px 32px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
            <div>
              <h1 style={{ color: "white", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Repositories</h1>
              <p style={{ color: "rgba(148,163,184,0.7)", fontSize: 14, marginTop: 6 }}>GitHub repositories for this owner — read-only view.</p>
            </div>
            <button style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 16px", borderRadius: 8,
              background: "rgba(34,211,238,0.08)",
              border: "1px solid rgba(34,211,238,0.3)",
              color: "#22d3ee", fontSize: 13, fontWeight: 500, cursor: "pointer",
              boxShadow: "0 0 16px rgba(34,211,238,0.1)",
            }}>
              ↻ Refresh
            </button>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 20, marginBottom: 24,
            padding: "12px 18px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(34,211,238,0.1)",
            borderRadius: 10, backdropFilter: "blur(8px)",
            fontSize: 13, color: "rgba(148,163,184,0.8)",
          }}>
            <span>⌥ <b style={{ color: "white" }}>{REPOS.length}</b> repositories</span>
            <span style={{ color: "rgba(34,211,238,0.2)" }}>·</span>
            <span>🔒 <b style={{ color: "white" }}>{REPOS.filter(r => r.private).length}</b> private</span>
            <span style={{ color: "rgba(34,211,238,0.2)" }}>·</span>
            <span>🌐 <b style={{ color: "white" }}>{REPOS.filter(r => !r.private).length}</b> public</span>
          </div>

          {/* Repo grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {REPOS.map(repo => (
              <div key={repo.name} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(34,211,238,0.13)",
                borderRadius: 12,
                padding: "18px 20px",
                backdropFilter: "blur(12px)",
                display: "flex", flexDirection: "column", gap: 10,
                position: "relative", overflow: "hidden",
              }}>
                {/* Top shimmer line */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent)" }} />

                {/* Name + badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ color: "rgba(148,163,184,0.5)", fontSize: 14 }}>⌥</span>
                    <span style={{ color: "rgba(226,232,240,0.95)", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.name}</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                    border: `1px solid ${repo.private ? "rgba(251,146,60,0.4)" : "rgba(34,197,94,0.4)"}`,
                    color: repo.private ? "#fb923c" : "#4ade80",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {repo.private ? "🔒 Private" : "🌐 Public"}
                  </span>
                </div>

                {/* Description */}
                <p style={{
                  color: "rgba(148,163,184,0.7)", fontSize: 12, lineHeight: 1.6,
                  margin: 0, display: "-webkit-box", WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as any, overflow: "hidden",
                  minHeight: "2.4em",
                }}>
                  {repo.description ?? <span style={{ fontStyle: "italic", opacity: 0.5 }}>No description.</span>}
                </p>

                {/* Meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11 }}>
                  {repo.language && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(148,163,184,0.7)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: LANG_COLORS[repo.language] ?? "#94a3b8", display: "inline-block", boxShadow: `0 0 5px ${LANG_COLORS[repo.language] ?? "#94a3b8"}` }} />
                      {repo.language}
                    </span>
                  )}
                  <span style={{ color: "rgba(100,116,139,0.7)", display: "flex", alignItems: "center", gap: 4 }}>
                    ⏱ {repo.updated_at}
                  </span>
                </div>

                {/* Branch */}
                <div style={{ fontSize: 11, color: "rgba(100,116,139,0.7)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span>⌥</span>
                  <span style={{ fontFamily: "monospace" }}>{repo.default_branch}</span>
                </div>

                {/* Button */}
                <button style={{
                  marginTop: 4,
                  width: "100%", padding: "7px 0",
                  background: "rgba(34,211,238,0.06)",
                  border: "1px solid rgba(34,211,238,0.2)",
                  borderRadius: 8, color: "rgba(34,211,238,0.9)",
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  ↗ Open on GitHub
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
