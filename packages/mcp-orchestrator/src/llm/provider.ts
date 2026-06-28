export interface LLMRequest {
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY ?? "";
    if (!this.apiKey) {
      console.error("[LLM] OPENROUTER_API_KEY not set — LLM calls will fail");
    }
  }

  get available(): boolean {
    return !!this.apiKey;
  }

  async chat(req: LLMRequest): Promise<{ content: string; model: string }> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY not configured");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/mmornati/ai-dispatch",
        "X-Title": "AI Dispatch",
      },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userMessage },
        ],
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
    };

    return {
      content: data.choices[0].message.content,
      model: data.model,
    };
  }
}
