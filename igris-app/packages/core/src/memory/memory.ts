// Persistent file-backed memory store — personal, project, and agent memory.
// Zero native C++ compilation dependencies (avoids node-gyp / electron-rebuild issues on Windows).
// Keyword search ships today; GraphMemoryStore (graph.ts) adds entities/relations
// plus vector search on top of the same MemoryStore interface.
//
// Three memory types (from claude.md):
//   personal — preferences, long-term facts about the user
//   project  — architecture decisions, tasks, agent history per project
//   agent    — session logs, tool calls, file changes, errors

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_STORE_DIR = join(homedir(), '.igris');
const DEFAULT_STORE_PATH = join(DEFAULT_STORE_DIR, 'memory.json');

export type MemoryType = 'personal' | 'project' | 'agent';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  projectId?: string | undefined;
  agentId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryAddOptions {
  tags?: string[] | undefined;
  projectId?: string | undefined;
  agentId?: string | undefined;
}

export interface MemoryUpdateOptions {
  content?: string | undefined;
  tags?: string[] | undefined;
}

// All methods are async: network providers (Cognee, Mem0, cloud sync) cannot
// answer synchronously. `await` transparently handles sync implementations.
export interface MemoryStore {
  add(
    type: MemoryType,
    content: string,
    opts?: MemoryAddOptions,
  ): Promise<Memory>;
  update(id: string, opts: MemoryUpdateOptions): Promise<Memory | null>;
  search(query: string, type?: MemoryType): Promise<Memory[]>;
  list(type?: MemoryType, projectId?: string): Promise<Memory[]>;
  delete(id: string): Promise<void>;
  close(): Promise<void>;
}

interface SerializedMemory {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  projectId?: string | undefined;
  agentId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export class PersistentMemoryStore implements MemoryStore {
  private readonly filePath: string;
  private memories: Map<string, Memory> = new Map();

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_STORE_PATH;
    const dir = join(this.filePath, '..');
    mkdirSync(dir, { recursive: true });
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const items = JSON.parse(raw) as SerializedMemory[];
      for (const item of items) {
        this.memories.set(item.id, {
          ...item,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        });
      }
    } catch (err) {
      console.warn('[MemoryStore] Failed to parse existing memory file, initializing empty store:', err);
    }
  }

  private save(): void {
    try {
      const items: SerializedMemory[] = Array.from(this.memories.values()).map(m => ({
        id: m.id,
        type: m.type,
        content: m.content,
        tags: m.tags,
        projectId: m.projectId,
        agentId: m.agentId,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }));
      writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MemoryStore] Failed to write memory file:', err);
    }
  }

  async add(
    type: MemoryType,
    content: string,
    opts: MemoryAddOptions = {},
  ): Promise<Memory> {
    const id = crypto.randomUUID();
    const now = new Date();
    const memory: Memory = {
      id,
      type,
      content,
      tags: opts.tags ?? [],
      projectId: opts.projectId,
      agentId: opts.agentId,
      createdAt: now,
      updatedAt: now,
    };
    this.memories.set(id, memory);
    this.save();
    return memory;
  }

  async search(query: string, type?: MemoryType): Promise<Memory[]> {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      return this.list(type);
    }

    const results: Array<{ memory: Memory; score: number }> = [];

    for (const memory of this.memories.values()) {
      if (type && memory.type !== type) {
        continue;
      }

      const contentLower = memory.content.toLowerCase();
      const tagsLower = memory.tags.map(t => t.toLowerCase()).join(' ');
      let score = 0;

      for (const term of terms) {
        if (contentLower.includes(term)) {
          score += 2;
        }
        if (tagsLower.includes(term)) {
          score += 3;
        }
      }

      if (score > 0) {
        results.push({ memory, score });
      }
    }

    results.sort((a, b) => b.score - a.score || b.memory.updatedAt.getTime() - a.memory.updatedAt.getTime());
    return results.slice(0, 20).map(r => r.memory);
  }

  async list(type?: MemoryType, projectId?: string): Promise<Memory[]> {
    const list: Memory[] = [];
    for (const memory of this.memories.values()) {
      if (type && memory.type !== type) continue;
      if (projectId && memory.projectId !== projectId) continue;
      list.push(memory);
    }
    list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return list.slice(0, 100);
  }

  async delete(id: string): Promise<void> {
    if (this.memories.delete(id)) {
      this.save();
    }
  }

  async update(id: string, opts: MemoryUpdateOptions): Promise<Memory | null> {
    const existing = this.memories.get(id);
    if (!existing) return null;
    const updated: Memory = {
      ...existing,
      content: opts.content ?? existing.content,
      tags: opts.tags ?? existing.tags,
      updatedAt: new Date(),
    };
    this.memories.set(id, updated);
    this.save();
    return updated;
  }

  async close(): Promise<void> {
    this.save();
  }
}

// Backwards-compatible alias. NOTE: this was never SQLite — it is a JSON
// file store. New code should import PersistentMemoryStore (or a provider
// like GraphMemoryStore) directly.
// @deprecated Use PersistentMemoryStore.
export const SqliteMemoryStore = PersistentMemoryStore;

/**
 * Backend selection. `MEMORY_BACKEND=cognee` (default) uses the official
 * Cognee TS SDK: Gemini for extraction, local Ollama embeddings, local
 * LanceDB/kuzu files — the graph lives in this app. Falls back to the JSON
 * file store with a warning when unavailable (e.g. missing GEMINI_API_KEY).
 * `MEMORY_BACKEND=json` forces the plain file store.
 */
export async function createMemoryStore(
  dbPath?: string,
): Promise<MemoryStore> {
  const backend = (process.env.MEMORY_BACKEND ?? 'cognee').toLowerCase();
  if (backend === 'cognee') {
    try {
      const { CogneeMemoryStore } = await import('./cognee.js');
      // Constructor validates env synchronously (throws without API key).
      return new CogneeMemoryStore();
    } catch (err) {
      console.warn(
        '[Memory] Cognee backend unavailable, falling back to JSON file store:',
        err,
      );
    }
  }
  return new PersistentMemoryStore(dbPath);
}
