import { useState } from "react";
import { useListConfigs, useUpsertConfig, useDeleteConfig, usePushConfig, getListConfigsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Send, Save, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Configs() {
  const { data: configs, isLoading } = useListConfigs({ query: { queryKey: getListConfigsQueryKey() } } as any);
  
  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Remote Configurations</h1>
          <p className="text-muted-foreground mt-1">Control variables sent to external bots and platform webhooks.</p>
        </div>
        <NewConfigDialog />
      </div>

      <Card className="shadow-sm border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Webhook URL</TableHead>
              <TableHead className="w-[180px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading configurations...</TableCell>
              </TableRow>
            ) : !configs || configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No configurations set.</TableCell>
              </TableRow>
            ) : (
              configs.map(config => <ConfigRow key={config.id} config={config} />)
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ConfigRow({ config }: { config: any }) {
  const [value, setValue] = useState(config.value);
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();
  
  const upsert = useUpsertConfig();
  const remove = useDeleteConfig();
  const push = usePushConfig();

  const handleSave = () => {
    upsert.mutate({ data: { key: config.key, value, description: config.description, webhook_url: config.webhook_url } }, {
      onSuccess: () => {
        toast.success("Configuration updated");
        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: getListConfigsQueryKey() });
      }
    });
  };

  const handlePush = () => {
    if (!config.webhook_url) {
      toast.error("No webhook URL configured for this key.");
      return;
    }
    push.mutate({ key: config.key }, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success("Push successful", { description: result.message || `Status: ${result.statusCode}` });
        } else {
          toast.error("Push failed", { description: result.message || `Status: ${result.statusCode}` });
        }
      },
      onError: (err: any) => {
        toast.error("Push failed", { description: err?.response?.data?.error || err.message });
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this config?")) {
      remove.mutate({ key: config.key }, {
        onSuccess: () => {
          toast.success("Configuration deleted");
          queryClient.invalidateQueries({ queryKey: getListConfigsQueryKey() });
        }
      });
    }
  };

  return (
    <TableRow className="font-mono text-sm">
      <TableCell className="font-bold text-primary">{config.key}</TableCell>
      <TableCell>
        {isEditing ? (
          <Input 
            value={value} 
            onChange={e => setValue(e.target.value)} 
            className="h-8 font-mono text-sm"
          />
        ) : (
          <span className="cursor-pointer border-b border-dashed border-transparent hover:border-muted-foreground" onClick={() => setIsEditing(true)}>
            {value}
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">{config.description}</TableCell>
      <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]" title={config.webhook_url}>
        {config.webhook_url || '-'}
      </TableCell>
      <TableCell className="text-right space-x-2">
        {isEditing ? (
          <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
            <Save className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handlePush} disabled={push.isPending || !config.webhook_url} title="Push to Webhook">
            {push.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        )}
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function NewConfigDialog() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  
  const upsert = useUpsertConfig();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate({ data: { key, value, description, webhook_url: webhookUrl } }, {
      onSuccess: () => {
        toast.success("Configuration created");
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListConfigsQueryKey() });
        setKey(""); setValue(""); setDescription(""); setWebhookUrl("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" /> Add Config</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Configuration</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Key</label>
            <Input required font-mono value={key} onChange={e => setKey(e.target.value)} placeholder="e.g. BOT_ACTIVE" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Value</label>
            <Input required font-mono value={value} onChange={e => setValue(e.target.value)} placeholder="true" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this control?" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Webhook URL (Optional)</label>
            <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button type="submit" className="w-full" disabled={upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
