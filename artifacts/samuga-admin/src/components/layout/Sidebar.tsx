import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  TerminalSquare, 
  Activity, 
  Settings2, 
  Key, 
  BrainCircuit, 
  LogOut 
} from "lucide-react";
import samugaLogo from "@assets/SamugaNewsBot_Profile_1783224477392.png";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/logs", label: "Logs Explorer", icon: TerminalSquare },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/configs", label: "Remote Configs", icon: Settings2 },
  { href: "/api-keys", label: "API Keys", icon: Key },
  { href: "/ai", label: "AI Analyzer", icon: BrainCircuit },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/");
      }
    });
  };

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src={samugaLogo} alt="Samuga AI" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <h1 className="font-bold tracking-tight text-sm text-white">SAMUGA AI</h1>
          <p className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Ops Console</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/dashboard");
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}
