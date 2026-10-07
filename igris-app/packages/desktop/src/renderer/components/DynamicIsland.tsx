// Backward-compatible re-export: existing imports of
// "./components/DynamicIsland" keep working after the modular split.
export { DynamicIsland } from "./island/DynamicIsland";
export type {
  ChatResult,
  InteractionMode,
  IslandPhase,
  MemoryEntry,
  RadialAppDef,
  Section,
} from "./island/island-types";
