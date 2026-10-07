// Nebius Token Factory + NVIDIA Nemotron implementation of ModelProvider.
// Nebius exposes an OpenAI-compatible REST API, so we use plain fetch.
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from './provider.js';

const DEFAULT_BASE_URL = 'https://api.studio.nebius.ai/v1';
const DEFAULT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

interface NebiusOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class NebiusProvider implements ModelProvider {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: NebiusOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env['NEBIUS_API_KEY'] ?? '';
    this.baseUrl = opts.baseUrl ?? process.env['NEBIUS_BASE_URL'] ?? DEFAULT_BASE_URL;
    this.modelId = opts.model ?? process.env['NEBIUS_MODEL'] ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      throw new Error(
        'NEBIUS_API_KEY is required. Set it in your .env file or pass opts.apiKey.',
      );
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const messages = [...request.messages];
    if (request.systemPrompt) {
      messages.unshift({ role: 'system', content: request.systemPrompt });
    }
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Nebius API error ${response.status}: ${text}`);
    }
    const data = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices[0]?.message.content ?? '';
    return {
      content,
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }
}

export function createDefaultProvider(): ModelProvider {
  return new NebiusProvider();
}
