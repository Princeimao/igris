// Execution router — decides whether a task goes to Pi or Hive.
//
// Pi  → quick Q&A, simple reasoning, fast single-turn tasks
// Hive → integrations (Telegram, Slack, email), multi-step, browser, scheduling
//
// Hive has built-in MCP connectors for external services, so integrations
// always go there — Pi doesn't need to handle those.
import type { HiveAdapter } from '../hive/adapter.js';
import type { AgentResult } from '../hive/types.js';
import type { PiAgent } from './pi-agent.js';

export type RouteDecision = 'pi' | 'hive';

export interface RoutingContext {
  prompt: string;
  /** Force a specific route, bypassing keyword analysis */
  explicitRoute?: RouteDecision;
  /** Hint: task involves long-running or parallel work */
  isLongRunning?: boolean;
  /** Hint: task needs browser access */
  requiresBrowser?: boolean;
}

// Keywords that indicate an external integration → route to Hive
const INTEGRATION_KEYWORDS = [
  'telegram', 'slack', 'discord', 'whatsapp',
  'email', 'gmail', 'send email', 'send message',
  'calendar', 'google calendar', 'notion',
  'github', 'jira', 'linear', 'trello',
  'post to', 'webhook', 'integrate', 'integration',
  'twitter', 'x.com', 'linkedin',
];

// Keywords that suggest heavy / long-running work → route to Hive
const HEAVY_TASK_KEYWORDS = [
  'research', 'scrape', 'browse the web', 'search the web',
  'automate', 'schedule', 'every day', 'every hour', 'every week',
  'monitor', 'watch for', 'alert me when', 'keep an eye',
  'download', 'upload', 'extract', 'summarize multiple',
];

export function decideRoute(ctx: RoutingContext): RouteDecision {
  if (ctx.explicitRoute) return ctx.explicitRoute;
  if (ctx.isLongRunning || ctx.requiresBrowser) return 'hive';
  const lower = ctx.prompt.toLowerCase();
  if (INTEGRATION_KEYWORDS.some((kw) => lower.includes(kw))) return 'hive';
  if (HEAVY_TASK_KEYWORDS.some((kw) => lower.includes(kw))) return 'hive';
  return 'pi';
}

export interface RouterOptions {
  hive: HiveAdapter;
  pi: PiAgent;
}

export class ExecutionRouter {
  private readonly hive: HiveAdapter;
  private readonly pi: PiAgent;

  constructor(opts: RouterOptions) {
    this.hive = opts.hive;
    this.pi = opts.pi;
  }

  async execute(
    ctx: RoutingContext,
  ): Promise<AgentResult & { route: RouteDecision }> {
    const route = decideRoute(ctx);
    if (route === 'pi') {
      try {
        const result = await this.pi.run(ctx.prompt);
        return {
          id: crypto.randomUUID(),
          content: result.content,
          status: 'completed',
          route,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        // Pi failed — attempt fallback to Hive
        console.warn('[router] Pi agent failed, falling back to Hive:', error);
        return this.runOnHive(ctx, 'hive');
      }
    }
    return this.runOnHive(ctx, route);
  }

  private async runOnHive(
    ctx: RoutingContext,
    route: RouteDecision,
  ): Promise<AgentResult & { route: RouteDecision }> {
    const task = {
      id: crypto.randomUUID(),
      prompt: ctx.prompt,
      useColony: ctx.isLongRunning ?? false,
    };
    const result = await this.hive.run(task);
    return { ...result, route };
  }
}
