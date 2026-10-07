import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  Clock3,
  CloudSun,
  GitBranch,
  Music2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Island phases. Single state machine — only one phase renders at a time,
// which is what prevents the old radial-vs-dashboard animation fight.
// ---------------------------------------------------------------------------

export type IslandPhase = "idle" | "radial" | "dashboard";

export type InteractionMode = "idle" | "radial" | "dashboard";

export type Section =
  | "today"
  | "time"
  | "music"
  | "weather"
  | "reminders"
  | "github"
  | "claude"
  | "notes"
  | "gmail";

/** Canonical panel order for the drag carousel + tab row. */
export const SECTION_ORDER: Section[] = [
  "today",
  "time",
  "music",
  "weather",
  "reminders",
  "github",
  "claude",
  "notes",
  "gmail",
];

/** Currently-playing media as reported by the OS (SMTC on Windows). */
export interface NowPlayingInfo {
  ok: boolean;
  session: boolean;
  app?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  status?: string;
  positionSec?: number;
  durationSec?: number;
  /** base64 artwork (best-effort) */
  artwork?: string | null;
}

/** Transport command sent to the OS media session. */
export type MediaCommandName = "toggle" | "next" | "prev" | "seek";

export interface MediaCommandResult {
  ok: boolean;
  result?: boolean;
  reason?: string;
}
export interface FocusTimerState {
  totalSec: number;
  leftSec: number;
  running: boolean;
}

export interface FocusTimerControls {
  start: () => void;
  pause: () => void;
  reset: () => void;
  setPreset: (sec: number) => void;
}

export interface ChatResult {
  id: string;
  content: string;
  status: "completed" | "failed";
  route: "pi" | "hive";
  error?: string;
}

export interface MemoryEntry {
  id: string;
  type: string;
  content: string;
  tags: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Radial menu geometry.
//
// Coordinates are relative to the notch-core centre. The compact Electron
// window is 440 x 300 with the core centre at window (220, 18), flush to the
// top edge (notch style). Items sit on a downward arc inside a frosted
// semi-circle deck:
//
//   abs x: 220 - 137 - 24 = 59px margin  |  max y: 18 + 112 + 24 = 154 < 300
// ---------------------------------------------------------------------------

export interface RadialAppDef {
  id: Section;
  label: string;
  icon: LucideIcon;
  /** Offset from core centre, in px. */
  x: number;
  y: number;
  /** Which side the shadcn tooltip should open (keeps it inside window). */
  tooltipSide: "top" | "bottom";
}

export const RADIAL_APPS: RadialAppDef[] = [
  { id: "today", label: "Today", icon: CalendarDays, x: -137, y: 54, tooltipSide: "top" },
  { id: "time", label: "Time", icon: Clock3, x: -87, y: 95, tooltipSide: "top" },
  { id: "music", label: "Spotify", icon: Music2, x: -32, y: 112, tooltipSide: "top" },
  { id: "weather", label: "Weather", icon: CloudSun, x: 32, y: 112, tooltipSide: "top" },
  { id: "reminders", label: "Reminders", icon: Bell, x: 87, y: 95, tooltipSide: "top" },
  { id: "github", label: "GitHub", icon: GitBranch, x: 137, y: 54, tooltipSide: "top" },
];

export const SECTION_LABELS: Array<{ id: Section; label: string }> = [
  { id: "today", label: "Today" },
  { id: "time", label: "Time" },
  { id: "music", label: "Spotify" },
  { id: "weather", label: "Weather" },
  { id: "reminders", label: "Reminders" },
  { id: "github", label: "GitHub" },
  { id: "claude", label: "Claude" },
  { id: "notes", label: "Notes" },
  { id: "gmail", label: "Gmail" },
];

// ---------------------------------------------------------------------------
// window.igris bridge (preload). All previously existing APIs are preserved;
// setInteractionMode is additive for main-process click-through control.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    igris: {
      chat: (
        prompt: string,
        options?: { isLongRunning?: boolean; requiresBrowser?: boolean },
      ) => Promise<ChatResult>;
      checkHiveStatus: () => Promise<boolean>;
      getMemories: (
        type?: "personal" | "project" | "agent",
      ) => Promise<MemoryEntry[]>;
      resizeWindow: (expanded: boolean) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      /** Additive: tells main which hit-test mode to use for click-through. */
      setInteractionMode?: (mode: InteractionMode) => Promise<void>;
      /** Additive: open a URL in the system browser (https only). */
      openExternal?: (url: string) => Promise<void>;
      /** Additive: OS media session (SMTC on Windows), no credentials. */
      mediaNowPlaying?: () => Promise<NowPlayingInfo>;
      /** Additive: transport control on the OS media session. */
      mediaCommand?: (
        command: MediaCommandName,
        positionSec?: number,
      ) => Promise<MediaCommandResult>;
      /** Additive: system mute query + toggle (no dependencies). */
      systemMuteGet?: () => Promise<{ ok: boolean; muted?: boolean }>;
      systemMuteToggle?: () => Promise<{ ok: boolean; muted?: boolean }>;
      /** Additive: main pushes this when the cursor leaves the dashboard. */
      onAutoCollapse?: (cb: () => void) => () => void;
      /** Additive: GitHub vault in main (OS keychain) — token never here. */
      githubConnect?: (
        token: string,
      ) => Promise<
        | { ok: true; profile: GitHubProfile }
        | { ok: false; error: string }
      >;
      githubProfile?: () => Promise<
        | { ok: true; connected: true; profile: GitHubProfile }
        | { ok: true; connected: false }
      >;
      githubDisconnect?: () => Promise<{ ok: true }>;
    };
  }
}

export interface GitHubProfile {
  login: string;
  avatarUrl: string;
  publicRepos: number;
  followers: number;
}
