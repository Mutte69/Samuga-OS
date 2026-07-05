import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import samugaLogo from "@assets/SamugaNewsBot_Profile_1783224477392.png";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { username, password } }, {
      onSuccess: () => {
        toast.success("Authentication successful");
        // Invalidate the /auth/me cache so ProtectedRoute always does a
        // fresh fetch after login — never hits a stale 401 from before.
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/dashboard");
      },
      onError: () => {
        toast.error("Authentication failed", { description: "Invalid credentials." });
      }
    });
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #004de6 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      
      <Card className="w-full max-w-md z-10 border-sidebar-border bg-sidebar-accent shadow-2xl">
        <CardHeader className="space-y-4 items-center pt-10">
          <div className="w-20 h-20 flex items-center justify-center">
            <img src={samugaLogo} alt="Samuga AI" className="w-20 h-20 object-contain drop-shadow-[0_0_12px_rgba(14,165,233,0.5)]" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">SAMUGA AI</h1>
            <p className="text-sm font-mono text-sidebar-foreground/60 uppercase tracking-widest">Ops Console Authorization</p>
          </div>
        </CardHeader>
        <CardContent className="pb-10 px-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-sidebar-foreground/80 uppercase">Operator ID</label>
              <Input 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="bg-sidebar border-sidebar-border text-white font-mono h-12 focus-visible:ring-primary focus-visible:border-primary" 
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-sidebar-foreground/80 uppercase">Passkey</label>
              <Input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="bg-sidebar border-sidebar-border text-white font-mono h-12 focus-visible:ring-primary focus-visible:border-primary" 
                placeholder="••••••••"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 font-bold tracking-wide" 
              disabled={login.isPending}
            >
              {login.isPending ? "AUTHENTICATING..." : "INITIALIZE UPLINK"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
