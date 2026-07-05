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
import { Shell } from "@/components/layout/Shell";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      
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
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster theme="dark" position="top-right" />
    </QueryClientProvider>
  );
}

export default App;
