import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Logs from "@/pages/logs";
import Analytics from "@/pages/analytics";
import Configs from "@/pages/configs";
import ApiKeys from "@/pages/api-keys";
import AiAnalyzer from "@/pages/ai";
import Repos from "@/pages/repos";
// New hub pages
import Overview from "@/pages/overview";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Errors from "@/pages/errors";
import Traffic from "@/pages/traffic";
import AiAnalytics from "@/pages/ai-analytics";
import DataExplorer from "@/pages/data-explorer";
import { Shell } from "@/components/layout/Shell";
import { LiveProvider } from "@/context/LiveContext";

// Retry once (not three times) so errors surface within ~2 s instead of
// the ~20 s it would take with the default 3-retry + exponential backoff.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />

      {/* Hub pages */}
      <Route path="/overview">
        <Shell><Overview /></Shell>
      </Route>
      <Route path="/projects/:id">
        <Shell><ProjectDetail /></Shell>
      </Route>
      <Route path="/projects">
        <Shell><Projects /></Shell>
      </Route>
      <Route path="/errors">
        <Shell><Errors /></Shell>
      </Route>
      <Route path="/traffic">
        <Shell><Traffic /></Shell>
      </Route>
      <Route path="/ai-analytics">
        <Shell><AiAnalytics /></Shell>
      </Route>
      <Route path="/data-explorer">
        <Shell><DataExplorer /></Shell>
      </Route>

      {/* Legacy pages */}
      <Route path="/dashboard">
        <Shell><Dashboard /></Shell>
      </Route>
      <Route path="/logs">
        <Shell><Logs /></Shell>
      </Route>
      <Route path="/analytics">
        <Shell><Analytics /></Shell>
      </Route>
      <Route path="/configs">
        <Shell><Configs /></Shell>
      </Route>
      <Route path="/api-keys">
        <Shell><ApiKeys /></Shell>
      </Route>
      <Route path="/ai">
        <Shell><AiAnalyzer /></Shell>
      </Route>
      <Route path="/repos">
        <Shell><Repos /></Shell>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster theme="dark" position="top-right" />
      </LiveProvider>
    </QueryClientProvider>
  );
}

export default App;
