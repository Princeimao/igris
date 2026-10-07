import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COMPACT_HEIGHT, COMPACT_WIDTH, setupIPC } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Centre the window horizontally on the primary display, flush to y. */
export function placeTopCenter(win: BrowserWindow, y: number): void {
  const { width: displayWidth } = screen.getPrimaryDisplay().workAreaSize;
  const [winWidth = COMPACT_WIDTH] = win.getSize();
  win.setPosition(Math.round((displayWidth - winWidth) / 2), y);
}

function createWindow() {
  // Determine preload script location
  const preloadCandidates = [
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, 'preload.js'),
  ];
  const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) ?? preloadCandidates[0]!;

  mainWindow = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    // Positioned top-centre below; y=0 makes the pill read as a notch.
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // No OS shadow: on Windows it paints a rectangular halo and ruins the
    // notch illusion. Shadows are drawn in CSS instead.
    hasShadow: false,
    // Background utility: no taskbar button, no Alt-Tab entry.
    skipTaskbar: true,
    show: false,
    // Toolbar type keeps it out of the taskbar/dock on Windows/Linux.
    ...(process.platform !== 'darwin' ? { type: 'toolbar' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  setupIPC(mainWindow);

  // Debugging & console forwarding to terminal
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load URL "${validatedURL}": (${errorCode}) ${errorDescription}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelNames = ['VERBOSE', 'INFO', 'WARN', 'ERROR'];
    const levelName = levelNames[level] || 'LOG';
    console.log(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`);
  });

  // F12 or Ctrl+Shift+I to toggle DevTools anytime
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log(`[Electron] Loading Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlCandidates = [
      path.join(__dirname, '../../dist/index.html'),
      path.join(__dirname, '../renderer/index.html'),
      path.join(__dirname, 'index.html'),
    ];
    const htmlPath = htmlCandidates.find(p => fs.existsSync(p)) ?? htmlCandidates[0]!;
    console.log(`[Electron] Loading file: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Let clicks pass through empty transparent areas from the start; the
  // interaction-mode poll in ipc.ts tightens/loosens this per phase.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (mainWindow) placeTopCenter(mainWindow, 0);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Background utility: no dock icon on macOS either.
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
