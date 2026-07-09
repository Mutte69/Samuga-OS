import { Link, useLocation } from "wouter";
import { useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  TrendingUp,
  BrainCircuit,
  Database,
  TerminalSquare, 
  Activity, 
  Settings2, 
  Key, 
  GitFork,
  LogOut,
  Loader2,
} from "lucide-react";
import samugaLogo from "@assets/SamugaNewsBot_Profile_1783224477392.png";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLive } from "@/context/LiveContext";

const HUB_NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/errors", label: "Errors", icon: AlertTriangle },
  { href: "/traffic", label: "Traffic", icon: TrendingUp },
  { href: "/ai-analytics", label: "AI Analytics", icon: BrainCircuit },
  { href: "/data-explorer", label: "Data Explorer", icon: Database },
];

const LEGACY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/logs", label: "Logs Explorer", icon: TerminalSquare },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/configs", label: "Remote Configs", icon: Settings2 },
  { href: "/api-keys", label: "API Keys", icon: Key },
  { href: "/ai", label: "AI Analyzer", icon: BrainCircuit },
  { href: "/repos", label: "Repositories", icon: GitFork },
];

function NavItem({ href, label, icon: Icon, location }: { href: string; label: string; icon: React.ElementType; location: string }) {
  const isActive = location === href || (location.startsWith(href + "/") && href !== "/overview");
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer relative",
        isActive
          ? "bg-primary/12 text-primary"
          : "text-slate-400 hover:bg-sidebar-accent hover:text-slate-200"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      )}
      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive && "drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]")} />
      <span>{label}</span>
    </Link>
  );
}

function LiveIndicator() {
  const { connectionState } = useLive();

  if (connectionState === "connected") {
    return (
      <div className="flex items-center gap-1.5" title="Live feed connected" aria-label="live">
        <span className="relative flex h-2 w-2">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: "#22d3ee" }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: "#22d3ee" }}
          />
        </span>
        <span className="text-[9px] uppercase font-mono tracking-widest font-bold" style={{ color: "#22d3ee" }}>
          LIVE
        </span>
      </div>
    );
  }

  if (connectionState === "connecting") {
    return (
      <div className="flex items-center gap-1.5" title="Reconnecting to live feed…" aria-label="reconnecting">
        <Loader2
          className="animate-spin"
          style={{ width: 10, height: 10, color: "#f59e0b" }}
        />
        <span className="text-[9px] uppercase font-mono tracking-widest font-bold" style={{ color: "#f59e0b" }}>
          SYNC
        </span>
      </div>
    );
  }

  // disconnected
  return (
    <div className="flex items-center gap-1.5" title="Live feed disconnected" aria-label="offline">
      <span className="relative flex h-2 w-2">
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ background: "rgba(148,163,184,0.4)" }}
        />
      </span>
      <span className="text-[9px] uppercase font-mono tracking-widest font-bold" style={{ color: "rgba(148,163,184,0.4)" }}>
        OFF
      </span>
    </div>
  );
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        // Invalidate the session cache so LiveProvider stops the SSE connection immediately
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/");
      }
    });
  };

  return (
    <div
      className="w-64 flex flex-col h-screen text-sidebar-foreground border-r"
      style={{
        background: "rgba(5, 14, 30, 0.85)",
        backdropFilter: "blur(16px)",
        borderColor: "rgba(34, 211, 238, 0.25)",
        borderRightWidth: "1px",
        borderRightStyle: "solid",
      }}
    >
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
        <div className="w-9 h-9 flex items-center justify-center rounded-lg"
          style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)" }}>
          <img src={samugaLogo} alt="Samuga AI" className="w-7 h-7 object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold tracking-tight text-sm text-white leading-tight">SAMUGA AI</h1>
          <p className="text-[9px] uppercase font-mono tracking-widest" style={{ color: "rgba(34,211,238,0.7)" }}>
            Data Master Hub
          </p>
        </div>
        <LiveIndicator />
      </div>

      {/* Hub navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] uppercase tracking-widest font-mono" style={{ color: "rgba(34,211,238,0.5)" }}>
          Hub
        </p>
        {HUB_NAV.map((item) => (
          <NavItem key={item.href} {...item} location={location} />
        ))}

        <div className="py-3">
          <Separator className="opacity-20" style={{ borderColor: "rgba(34,211,238,0.25)" }} />
        </div>

        <p className="px-3 pb-2 text-[10px] uppercase tracking-widest font-mono" style={{ color: "rgba(148,163,184,0.5)" }}>
          Legacy
        </p>
        {LEGACY_NAV.map((item) => (
          <NavItem key={item.href} {...item} location={location} />
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t" style={{ borderColor: "rgba(34,211,238,0.12)" }}>
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}
