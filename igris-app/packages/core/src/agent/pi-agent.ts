// Pi agent wrapper — uses @earendil-works/pi-agent-core for single-agent reasoning.
// Configured to use Nebius (OpenAI-compatible) as the model backend.
//
// Pi handles: lightweight Q&A, simple tasks, fast single-turn reasoning.
// Heavy tasks (integrations, browser, long-running) go to Hive instead.
import { NebiusProvider } from '../model/nebius.js';

export interface PiAgentOptions {
  systemPrompt?: string;
}

export interface PiRunResult {
  content: string;
}

export class PiAgent {
  private readonly systemPrompt: string;

  constructor(opts: PiAgentOptions = {}) {
    this.systemPrompt =
      opts.systemPrompt ??
      'You are igris, a concise and helpful personal AI assistant. Answer clearly and briefly.';
  }

  async run(userMessage: string): Promise<PiRunResult> {
    const apiKey = process.env['NEBIUS_API_KEY'];
    if (!apiKey) {
      throw new Error('NEBIUS_API_KEY is required for Pi agent');
    }

    const baseURL =
      process.env['NEBIUS_BASE_URL'] ?? 'https://api.studio.nebius.ai/v1';
    const modelName =
      process.env['NEBIUS_MODEL'] ?? 'nvidia/llama-3.1-nemotron-70b-instruct';

    // 1. Try using @earendil-works/pi-agent-core
    try {
      const { Agent } = await import('@earendil-works/pi-agent-core');
      const { createModels } = await import('@earendil-works/pi-ai');
      // Nebius is OpenAI-API compatible — use the openai provider.
      // (Typed loosely: pi-ai's published types drift from its runtime.)
      const { openaiProvider } = (await import(
        '@earendil-works/pi-ai/providers/openai'
      )) as unknown as {
        openaiProvider: (opts: { apiKey: string; baseURL: string }) => unknown;
      };
      // The SDK's exact structural types drift between releases; pin only
      // the surface we use. Runtime behaviour is unchanged.
      const models = createModels() as unknown as {
        setProvider(provider: unknown): void;
        getModel(provider: string, model: string): object;
        streamSimple: (messages: unknown) => AsyncIterable<unknown>;
      };
      models.setProvider(openaiProvider({ apiKey, baseURL }));
      const model = models.getModel('openai', modelName);
      const agent = new Agent({
        initialState: {
          systemPrompt: this.systemPrompt,
          model,
        },
        streamFn: (messages: unknown) => models.streamSimple(messages),
      } as never);

      let result = '';
      agent.subscribe((event) => {
        const evt = event as {
          type: string;
          assistantMessageEvent?: {
            type: string;
            delta?: string;
            content?: string;
          };
        };
        if (evt.type !== 'message_update') return;
        const ae = evt.assistantMessageEvent;
        if (!ae) return;
        if (ae.type === 'text_delta' && ae.delta) {
          result += ae.delta;
        } else if (ae.type === 'text' && ae.content) {
          result = ae.content; // final consolidated text
        }
      });
      await (agent as { prompt(message: string): Promise<unknown> }).prompt(
        userMessage,
      );
      if (result) {
        return { content: result };
      }
    } catch (piErr) {
      console.warn(
        '[PiAgent] Pi package loop encountered error, falling back to direct Nebius execution:',
        piErr,
      );
    }

    // 2. Direct fallback to NebiusProvider if Pi agent library was unavailable
    const provider = new NebiusProvider({ apiKey, baseUrl: baseURL, model: modelName });
    const response = await provider.generate({
      systemPrompt: this.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return { content: response.content };
  }
}
