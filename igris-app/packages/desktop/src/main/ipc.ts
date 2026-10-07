import { ipcMain, BrowserWindow, screen, shell, safeStorage } from 'electron';
import { IgrisCore } from '@igris/core';
import dotenv from 'dotenv';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { app } from 'electron';
import { getNowPlaying, getSystemMuted, sendMediaCommand, toggleSystemMuted } from './system.js';

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

// ---------------------------------------------------------------------------
// Window geometry. The compact window is a tall TRANSPARENT stage: only the
// notch pill is visible at idle, but the full 440x300 rect exists so the
// radial fan (which extends ~240px below the core) can never be OS-clipped.
// Clicks on empty areas pass through via the interaction-mode poll below.
// ---------------------------------------------------------------------------

export const COMPACT_WIDTH = 440;
export const COMPACT_HEIGHT = 300;
export const EXPANDED_WIDTH = 900;
export const EXPANDED_HEIGHT = 500;

type InteractionMode = 'idle' | 'radial' | 'dashboard';

let igrisCore: IgrisCore | null = null;
let interactionMode: InteractionMode = 'idle';
// Consecutive poll ticks with the cursor outside the window while the
// dashboard is open. After ~500ms we push an auto-collapse — this does not
// depend on renderer mouseleave, which frameless windows can swallow.
let outsideStreak = 0;
let collapseSent = false;

function centerHorizontally(mainWindow: BrowserWindow, y: number): void {
  const { width: displayWidth } = screen.getPrimaryDisplay().workAreaSize;
  const [winWidth = COMPACT_WIDTH] = mainWindow.getSize();
  mainWindow.setPosition(Math.round((displayWidth - winWidth) / 2), y);
}

/**
 * Background click-through: the transparent window must never block the apps
 * behind it. Renderer mouseenter can't be trusted here (an ignored window
 * receives no mouse events), so main polls the cursor position and toggles
 * setIgnoreMouseEvents itself, based on the renderer's interaction mode:
 *
 * - dashboard: full window is interactive → never ignore.
 * - radial: menu is open and modal-ish → never ignore (closes on mouse-leave).
 * - idle: only the notch pill (top-centre 172x40) is interactive.
 */
function startClickThroughPoll(mainWindow: BrowserWindow): void {
  setInterval(() => {
    if (mainWindow.isDestroyed()) return;
    try {
      if (interactionMode === 'dashboard' || interactionMode === 'radial') {
        mainWindow.setIgnoreMouseEvents(false);
        if (interactionMode === 'dashboard') {
          const cursor = screen.getCursorScreenPoint();
          const bounds = mainWindow.getBounds();
          const inside =
            cursor.x >= bounds.x &&
            cursor.x <= bounds.x + bounds.width &&
            cursor.y >= bounds.y &&
            cursor.y <= bounds.y + bounds.height;
          if (inside) {
            outsideStreak = 0;
            collapseSent = false;
          } else {
            outsideStreak += 1;
            if (outsideStreak >= 5 && !collapseSent) {
              collapseSent = true;
              try {
                mainWindow.webContents.send('igris:auto-collapse');
              } catch {
                // renderer gone — nothing to collapse.
              }
            }
          }
        }
        return;
      }
      outsideStreak = 0;
      collapseSent = false;
      const cursor = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();
      const notch = {
        x: bounds.x + bounds.width / 2 - 86,
        y: bounds.y,
        width: 172,
        height: 44,
      };
      const overNotch =
        cursor.x >= notch.x &&
        cursor.x <= notch.x + notch.width &&
        cursor.y >= notch.y &&
        cursor.y <= notch.y + notch.height;
      mainWindow.setIgnoreMouseEvents(!overNotch, { forward: true });
    } catch {
      // Never let the poll crash the main process.
    }
  }, 100);
}

