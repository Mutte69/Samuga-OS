import { useState } from "react";
import { useListAnalytics, getListAnalyticsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { Search, RefreshCw, ChevronLeft, ChevronRight, FileJson } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const LIMIT = 50;

export default function Analytics() {
  const [page, setPage] = useState(0);
  const [platform, setPlatform] = useState("");
  const [action, setAction] = useState("");

  const queryClient = useQueryClient();

  const params: any = { limit: LIMIT, offset: page * LIMIT };
  if (platform) params.platform = platform;
  if (action) params.action = action;

  const { data, isLoading, isFetching } = useListAnalytics(params, {
    query: { keepPreviousData: true, queryKey: getListAnalyticsQueryKey(params) }
  } as any);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAnalyticsQueryKey() });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Analytics</h1>
          <p className="text-muted-foreground mt-1">Platform telemetry and user events.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-4 flex gap-4 items-center bg-card shadow-sm border-border/50">
        <Input 
          placeholder="Filter by platform..." 
          className="w-64"
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(0); }}
        />
        <Input 
          placeholder="Filter by action..." 
          className="w-64"
          value={action}
          onChange={e => { setAction(e.target.value); setPage(0); }}
        />
      </Card>

      <Card className="shadow-sm border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[150px]">Platform</TableHead>
              <TableHead className="w-[200px]">User Identifier</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="w-[100px]">Payload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading analytics...</TableCell>
              </TableRow>
            ) : !data || data.analytics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No records found.</TableCell>
              </TableRow>
            ) : (
              data.analytics.map(item => (
                <TableRow key={item.id} className="font-mono text-xs">
                  <TableCell className="text-muted-foreground">
                    {format(new Date(item.timestamp), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell className="font-medium">{item.platform}</TableCell>
                  <TableCell>{item.user_identifier}</TableCell>
                  <TableCell className="text-primary font-bold">{item.action_performed}</TableCell>
                  <TableCell>
                    {item.data_payload ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <FileJson className="h-4 w-4 text-primary" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Payload Data</DialogTitle>
                          </DialogHeader>
                          <div className="bg-slate-950 text-green-400 p-4 rounded-md overflow-auto max-h-[500px] font-mono text-sm whitespace-pre-wrap">
                            {JSON.stringify(item.data_payload, null, 2)}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
