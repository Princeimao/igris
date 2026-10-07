import { contextBridge, ipcRenderer } from "electron";

export interface IgrisAPI {
  chat: (
    prompt: string,
    options?: { isLongRunning?: boolean; requiresBrowser?: boolean },
  ) => Promise<{
    id: string;
    content: string;
    status: "completed" | "failed";
    route: "pi" | "hive";
    error?: string;
  }>;
  checkHiveStatus: () => Promise<boolean>;
  getMemories: (type?: "personal" | "project" | "agent") => Promise<
    Array<{
      id: string;
      type: string;
      content: string;
      tags: string[];
      createdAt: string;
    }>
  >;
  resizeWindow: (expanded: boolean) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  setInteractionMode: (mode: "idle" | "dashboard") => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  mediaNowPlaying: () => Promise<{
    ok: boolean;
    session: boolean;
    app?: string;
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    status?: string;
    positionSec?: number;
    durationSec?: number;
    artwork?: string | null;
  }>;
  mediaCommand: (
    command: 'toggle' | 'next' | 'prev' | 'seek',
    positionSec?: number,
  ) => Promise<{ ok: boolean; result?: boolean; reason?: string }>;
  systemMuteGet: () => Promise<{ ok: boolean; muted?: boolean }>;
  systemMuteToggle: () => Promise<{ ok: boolean; muted?: boolean }>;
  /** Main pushes this when the cursor leaves the dashboard window. */
  onAutoCollapse: (cb: () => void) => () => void;
  githubConnect: (
    token: string,
  ) => Promise<
    | { ok: true; profile: GitHubProfile }
    | { ok: false; error: string }
  >;
  githubProfile: () => Promise<
    | { ok: true; connected: true; profile: GitHubProfile }
    | { ok: true; connected: false }
  >;
  githubDisconnect: () => Promise<{ ok: true }>;
}

export interface GitHubProfile {
  login: string;
  avatarUrl: string;
  publicRepos: number;
  followers: number;
}

const api: IgrisAPI = {
  chat: (prompt, options) => ipcRenderer.invoke("igris:chat", prompt, options),
  checkHiveStatus: () => ipcRenderer.invoke("igris:status"),
  getMemories: (type) => ipcRenderer.invoke("igris:memories", type),
  resizeWindow: (expanded) => ipcRenderer.invoke("igris:resize", expanded),
  minimizeWindow: () => ipcRenderer.invoke("igris:minimize"),
  closeWindow: () => ipcRenderer.invoke("igris:close"),
  setInteractionMode: (mode) =>
    ipcRenderer.invoke("igris:interaction-mode", mode),
  openExternal: (url) => ipcRenderer.invoke("igris:open-external", url),
  mediaNowPlaying: () => ipcRenderer.invoke("igris:media-now-playing"),
  mediaCommand: (command, positionSec) =>
    ipcRenderer.invoke("igris:media-command", command, positionSec),
  systemMuteGet: () => ipcRenderer.invoke("igris:system-mute-get"),
  systemMuteToggle: () => ipcRenderer.invoke("igris:system-mute-toggle"),
  onAutoCollapse: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("igris:auto-collapse", listener);
    return () => ipcRenderer.removeListener("igris:auto-collapse", listener);
  },
  githubConnect: (token) => ipcRenderer.invoke("igris:github-connect", token),
  githubProfile: () => ipcRenderer.invoke("igris:github-profile"),
  githubDisconnect: () => ipcRenderer.invoke("igris:github-disconnect"),
};

contextBridge.exposeInMainWorld("igris", api);