export function setupIPC(mainWindow: BrowserWindow): void {
  // Async construction resolves the configured memory backend (Cognee
  // sidecar with JSON fallback). Host startup never blocks on it — handlers
  // await readiness below.
  const ready: Promise<IgrisCore> = IgrisCore.create().catch((err) => {
    console.error('[Main] Failed to initialize IgrisCore:', err);
    return new IgrisCore();
  });
  void ready.then((core) => {
    igrisCore = core;
    // Pre-warm the memory backend (Cognee engine + user resolution) so the
    // first real chat doesn't pay the cold-start latency while staring at a
    // spinner. Best-effort and silent by design.
    void core.memory
      .search('warmup')
      .catch(() => undefined);
  });

  async function core(): Promise<IgrisCore> {
    if (!igrisCore) igrisCore = await ready;
    return igrisCore;
  }

  ipcMain.handle('igris:chat', async (_event, prompt: string, options?: { isLongRunning?: boolean; requiresBrowser?: boolean }) => {
    return await (await core()).chat(prompt, options);
  });

  ipcMain.handle('igris:status', async () => {
    if (!igrisCore) return false;
    return await igrisCore.isHiveAvailable();
  });

  ipcMain.handle('igris:memories', async (_event, type?: 'personal' | 'project' | 'agent') => {
    const memories = await (await core()).memory.list(type);
    return memories.map(m => ({
      id: m.id,
      type: m.type,
      content: m.content,
      tags: m.tags,
      createdAt: m.createdAt.toISOString(),
    }));
  });

  ipcMain.handle('igris:resize', async (_event, expanded: boolean) => {
    if (mainWindow.isDestroyed()) return;
    if (expanded) {
      mainWindow.setSize(EXPANDED_WIDTH, EXPANDED_HEIGHT, true);
      // Flush to the top edge — the dashboard grows out of the notch.
      centerHorizontally(mainWindow, 0);
    } else {
      mainWindow.setSize(COMPACT_WIDTH, COMPACT_HEIGHT, true);
      centerHorizontally(mainWindow, 0);
    }
  });

  ipcMain.handle('igris:interaction-mode', async (_event, mode: InteractionMode) => {
    interactionMode = mode;
  });

  // Direct connections (Spotify / GitHub authorisation) open on the
  // provider's own site in the system browser. Only https: is allowed —
  // Igris never sees the user's provider credentials.
  ipcMain.handle('igris:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) return;
    await shell.openExternal(url);
  });

  ipcMain.handle('igris:minimize', () => {
    mainWindow.minimize();
  });

  // ---------------------------------------------------------------------------
  // GitHub vault: the PAT is verified + stored in the OS keychain
  // (safeStorage/DPAPI) under the app data dir. The renderer never holds the
  // token — it only receives the public profile. All api.github.com calls
  // that need auth originate here.
  // ---------------------------------------------------------------------------

  const vaultPath = () => path.join(app.getPath('userData'), 'github-vault.bin');

  async function readVaultToken(): Promise<string | null> {
    try {
      const raw = await fs.readFile(vaultPath());
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(raw);
    } catch {
      return null;
    }
  }

  async function fetchGitHubProfile(token: string): Promise<{
    login: string;
    avatarUrl: string;
    publicRepos: number;
    followers: number;
  }> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error(`GitHub rejected the token (${res.status})`);
    const data = (await res.json()) as {
      login: string;
      avatar_url: string;
      public_repos: number;
      followers: number;
    };
    return {
      login: data.login,
      avatarUrl: data.avatar_url,
      publicRepos: data.public_repos,
      followers: data.followers,
    };
  }

  ipcMain.handle('igris:github-connect', async (_event, token: string) => {
    if (typeof token !== 'string' || !token.trim()) {
      return { ok: false as const, error: 'Empty token' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false as const, error: 'OS keychain unavailable' };
    }
    try {
      const profile = await fetchGitHubProfile(token.trim());
      await fs.writeFile(vaultPath(), safeStorage.encryptString(token.trim()));
      return { ok: true as const, profile };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Verification failed',
      };
    }
  });

  ipcMain.handle('igris:github-profile', async () => {
    const token = await readVaultToken();
    if (!token) return { ok: true as const, connected: false as const };
    try {
      const profile = await fetchGitHubProfile(token);
      return { ok: true as const, connected: true as const, profile };
    } catch {
      // Token stored but rejected (revoked?) — stay connected=false so the
      // UI offers a fresh connect; vault is cleared to avoid a dead token.
      try {
        await fs.unlink(vaultPath());
      } catch {
        // already gone
      }
      return { ok: true as const, connected: false as const };
    }
  });

  ipcMain.handle('igris:github-disconnect', async () => {
    try {
      await fs.unlink(vaultPath());
    } catch {
      // already gone
    }
    return { ok: true as const };
  });

  // OS media session (SMTC) + system mute. No credentials involved.
  ipcMain.handle('igris:media-now-playing', async () => getNowPlaying());
  ipcMain.handle(
    'igris:media-command',
    async (_event, command: 'toggle' | 'next' | 'prev' | 'seek', positionSec?: number) =>
      sendMediaCommand(command, positionSec),
  );
  ipcMain.handle('igris:system-mute-get', async () => getSystemMuted());
  ipcMain.handle('igris:system-mute-toggle', async () => toggleSystemMuted());

  ipcMain.handle('igris:close', () => {
    app.quit();
  });

  startClickThroughPoll(mainWindow);
}
