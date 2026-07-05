import { useState } from "react";
import { useListApiKeys, useCreateApiKey, useDeleteApiKey, getListApiKeysQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Key, AlertTriangle, Copy } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ApiKeys() {
  const { data: keys, isLoading } = useListApiKeys({ query: { queryKey: getListApiKeysQueryKey() } } as any);
  const remove = useDeleteApiKey();
  const queryClient = useQueryClient();

  const handleDelete = (id: number) => {
    if (confirm("Revoke this API Key immediately? Systems using it will lose access.")) {
      remove.mutate({ id: id as any }, {
        onSuccess: () => {
          toast.success("API Key revoked");
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        }
      });
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage credentials for external data ingress.</p>
        </div>
        <NewKeyDialog />
      </div>

      <Card className="shadow-sm border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[250px]">Key Preview</TableHead>
              <TableHead className="w-[180px]">Created</TableHead>
              <TableHead className="w-[180px]">Last Used</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading keys...</TableCell>
              </TableRow>
            ) : !keys || keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No API Keys created.</TableCell>
              </TableRow>
            ) : (
              keys.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    {k.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm bg-slate-50 dark:bg-slate-900 rounded p-1 inline-block mt-3">
                    {k.keyPreview}••••••••
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(k.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {k.lastUsed ? format(new Date(k.lastUsed), "MMM d, HH:mm") : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(k.id)} disabled={remove.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function NewKeyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  
  const create = useCreateApiKey();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { name } }, {
      onSuccess: (data) => {
        setNewKey(data.key);
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setName("");
      }
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setOpen(false);
      setTimeout(() => setNewKey(null), 200); // clear after animation
    } else {
      setOpen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" /> Generate Key</Button>
      </DialogTrigger>
      <DialogContent>
        {newKey ? (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <AlertTriangle className="w-5 h-5 text-accent" />
                Store this key now
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This is the only time the full API key will be displayed. Please copy it now and store it securely.
            </p>
            <div className="bg-slate-950 text-green-400 p-4 rounded-md font-mono text-sm break-all relative">
              {newKey}
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 hover:bg-white/10 text-white"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button className="w-full" onClick={() => handleClose(false)}>I have stored the key securely</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle>Generate New API Key</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Key Name</label>
                <Input 
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="e.g. Production Data Bot" 
                />
                <p className="text-xs text-muted-foreground">Identify which system will use this key.</p>
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? "Generating..." : "Generate Key"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
