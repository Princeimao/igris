// CogneeMemoryStore — @cognee/cognee-ts backed MemoryStore.
//
// Local-first wiring:
//   LLM:        Gemini via Google's OpenAI-compatible endpoint
//               (GEMINI_API_KEY, COGNEE_LLM_MODEL, default gemini-2.5-flash)
//   Embeddings: local Ollama nomic-embed-text (full-path endpoint, 768 dims)
//   Stores:     local LanceDB + kuzu files under ~/.igris/cognee
//   Telemetry:  disabled. Rust logs: errors only.
//
// Data flow honesty: memory text transits Google's API for graph extraction
// and answer synthesis; vectors + graph files never leave this machine.
// Datasets are namespaced per memory type: igris-personal, igris-project,
// igris-agent. A small local index (~/.igris/cognee-index.json) maps our
// Memory ids for list/update/delete.
//
// Failure contract: constructor throws a clear error when GEMINI_API_KEY is
// missing (the factory falls back to JSON). Runtime cognee failures degrade
// to the local index — never throws outwards.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  Memory,
  MemoryAddOptions,
  MemoryStore,
  MemoryType,
  MemoryUpdateOptions,
} from './memory.js';

const DEFAULT_DATA_DIR = join(homedir(), '.igris', 'cognee');
const DEFAULT_INDEX_PATH = join(homedir(), '.igris', 'cognee-index.json');

const DATASETS: Record<MemoryType, string> = {
  personal: 'igris-personal',
  project: 'igris-project',
  agent: 'igris-agent',
};

interface IndexEntry {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  projectId?: string | undefined;
  agentId?: string | undefined;
  createdAt: string;
  updatedAt: string;
  dataId?: string | undefined;
  dataset?: string | undefined;
}

let sdkInitDone = false;

function ensureEnv(name: string, value: string): void {
  if (!process.env[name]) process.env[name] = value;
}

