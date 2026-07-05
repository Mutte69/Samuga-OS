import { useState } from "react";
import { useAnalyzeText } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BrainCircuit, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function AiAnalyzer() {
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<"summarize" | "classify" | "reply">("summarize");
  const [result, setResult] = useState<any>(null);

  const analyze = useAnalyzeText();

  const handleSubmit = () => {
    if (!text) {
      toast.error("Please enter text to analyze");
      return;
    }

    analyze.mutate({ data: { text, mode, context: context || undefined } }, {
      onSuccess: (data) => {
        setResult(data);
        toast.success("Analysis complete");
      },
      onError: () => {
        toast.error("Analysis failed");
      }
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-lg">
          <BrainCircuit className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Analyzer</h1>
          <p className="text-muted-foreground mt-1">Manual invocation of the orchestrator's ML models.</p>
        </div>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Input Data Stream</label>
            <Textarea 
              className="font-mono text-sm min-h-[200px]" 
              placeholder="Paste raw text, JSON, or logs here..."
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Analysis Mode</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={mode}
                onChange={e => setMode(e.target.value as any)}
              >
                <option value="summarize">Summarize (Structured Extract)</option>
                <option value="classify">Classify (Label & Tag)</option>
                <option value="reply">Smart Reply (Draft Response)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Context Vector (Optional)</label>
              <Input 
                placeholder="e.g. 'Customer travel query' or 'Python error log'"
                value={context}
                onChange={e => setContext(e.target.value)}
              />
            </div>
          </div>

          <Button 
            className="w-full h-12 text-lg font-bold" 
            onClick={handleSubmit}
            disabled={analyze.isPending}
          >
            {analyze.isPending ? (
              <span className="flex items-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Processing...</span>
            ) : (
              <span className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Execute Analysis</span>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-primary/50 shadow-lg shadow-primary/5">
          <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
            <CardTitle className="text-primary flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Analysis Result
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-950 prose-pre:text-green-400">
              <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed">
                {result.result}
              </div>
              
              {result.metadata && Object.keys(result.metadata).length > 0 && (
                <div className="mt-8 pt-6 border-t border-border">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Extracted Metadata</h4>
                  <pre className="bg-slate-950 text-green-400 p-4 rounded-md font-mono text-xs overflow-auto">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
