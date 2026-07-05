import { Router, type IRouter } from "express";
import { AnalyzeTextBody } from "@workspace/api-zod";
import { requireAdminSession } from "../middlewares/session-auth";

const router: IRouter = Router();

router.post("/v1/ai/analyze", requireAdminSession, async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI engine not configured. Please set OPENAI_API_KEY in environment secrets." });
    return;
  }

  const parsed = AnalyzeTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, mode, context } = parsed.data;

  const systemPrompts: Record<string, string> = {
    summarize: "You are a data analyst. Produce a concise, structured summary of the provided text. Use bullet points for key insights. Respond only with the summary.",
    classify: "You are a text classifier. Classify the provided text by returning a JSON object with fields: label (string), tags (string[]), sentiment (positive|neutral|negative), confidence (0-1). Respond with only the JSON.",
    reply: "You are an AI assistant. Draft a concise, professional smart reply to the provided text. Respond with only the reply draft.",
  };

  const systemPrompt = systemPrompts[mode] ?? systemPrompts.summarize;
  const userMessage = context ? `Context: ${context}\n\nText to analyze:\n${text}` : text;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      res.status(502).json({ error: `OpenAI API error: ${response.status} ${errBody}` });
      return;
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const result = data.choices[0]?.message?.content ?? "";

    res.json({ mode, result, metadata: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    res.status(502).json({ error: message });
  }
});

export default router;
