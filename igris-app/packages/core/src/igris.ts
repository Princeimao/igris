// IgrisCore — the central runtime.
// Owns: user interaction, memory, intent routing, agent delegation.
// Does NOT own: agent orchestration (Hive), model inference (Nebius), UI (desktop).

import { ExecutionRouter, type RoutingContext } from "./agent/router.js";
import { PiAgent } from "./agent/pi-agent.js";
import { HiveAdapter } from "./hive/adapter.js";
import type { AgentResult } from "./hive/types.js";
import { PersistentMemoryStore, createMemoryStore } from "./memory/memory.js";
import type { MemoryStore } from "./memory/memory.js";
import type { RouteDecision } from "./agent/router.js";

export interface IgrisCoreOptions {
  hiveBaseUrl?: string;
  memoryDbPath?: string;
  piSystemPrompt?: string;
}

export interface ChatResult extends AgentResult {
  route: RouteDecision;
}

export { PersistentMemoryStore };

export class IgrisCore {
  readonly memory: MemoryStore;
  private readonly router: ExecutionRouter;
  private readonly hive: HiveAdapter;

  /**
   * Preferred construction: resolves the configured memory backend
   * (`MEMORY_BACKEND=json|graph`, default `json`) with graceful fallback.
   * Never throws for missing env — Hive/Pi degrade at call time with
   * clear errors instead of crashing the host process.
   */
  static async create(opts: IgrisCoreOptions = {}): Promise<IgrisCore> {
    const core = new IgrisCore(opts, await createMemoryStore(opts.memoryDbPath));
    return core;
  }

  constructor(opts: IgrisCoreOptions = {}, memory?: MemoryStore) {
    const hiveBaseUrl =
      opts.hiveBaseUrl ?? process.env.HIVE_BASE_URL ?? "http://localhost:8889";
    this.hive = new HiveAdapter({ baseUrl: hiveBaseUrl });

    this.router = new ExecutionRouter({
      hive: this.hive,
      // PiAgent has its own default prompt; only pass ours when configured
      // (exactOptionalPropertyTypes forbids explicit undefined).
      pi: new PiAgent(
        opts.piSystemPrompt ? { systemPrompt: opts.piSystemPrompt } : {},
      ),
    });

    this.memory = memory ?? new PersistentMemoryStore(opts.memoryDbPath);
  }

  /**
   * Main entry point. Accepts a text prompt (from voice or text input),
   * recalls relevant memories into context, routes to Pi or Hive, records
   * the exchange, and returns the result. Recall is best-effort: a memory
   * failure never fails the chat.
   */
  async chat(
    prompt: string,
    ctx?: Partial<RoutingContext>,
  ): Promise<ChatResult> {
    let routedPrompt = prompt;
    try {
      const recalled = await this.memory.search(prompt);
      const useful = recalled
        .filter((m) => m.content.trim().length > 0)
        .slice(0, 6);
      if (useful.length > 0) {
        const block = useful
          .map((m) => `- [${m.type}] ${m.content}`)
          .join("\n")
          .slice(0, 2000);
        routedPrompt = `Relevant memories:\n${block}\n\nUser: ${prompt}`;
      }
    } catch (err) {
      console.warn("[IgrisCore] Memory recall failed, continuing without:", err);
    }

    const result = await this.router.execute({ prompt: routedPrompt, ...ctx });

    // Record agent memory — only factual observed output, no fabrication
    try {
      await this.memory.add(
        "agent",
        `User: ${prompt}\nIgris (${result.route}): ${result.content}`,
        { agentId: result.id },
      );
    } catch (err) {
      console.warn("[IgrisCore] Memory write failed:", err);
    }

    return result;
  }

  async isHiveAvailable(): Promise<boolean> {
    return this.hive.isAvailable();
  }

  dispose(): void {
    void this.memory.close();
  }
}
