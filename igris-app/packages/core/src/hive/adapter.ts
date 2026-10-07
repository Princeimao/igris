// HiveAdapter — communicates with the local Hive Python runtime via its HTTP API.
// Hive must be running separately (./hive open or hive.ps1).
// We talk to it through supported interfaces only — no rewriting Hive internals.
//
// API endpoints (verified from Hive source):
//   POST /api/messages/classify              → { queen_id }
//   POST /api/messages/classify-colony       → { queen_id, colony_name, reason }
//   POST /api/queen/{queen_id}/session       → { session_id, ... }
//   POST /api/sessions/{session_id}/chat     → sends message to queen (routes_execution.py)
//   GET  /api/sessions/{session_id}/events   → SSE stream of agent events
//   GET  /api/sessions                       → list sessions (used as health check)
//   DELETE /api/sessions/{session_id}        → stop session
import type {
  AgentResult,
  AgentRuntime,
  AgentStatus,
  AgentTask,
  HiveColonyClassifyResult,
  HiveSSEEvent,
} from './types.js';

const EXECUTION_DONE_EVENTS = new Set([
  'EXECUTION_COMPLETED',
  'EXECUTION_FAILED',
]);

const SSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface HiveAdapterOptions {
  baseUrl?: string;
}

export class HiveAdapter implements AgentRuntime {
  private readonly baseUrl: string;

  constructor(opts: HiveAdapterOptions = {}) {
    this.baseUrl = (
      opts.baseUrl ??
      process.env['HIVE_BASE_URL'] ??
      'http://localhost:8889'
    ).replace(/\/$/, '');
  }

  // ── Public AgentRuntime interface ────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async run(task: AgentTask): Promise<AgentResult> {
    try {
      // 1. Reuse existing session OR create a new one
      const sessionId = task.sessionId ?? (await this.createSession(task));
      // 2. Subscribe to SSE before sending the message (avoid race)
      const resultPromise = this.waitForResult(sessionId, task.id);
      // 3. Send the message
      await this.sendChat(sessionId, task.prompt);
      // 4. Wait for EXECUTION_COMPLETED / EXECUTION_FAILED
      return await resultPromise;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { id: task.id, content: '', status: 'failed', error };
    }
  }

  async status(sessionId: string): Promise<AgentStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`);
      if (!res.ok) return 'failed';
      const data = (await res.json()) as { queen_phase?: string };
      const phase = data.queen_phase;
      if (phase === 'planning' || phase === 'staging') return 'running';
      return 'completed';
    } catch {
      return 'failed';
    }
  }

  async cancel(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async classify(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/messages/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });
    if (!res.ok) throw new Error(`Hive classify failed: ${res.status}`);
    const data = (await res.json()) as { queen_id: string };
    return data.queen_id;
  }

  private async classifyColony(
    prompt: string,
  ): Promise<HiveColonyClassifyResult> {
    const res = await fetch(`${this.baseUrl}/api/messages/classify-colony`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });
    if (!res.ok)
      throw new Error(`Hive classify-colony failed: ${res.status}`);
    return (await res.json()) as HiveColonyClassifyResult;
  }

  private async createSession(task: AgentTask): Promise<string> {
    const queenId =
      task.queenId ??
      (task.useColony
        ? (await this.classifyColony(task.prompt)).queen_id
        : await this.classify(task.prompt));
    const res = await fetch(
      `${this.baseUrl}/api/queen/${encodeURIComponent(queenId)}/session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) throw new Error(`Hive create session failed: ${res.status}`);
    const data = (await res.json()) as { session_id: string };
    return data.session_id;
  }

  private async sendChat(sessionId: string, message: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Hive chat failed: ${res.status} ${text}`);
    }
  }

  /**
   * Opens the SSE stream for a session and resolves when Hive emits
   * EXECUTION_COMPLETED or EXECUTION_FAILED. Times out after SSE_TIMEOUT_MS.
   */
  private waitForResult(
    sessionId: string,
    taskId: string,
  ): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Hive SSE timed out'));
      }, SSE_TIMEOUT_MS);
      const cleanup = () => clearTimeout(timer);

      fetch(
        `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/events`,
        { signal: controller.signal },
      )
        .then(async (res) => {
          if (!res.ok || !res.body) {
            cleanup();
            reject(new Error(`Hive SSE stream failed: ${res.status}`));
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let lastContent = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const raw = line.slice(5).trim();
                if (!raw || raw === '[DONE]') continue;
                let event: HiveSSEEvent;
                try {
                  event = JSON.parse(raw) as HiveSSEEvent;
                } catch {
                  continue;
                }
                // Capture text output as it streams
                if (
                  event.type === 'LLM_TEXT_DELTA' &&
                  typeof event.data['delta'] === 'string'
                ) {
                  lastContent += event.data['delta'];
                }
                if (
                  event.type === 'CLIENT_OUTPUT_DELTA' &&
                  typeof event.data['delta'] === 'string'
                ) {
                  lastContent += event.data['delta'];
                }
                if (EXECUTION_DONE_EVENTS.has(event.type)) {
                  cleanup();
                  controller.abort();
                  if (event.type === 'EXECUTION_COMPLETED') {
                    const output =
                      typeof event.data['output'] === 'string'
                        ? (event.data['output'] as string)
                        : lastContent;
                    resolve({
                      id: taskId,
                      content: output,
                      status: 'completed',
                    });
                  } else {
                    const error =
                      typeof event.data['error'] === 'string'
                        ? (event.data['error'] as string)
                        : 'Execution failed';
                    resolve({
                      id: taskId,
                      content: lastContent,
                      status: 'failed',
                      error,
                    });
                  }
                  return;
                }
              }
            }
            // Stream ended without a done event — return whatever we collected
            cleanup();
            resolve({ id: taskId, content: lastContent, status: 'completed' });
          } catch (err) {
            cleanup();
            if (err instanceof Error && err.name === 'AbortError') return;
            reject(err);
          }
        })
        .catch((err: unknown) => {
          cleanup();
          if (err instanceof Error && err.name !== 'AbortError') reject(err);
        });
    });
  }
}
