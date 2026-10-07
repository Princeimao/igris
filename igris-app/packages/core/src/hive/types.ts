// Hive adapter types — derived from observing Hive's actual HTTP API source.
// Hive routes: routes_execution.py, routes_queens.py, routes_sessions.py

export interface HiveSession {
  session_id: string;
  colony_id: string | null;
  has_worker: boolean;
  queen_phase: string;
  queen_id: string | null;
  queen_name: string | null;
  loaded_at: number;
}

export interface HiveClassifyResult {
  queen_id: string;
}

export interface HiveColonyClassifyResult {
  queen_id: string;
  colony_name: string;
  reason: string;
}

export interface AgentRuntime {
  run(task: AgentTask): Promise<AgentResult>;
  status(id: string): Promise<AgentStatus>;
  cancel(id: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface AgentTask {
  id: string;
  prompt: string;
  /** Prefer Hive colony (parallel workers) for this task */
  useColony?: boolean;
  /** Pin to a specific queen by id */
  queenId?: string;
  /** Reuse an existing session */
  sessionId?: string;
}

export interface AgentResult {
  id: string;
  content: string;
  status: 'completed' | 'failed';
  error?: string;
}

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface HiveSSEEvent {
  type: string;
  data: Record<string, unknown>;
}
