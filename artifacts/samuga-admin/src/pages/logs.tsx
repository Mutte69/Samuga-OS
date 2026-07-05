import { useState } from "react";
import { useListLogs, getListLogsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const LIMIT = 50;

export default function Logs() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [logLevel, setLogLevel] = useState<string>("all");
  const [sourceRepo, setSourceRepo] = useState<string>("all");

  const queryClient = useQueryClient();

  // We build params dynamically based on filters
  const params: any = { limit: LIMIT, offset: page * LIMIT };
  if (search) params.search = search;
  if (logLevel !== "all") params.log_level = logLevel;
  if (sourceRepo !== "all") params.source_repo = sourceRepo;

  const { data, isLoading, isFetching } = useListLogs(params, {
    query: { keepPreviousData: true, queryKey: getListLogsQueryKey(params) }
  } as any);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
  };

  const badgeColor = (level: string) => {
    switch(level) {
      case "debug": return "bg-slate-200 text-slate-700 hover:bg-slate-300";
      case "info": return "bg-blue-100 text-blue-700 hover:bg-blue-200";
      case "warn": return "bg-orange-100 text-orange-700 hover:bg-orange-200";
      case "error": return "bg-red-100 text-red-700 hover:bg-red-200";
      default: return "bg-slate-100";
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logs Explorer</h1>
          <p className="text-muted-foreground mt-1">Real-time system event monitoring.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-4 flex gap-4 items-center bg-card shadow-sm border-border/50">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search log messages..." 
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select 
          className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={logLevel}
          onChange={e => { setLogLevel(e.target.value); setPage(0); }}
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <Input 
          placeholder="Filter by source repo" 
          className="w-48"
          value={sourceRepo === "all" ? "" : sourceRepo}
          onChange={e => { setSourceRepo(e.target.value || "all"); setPage(0); }}
        />
      </Card>

      <Card className="shadow-sm border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[120px]">Level</TableHead>
              <TableHead className="w-[200px]">Source</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">Loading logs...</TableCell>
              </TableRow>
            ) : !data || data.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No logs found matching criteria.</TableCell>
              </TableRow>
            ) : (
              data.logs.map(log => (
                <TableRow key={log.id} className="font-mono text-xs">
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Badge className={badgeColor(log.log_level)} variant="outline">
                      {log.log_level.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{log.source_repo}</TableCell>
                  <TableCell className="truncate max-w-[500px]" title={log.message}>
                    {log.message}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {data && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {page * LIMIT + 1}-{Math.min((page + 1) * LIMIT, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 0} 
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={(page + 1) * LIMIT >= data.total} 
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