function readDataId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const rec = result as Record<string, unknown>;
  const candidates: unknown[] = [
    rec['dataId'],
    rec['data_id'],
    (rec['items'] as Array<Record<string, unknown>> | undefined)?.[0]?.['dataId'],
    (rec['items'] as Array<Record<string, unknown>> | undefined)?.[0]?.['data_id'],
    (rec['dataIds'] as unknown[] | undefined)?.[0],
    (rec['data_ids'] as unknown[] | undefined)?.[0],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

export class CogneeMemoryStore implements MemoryStore {
  private readonly dataDir: string;
  private readonly indexPath: string;
  private readonly llmModel: string;
  private readonly llmApiKey: string;
  private index: Map<string, IndexEntry> = new Map();
  private client: import('@cognee/cognee-ts').Cognee | null = null;
  private ready: Promise<void> | null = null;
  /** Serializes mutating pipeline calls: Cognee rejects concurrent cognify
   * runs on the same dataset, and chats can arrive faster than ingestion. */
  private writeQueue: Promise<void> = Promise.resolve();

  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  constructor(dataDir?: string, indexPath?: string) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is required for the Cognee memory backend. ' +
          'Set it in your .env, or use MEMORY_BACKEND=json.',
      );
    }
    this.llmApiKey = apiKey;
    this.llmModel = process.env['COGNEE_LLM_MODEL'] ?? 'gemini-2.5-flash';
    this.dataDir = dataDir ?? process.env['COGNEE_DATA_DIR'] ?? DEFAULT_DATA_DIR;
    this.indexPath = indexPath ?? DEFAULT_INDEX_PATH;
    mkdirSync(this.dataDir, { recursive: true });
    mkdirSync(join(this.indexPath, '..'), { recursive: true });
    this.loadIndex();
  }

  private loadIndex(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const items = JSON.parse(readFileSync(this.indexPath, 'utf-8')) as IndexEntry[];
      for (const item of items) this.index.set(item.id, item);
    } catch (err) {
      console.warn('[CogneeMemory] Failed to parse index, starting empty:', err);
    }
  }

  private saveIndex(): void {
    try {
      writeFileSync(
        this.indexPath,
        JSON.stringify(Array.from(this.index.values()), null, 2),
        'utf-8',
      );
    } catch (err) {
      console.error('[CogneeMemory] Failed to write index:', err);
    }
  }

  private entryToMemory(e: IndexEntry): Memory {
    return {
      id: e.id,
      type: e.type,
      content: e.content,
      tags: e.tags,
      projectId: e.projectId,
      agentId: e.agentId,
      createdAt: new Date(e.createdAt),
      updatedAt: new Date(e.updatedAt),
    };
  }

  private async ensureClient(): Promise<import('@cognee/cognee-ts').Cognee> {
    if (this.client) return this.client;
    if (!this.ready) {
      this.ready = (async () => {
        // Local-first SDK wiring. Set only when unset — explicit env wins.
        ensureEnv(
          'OPENAI_URL',
          'https://generativelanguage.googleapis.com/v1beta/openai/',
        );
        ensureEnv('OPENAI_TOKEN', this.llmApiKey);
        ensureEnv('OPENAI_MODEL', this.llmModel);
        ensureEnv('EMBEDDING_PROVIDER', 'ollama');
        ensureEnv('EMBEDDING_MODEL', 'nomic-embed-text');
        ensureEnv(
          'EMBEDDING_ENDPOINT',
          'http://localhost:11434/v1/embeddings',
        );
        ensureEnv('EMBEDDING_DIMENSIONS', '768');
        ensureEnv('TELEMETRY_DISABLED', '1');
        ensureEnv('RUST_LOG', 'error');
        ensureEnv('LOG_LEVEL', 'error');

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { init, Cognee } = await import('@cognee/cognee-ts');
        if (!sdkInitDone) {
          init();
          sdkInitDone = true;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.client = new Cognee({
          llmModel: this.llmModel,
          llmApiKey: this.llmApiKey,
          dataRootDirectory: this.dataDir,
        });
        await this.client.warm();
      })();
    }
    await this.ready;
    const client = this.client;
    if (!client) throw new Error('Cognee client failed to initialize');
    return client;
  }

  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  async add(
    type: MemoryType,
    content: string,
    opts: MemoryAddOptions = {},
  ): Promise<Memory> {
    const now = new Date();
    const entry: IndexEntry = {
      id: crypto.randomUUID(),
      type,
      content,
      tags: opts.tags ?? [],
      projectId: opts.projectId,
      agentId: opts.agentId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.index.set(entry.id, entry);
    this.saveIndex();

    // Graph ingestion runs in the background: the memory is usable from the
    // local index immediately; the knowledge graph enriches when ready.
    void (async () => {
      try {
        const client = await this.ensureClient();
        const result = await this.mutate(() =>
          this.withTimeout(
            client.remember(
              { type: 'text', text: content },
              DATASETS[type],
            ),
            90000,
            'cognee remember',
          ),
        );
        const dataId = readDataId(result);
        const current = this.index.get(entry.id);
        if (!current) return;
        if (dataId) {
          current.dataId = dataId;
          current.dataset = DATASETS[type];
          this.saveIndex();
        }
      } catch (err) {
        console.warn('[CogneeMemory] Background ingest failed:', err);
      }
    })();

    return this.entryToMemory(entry);
  }

  async search(query: string, type?: MemoryType): Promise<Memory[]> {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

    // Local index keyword scan (always available).
    const keywordHits: Memory[] = [];
    for (const e of this.index.values()) {
      if (type && e.type !== type) continue;
      if (!terms.length) {
        keywordHits.push(this.entryToMemory(e));
        continue;
      }
      const contentLower = e.content.toLowerCase();
      const tagsLower = e.tags.map((t) => t.toLowerCase()).join(' ');
      let score = 0;
      for (const term of terms) {
        if (contentLower.includes(term)) score += 2;
        if (tagsLower.includes(term)) score += 3;
      }
      if (score > 0) keywordHits.push(this.entryToMemory(e));
    }

    // Graph recall (guarded by timeout; failures fall through silently).
    const graphHits: Memory[] = [];
    try {
      const client = await this.ensureClient();
      const result = await this.withTimeout(
        client.recall(query, { scope: 'graph' }),
        20000,
        'cognee recall',
      );
      const items = (result?.items ?? []) as Array<{
        content?: unknown;
        dataId?: unknown;
        data_id?: unknown;
      }>;
      for (const item of items) {
        const content = typeof item.content === 'string' ? item.content : null;
        if (!content) continue;
        const dataId =
          typeof item.dataId === 'string'
            ? item.dataId
            : typeof item.data_id === 'string'
              ? item.data_id
              : null;
        const matched = dataId
          ? Array.from(this.index.values()).find((e) => e.dataId === dataId)
          : Array.from(this.index.values()).find((e) => e.content === content);
        if (matched && (!type || matched.type === type)) {
          graphHits.push(this.entryToMemory(matched));
        } else if (!type || true) {
          graphHits.push({
            id: dataId ?? crypto.randomUUID(),
            type: type ?? 'agent',
            content,
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    } catch {
      // graph unavailable — keyword hits below still answer
    }

    // Graph hits first, then keyword-only hits, deduped, capped.
    const seen = new Set<string>();
    const merged: Memory[] = [];
    for (const m of [...graphHits, ...keywordHits]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
      if (merged.length >= 20) break;
    }
    if (merged.length === 0) {
      return Array.from(this.index.values())
        .filter((e) => !type || e.type === type)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .slice(0, 5)
        .map((e) => this.entryToMemory(e));
    }
    return merged;
  }

  async list(type?: MemoryType, projectId?: string): Promise<Memory[]> {
    return Array.from(this.index.values())
      .filter(
        (e) =>
          (!type || e.type === type) &&
          (!projectId || e.projectId === projectId),
      )
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 100)
      .map((e) => this.entryToMemory(e));
  }

  async delete(id: string): Promise<void> {
    const entry = this.index.get(id);
    this.index.delete(id);
    this.saveIndex();
    if (!entry?.dataId || !entry.dataset) return;
    const dataId = entry.dataId;
    const dataset = entry.dataset;
    try {
      const client = await this.ensureClient();
      await this.mutate(() =>
        this.withTimeout(
          client.forget({
            kind: 'item',
            dataId,
            dataset: { name: dataset },
          }),
          20000,
          'cognee forget',
        ),
      );
    } catch (err) {
      console.warn('[CogneeMemory] Graph forget failed (index entry removed):', err);
    }
  }

  async update(
    id: string,
    opts: import('./memory.js').MemoryUpdateOptions,
  ): Promise<Memory | null> {
    const entry = this.index.get(id);
    if (!entry) return null;
    const content = opts.content ?? entry.content;
    const dataset = DATASETS[entry.type];
    const updated: IndexEntry = {
      ...entry,
      content,
      tags: opts.tags ?? entry.tags,
      updatedAt: new Date().toISOString(),
    };
    try {
      const client = await this.ensureClient();
      if (entry.dataId) {
        await this.mutate(() =>
          this.withTimeout(
            client.update(
              entry.dataId as string,
              { type: 'text', text: content },
              dataset,
            ),
            30000,
            'cognee update',
          ),
        );
      } else {
        const result = await this.mutate(() =>
          this.withTimeout(
            client.remember({ type: 'text', text: content }, dataset),
            90000,
            'cognee remember',
          ),
        );
        const dataId = readDataId(result);
        if (dataId) {
          updated.dataId = dataId;
          updated.dataset = dataset;
        }
      }
    } catch (err) {
      console.warn('[CogneeMemory] Graph update failed (index updated):', err);
    }
    this.index.set(id, updated);
    this.saveIndex();
    return this.entryToMemory(updated);
  }

  async close(): Promise<void> {
    this.saveIndex();
  }
}
