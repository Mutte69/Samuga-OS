import { useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { ProtectedRoute } from "../ProtectedRoute";
import samugaLogo from "@assets/SamugaNewsBot_Profile_1783224477392.png";

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
