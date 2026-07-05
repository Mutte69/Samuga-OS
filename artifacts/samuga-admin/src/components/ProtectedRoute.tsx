import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data, isPending, isError } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  useEffect(() => {
    if (isError) {
      setLocation("/");
    }
  }, [isError, setLocation]);

  // isPending covers both the initial fetch and any subsequent refetch before
  // data arrives — never redirect while we're still waiting for /auth/me.
  if (isPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="font-mono text-sm uppercase tracking-wider">INITIALIZING COMMAND CENTER...</p>
        </div>
      </div>
    );
  }

  if (data) {
    return <>{children}</>;
  }

  return null;
}
