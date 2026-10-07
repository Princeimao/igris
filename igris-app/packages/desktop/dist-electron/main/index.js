"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const node_url = require("node:url");
const core = require("@igris/core");
const require$$0 = require("fs");
const require$$1 = require("path");
const require$$2 = require("os");
const require$$3 = require("crypto");
const node_child_process = require("node:child_process");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var main = { exports: {} };
const version = "16.6.1";
const require$$4 = {
  version
};
var hasRequiredMain;
function requireMain() {
  if (hasRequiredMain) return main.exports;
  hasRequiredMain = 1;
  const fs2 = require$$0;
  const path2 = require$$1;
  const os = require$$2;
  const crypto = require$$3;
  const packageJson = require$$4;
  const version2 = packageJson.version;
  const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
  function parse(src) {
    const obj = {};
    let lines = src.toString();
    lines = lines.replace(/\r\n?/mg, "\n");
    let match;
    while ((match = LINE.exec(lines)) != null) {
      const key = match[1];
      let value = match[2] || "";
      value = value.trim();
      const maybeQuote = value[0];
      value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
      if (maybeQuote === '"') {
        value = value.replace(/\\n/g, "\n");
        value = value.replace(/\\r/g, "\r");
      }
      obj[key] = value;
    }
    return obj;
  }
  function _parseVault(options) {
    options = options || {};
    const vaultPath = _vaultPath(options);
    options.path = vaultPath;
    const result = DotenvModule.configDotenv(options);
    if (!result.parsed) {
      const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
      err.code = "MISSING_DATA";
      throw err;
    }
    const keys = _dotenvKey(options).split(",");
    const length = keys.length;
    let decrypted;
    for (let i = 0; i < length; i++) {
      try {
        const key = keys[i].trim();
        const attrs = _instructions(result, key);
        decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
        break;
      } catch (error) {
        if (i + 1 >= length) {
          throw error;
        }
      }
    }
    return DotenvModule.parse(decrypted);
  }
  function _warn(message) {
    console.log(`[dotenv@${version2}][WARN] ${message}`);
  }
  function _debug(message) {
    console.log(`[dotenv@${version2}][DEBUG] ${message}`);
  }
  function _log(message) {
    console.log(`[dotenv@${version2}] ${message}`);
  }
  function _dotenvKey(options) {
    if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
      return options.DOTENV_KEY;
    }
    if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
      return process.env.DOTENV_KEY;
    }
    return "";
  }
  function _instructions(result, dotenvKey) {
    let uri;
    try {
      uri = new URL(dotenvKey);
    } catch (error) {
      if (error.code === "ERR_INVALID_URL") {
        const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      throw error;
    }
    const key = uri.password;
    if (!key) {
      const err = new Error("INVALID_DOTENV_KEY: Missing key part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environment = uri.searchParams.get("environment");
    if (!environment) {
      const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
    const ciphertext = result.parsed[environmentKey];
    if (!ciphertext) {
      const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
      err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
      throw err;
    }
    return { ciphertext, key };
  }
  function _vaultPath(options) {
    let possibleVaultPath = null;
    if (options && options.path && options.path.length > 0) {
      if (Array.isArray(options.path)) {
        for (const filepath of options.path) {
          if (fs2.existsSync(filepath)) {
            possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
          }
        }
      } else {
        possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
      }
    } else {
      possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
    }
    if (fs2.existsSync(possibleVaultPath)) {
      return possibleVaultPath;
    }
    return null;
  }
  function _resolveHome(envPath) {
    return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
  }
  function _configVault(options) {
    const debug = Boolean(options && options.debug);
    const quiet = options && "quiet" in options ? options.quiet : true;
    if (debug || !quiet) {
      _log("Loading env from encrypted .env.vault");
    }
    const parsed = DotenvModule._parseVault(options);
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    DotenvModule.populate(processEnv, parsed, options);
    return { parsed };
  }
  function configDotenv(options) {
    const dotenvPath = path2.resolve(process.cwd(), ".env");
    let encoding = "utf8";
    const debug = Boolean(options && options.debug);
    const quiet = options && "quiet" in options ? options.quiet : true;
    if (options && options.encoding) {
      encoding = options.encoding;
    } else {
      if (debug) {
        _debug("No encoding is specified. UTF-8 is used by default");
      }
    }
    let optionPaths = [dotenvPath];
    if (options && options.path) {
      if (!Array.isArray(options.path)) {
        optionPaths = [_resolveHome(options.path)];
      } else {
        optionPaths = [];
        for (const filepath of options.path) {
          optionPaths.push(_resolveHome(filepath));
        }
      }
    }
    let lastError;
    const parsedAll = {};
    for (const path22 of optionPaths) {
      try {
        const parsed = DotenvModule.parse(fs2.readFileSync(path22, { encoding }));
        DotenvModule.populate(parsedAll, parsed, options);
      } catch (e) {
        if (debug) {
          _debug(`Failed to load ${path22} ${e.message}`);
        }
        lastError = e;
      }
    }
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    DotenvModule.populate(processEnv, parsedAll, options);
    if (debug || !quiet) {
      const keysCount = Object.keys(parsedAll).length;
      const shortPaths = [];
      for (const filePath of optionPaths) {
        try {
          const relative = path2.relative(process.cwd(), filePath);
          shortPaths.push(relative);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${filePath} ${e.message}`);
          }
          lastError = e;
        }
      }
      _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
    }
    if (lastError) {
      return { parsed: parsedAll, error: lastError };
    } else {
      return { parsed: parsedAll };
    }
  }
  function config(options) {
    if (_dotenvKey(options).length === 0) {
      return DotenvModule.configDotenv(options);
    }
    const vaultPath = _vaultPath(options);
    if (!vaultPath) {
      _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
      return DotenvModule.configDotenv(options);
    }
    return DotenvModule._configVault(options);
  }
  function decrypt(encrypted, keyStr) {
    const key = Buffer.from(keyStr.slice(-64), "hex");
    let ciphertext = Buffer.from(encrypted, "base64");
    const nonce = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(-16);
    ciphertext = ciphertext.subarray(12, -16);
    try {
      const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      aesgcm.setAuthTag(authTag);
      return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
    } catch (error) {
      const isRange = error instanceof RangeError;
      const invalidKeyLength = error.message === "Invalid key length";
      const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
      if (isRange || invalidKeyLength) {
        const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      } else if (decryptionFailed) {
        const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
        err.code = "DECRYPTION_FAILED";
        throw err;
      } else {
        throw error;
      }
    }
  }
  function populate(processEnv, parsed, options = {}) {
    const debug = Boolean(options && options.debug);
    const override = Boolean(options && options.override);
    if (typeof parsed !== "object") {
      const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
      err.code = "OBJECT_REQUIRED";
      throw err;
    }
    for (const key of Object.keys(parsed)) {
      if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
        if (override === true) {
          processEnv[key] = parsed[key];
        }
        if (debug) {
          if (override === true) {
            _debug(`"${key}" is already defined and WAS overwritten`);
          } else {
            _debug(`"${key}" is already defined and was NOT overwritten`);
          }
        }
      } else {
        processEnv[key] = parsed[key];
      }
    }
  }
  const DotenvModule = {
    configDotenv,
    _configVault,
    _parseVault,
    config,
    decrypt,
    parse,
    populate
  };
  main.exports.configDotenv = DotenvModule.configDotenv;
  main.exports._configVault = DotenvModule._configVault;
  main.exports._parseVault = DotenvModule._parseVault;
  main.exports.config = DotenvModule.config;
  main.exports.decrypt = DotenvModule.decrypt;
  main.exports.parse = DotenvModule.parse;
  main.exports.populate = DotenvModule.populate;
  main.exports = DotenvModule;
  return main.exports;
}
var mainExports = requireMain();
const dotenv = /* @__PURE__ */ getDefaultExportFromCjs(mainExports);
function runPowerShell(script, timeoutMs = 2e4) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    node_child_process.execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded
      ],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      }
    );
  });
}
function parseJsonOutput(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}
const NOW_PLAYING_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows, ContentType = WindowsRuntime]

function Await-WinRT($asyncOp, $resultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 })[0]
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($asyncOp))
  return $task.GetAwaiter().GetResult()
}

try {
  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $manager = Await-WinRT ($managerType::RequestAsync()) ($managerType)
  $session = $manager.GetCurrentSession()
  if ($null -eq $session) {
    Write-Output '{"ok":true,"session":false}'
    exit 0
  }

  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
  $props = $null
  try { $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ($propsType) } catch { $props = $null }
  $pb = $session.GetPlaybackInfo()
  $tl = $session.GetTimelineProperties()

  $artwork = $null
  try {
    $thumbRef = $props.Thumbnail
    if ($null -ne $thumbRef) {
      $stream = Await-WinRT ($thumbRef.OpenReadAsync()) ($streamType)
      $size = [int]$stream.Size
      if ($size -gt 0 -and $size -lt 500000) {
        $reader = New-Object Windows.Storage.Streams.DataReader($stream)
        $null = Await-WinRT ($reader.LoadAsync([uint32]$size)) ([uint32])
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        $reader.DetachStream()
        $artwork = [Convert]::ToBase64String($bytes)
      }
      $stream.Dispose()
    }
  } catch { $artwork = $null }

  $out = [ordered]@{
    ok = $true
    session = $true
    app = $session.SourceAppUserModelId
    title = $props.Title
    artist = $props.Artist
    album = $props.AlbumTitle
    status = $pb.PlaybackStatus.ToString()
    positionSec = $tl.Position.TotalSeconds
    durationSec = $tl.EndTime.TotalSeconds
    artwork = $artwork
  }
  $out | ConvertTo-Json -Compress -Depth 3
} catch {
  Write-Output '{"ok":false,"session":false}'
}
`;
async function getNowPlaying() {
  if (process.platform !== "win32") return { ok: false, session: false };
  try {
    const stdout = await runPowerShell(NOW_PLAYING_SCRIPT);
    return parseJsonOutput(stdout) ?? { ok: false, session: false };
  } catch {
    return { ok: false, session: false };
  }
}
const MUTE_GET_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8();
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, int actParams, out IAudioEndpointVolume ep);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IntPtr coll);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3C-C4579291692A")] class MMDeviceEnumeratorComObject { }
public static class SysAudio {
  static Guid IID_IAudioEndpointVolume = typeof(IAudioEndpointVolume).GUID;
  static IAudioEndpointVolume Endpoint() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume ep;
    Marshal.ThrowExceptionForHR(dev.Activate(ref IID_IAudioEndpointVolume, 1, 0, out ep));
    return ep;
  }
  public static bool GetMute() {
    bool mute;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out mute));
    return mute;
  }
}
'@
try {
  $m = [SysAudio]::GetMute()
  if ($m) { Write-Output '{"ok":true,"muted":true}' } else { Write-Output '{"ok":true,"muted":false}' }
} catch {
  Write-Output '{"ok":false}'
}
`;
const MUTE_TOGGLE_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VolKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@
# VK_VOLUME_MUTE (0xAD) key press toggles the system mute, no dependencies.
[VolKeys]::keybd_event(0xAD, 0, 0, [UIntPtr]::Zero)
[VolKeys]::keybd_event(0xAD, 0, 2, [UIntPtr]::Zero)
Write-Output '{"ok":true}'
`;
async function sendMediaCommand(command, positionSec) {
  if (process.platform !== "win32") return { ok: false, reason: "unsupported" };
  const safePosition = typeof positionSec === "number" && Number.isFinite(positionSec) ? Math.max(0, positionSec) : -1;
  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows, ContentType = WindowsRuntime]
function Await-WinRT($asyncOp, $resultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 })[0]
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($asyncOp))
  return $task.GetAwaiter().GetResult()
}
try {
  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $manager = Await-WinRT ($managerType::RequestAsync()) ($managerType)
  $session = $manager.GetCurrentSession()
  if ($null -eq $session) {
    Write-Output '{"ok":false,"reason":"no-session"}'
    exit 0
  }
  $op = $null
  switch ('${command}') {
    'toggle' { $op = $session.TryTogglePlayPauseAsync() }
    'next' { $op = $session.TryNextAsync() }
    'prev' { $op = $session.TryPreviousAsync() }
    'seek' {
      if (${safePosition} -lt 0) {
        Write-Output '{"ok":false,"reason":"no-position"}'
        exit 0
      }
      $op = $session.TryChangePlaybackPositionAsync([long](${safePosition} * 10000000))
    }
  }
  if ($null -eq $op) {
    Write-Output '{"ok":false,"reason":"unsupported"}'
    exit 0
  }
  $done = Await-WinRT ($op) ([bool])
  if ($done) { Write-Output '{"ok":true,"result":true}' } else { Write-Output '{"ok":true,"result":false}' }
} catch {
  Write-Output '{"ok":false,"reason":"error"}'
}
`;
  try {
    const stdout = await runPowerShell(script);
    return parseJsonOutput(stdout) ?? {
      ok: false,
      reason: "parse"
    };
  } catch {
    return { ok: false, reason: "exec" };
  }
}
async function getSystemMuted() {
  if (process.platform !== "win32") return { ok: false };
  try {
    const stdout = await runPowerShell(MUTE_GET_SCRIPT);
    return parseJsonOutput(stdout) ?? { ok: false };
  } catch {
    return { ok: false };
  }
}
async function toggleSystemMuted() {
  if (process.platform !== "win32") return { ok: false };
  try {
    await runPowerShell(MUTE_TOGGLE_SCRIPT);
  } catch {
    return { ok: false };
  }
  return getSystemMuted();
}
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
const COMPACT_WIDTH = 440;
const COMPACT_HEIGHT = 300;
const EXPANDED_WIDTH = 900;
const EXPANDED_HEIGHT = 500;
let igrisCore = null;
let interactionMode = "idle";
let outsideStreak = 0;
let collapseSent = false;
function centerHorizontally(mainWindow2, y) {
  const { width: displayWidth } = electron.screen.getPrimaryDisplay().workAreaSize;
  const [winWidth = COMPACT_WIDTH] = mainWindow2.getSize();
  mainWindow2.setPosition(Math.round((displayWidth - winWidth) / 2), y);
}
function startClickThroughPoll(mainWindow2) {
  setInterval(() => {
    if (mainWindow2.isDestroyed()) return;
    try {
      if (interactionMode === "dashboard" || interactionMode === "radial") {
        mainWindow2.setIgnoreMouseEvents(false);
        if (interactionMode === "dashboard") {
          const cursor2 = electron.screen.getCursorScreenPoint();
          const bounds2 = mainWindow2.getBounds();
          const inside = cursor2.x >= bounds2.x && cursor2.x <= bounds2.x + bounds2.width && cursor2.y >= bounds2.y && cursor2.y <= bounds2.y + bounds2.height;
          if (inside) {
            outsideStreak = 0;
            collapseSent = false;
          } else {
            outsideStreak += 1;
            if (outsideStreak >= 5 && !collapseSent) {
              collapseSent = true;
              try {
                mainWindow2.webContents.send("igris:auto-collapse");
              } catch {
              }
            }
          }
        }
        return;
      }
      outsideStreak = 0;
      collapseSent = false;
      const cursor = electron.screen.getCursorScreenPoint();
      const bounds = mainWindow2.getBounds();
      const notch = {
        x: bounds.x + bounds.width / 2 - 86,
        y: bounds.y,
        width: 172,
        height: 44
      };
      const overNotch = cursor.x >= notch.x && cursor.x <= notch.x + notch.width && cursor.y >= notch.y && cursor.y <= notch.y + notch.height;
      mainWindow2.setIgnoreMouseEvents(!overNotch, { forward: true });
    } catch {
    }
  }, 100);
}
function setupIPC(mainWindow2) {
  const ready = core.IgrisCore.create().catch((err) => {
    console.error("[Main] Failed to initialize IgrisCore:", err);
    return new core.IgrisCore();
  });
  void ready.then((core2) => {
    igrisCore = core2;
    void core2.memory.search("warmup").catch(() => void 0);
  });
  async function core$1() {
    if (!igrisCore) igrisCore = await ready;
    return igrisCore;
  }
  electron.ipcMain.handle("igris:chat", async (_event, prompt, options) => {
    return await (await core$1()).chat(prompt, options);
  });
  electron.ipcMain.handle("igris:status", async () => {
    if (!igrisCore) return false;
    return await igrisCore.isHiveAvailable();
  });
  electron.ipcMain.handle("igris:memories", async (_event, type) => {
    const memories = await (await core$1()).memory.list(type);
    return memories.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      tags: m.tags,
      createdAt: m.createdAt.toISOString()
    }));
  });
  electron.ipcMain.handle("igris:resize", async (_event, expanded) => {
    if (mainWindow2.isDestroyed()) return;
    if (expanded) {
      mainWindow2.setSize(EXPANDED_WIDTH, EXPANDED_HEIGHT, true);
      centerHorizontally(mainWindow2, 0);
    } else {
      mainWindow2.setSize(COMPACT_WIDTH, COMPACT_HEIGHT, true);
      centerHorizontally(mainWindow2, 0);
    }
  });
  electron.ipcMain.handle("igris:interaction-mode", async (_event, mode) => {
    interactionMode = mode;
  });
  electron.ipcMain.handle("igris:open-external", async (_event, url) => {
    if (typeof url !== "string" || !url.startsWith("https://")) return;
    await electron.shell.openExternal(url);
  });
  electron.ipcMain.handle("igris:minimize", () => {
    mainWindow2.minimize();
  });
  const vaultPath = () => path.join(electron.app.getPath("userData"), "github-vault.bin");
  async function readVaultToken() {
    try {
      const raw = await fs.promises.readFile(vaultPath());
      if (!electron.safeStorage.isEncryptionAvailable()) return null;
      return electron.safeStorage.decryptString(raw);
    } catch {
      return null;
    }
  }
  async function fetchGitHubProfile(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    });
    if (!res.ok) throw new Error(`GitHub rejected the token (${res.status})`);
    const data = await res.json();
    return {
      login: data.login,
      avatarUrl: data.avatar_url,
      publicRepos: data.public_repos,
      followers: data.followers
    };
  }
  electron.ipcMain.handle("igris:github-connect", async (_event, token) => {
    if (typeof token !== "string" || !token.trim()) {
      return { ok: false, error: "Empty token" };
    }
    if (!electron.safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: "OS keychain unavailable" };
    }
    try {
      const profile = await fetchGitHubProfile(token.trim());
      await fs.promises.writeFile(vaultPath(), electron.safeStorage.encryptString(token.trim()));
      return { ok: true, profile };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Verification failed"
      };
    }
  });
  electron.ipcMain.handle("igris:github-profile", async () => {
    const token = await readVaultToken();
    if (!token) return { ok: true, connected: false };
    try {
      const profile = await fetchGitHubProfile(token);
      return { ok: true, connected: true, profile };
    } catch {
      try {
        await fs.promises.unlink(vaultPath());
      } catch {
      }
      return { ok: true, connected: false };
    }
  });
  electron.ipcMain.handle("igris:github-disconnect", async () => {
    try {
      await fs.promises.unlink(vaultPath());
    } catch {
    }
    return { ok: true };
  });
  electron.ipcMain.handle("igris:media-now-playing", async () => getNowPlaying());
  electron.ipcMain.handle(
    "igris:media-command",
    async (_event, command, positionSec) => sendMediaCommand(command, positionSec)
  );
  electron.ipcMain.handle("igris:system-mute-get", async () => getSystemMuted());
  electron.ipcMain.handle("igris:system-mute-toggle", async () => toggleSystemMuted());
  electron.ipcMain.handle("igris:close", () => {
    electron.app.quit();
  });
  startClickThroughPoll(mainWindow2);
}
const __filename$1 = node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.js", document.baseURI).href);
const __dirname$1 = path.dirname(__filename$1);
let mainWindow = null;
function getMainWindow() {
  return mainWindow;
}
function placeTopCenter(win, y) {
  const { width: displayWidth } = electron.screen.getPrimaryDisplay().workAreaSize;
  const [winWidth = COMPACT_WIDTH] = win.getSize();
  win.setPosition(Math.round((displayWidth - winWidth) / 2), y);
}
function createWindow() {
  const preloadCandidates = [
    path.join(__dirname$1, "../preload/index.mjs"),
    path.join(__dirname$1, "../preload/index.js"),
    path.join(__dirname$1, "preload.js")
  ];
  const preloadPath = preloadCandidates.find((p) => fs.existsSync(p)) ?? preloadCandidates[0];
  mainWindow = new electron.BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    // Positioned top-centre below; y=0 makes the pill read as a notch.
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
    ...process.platform !== "darwin" ? { type: "toolbar" } : {},
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  setupIPC(mainWindow);
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load URL "${validatedURL}": (${errorCode}) ${errorDescription}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelNames = ["VERBOSE", "INFO", "WARN", "ERROR"];
    const levelName = levelNames[level] || "LOG";
    console.log(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" || input.control && input.shift && input.key.toLowerCase() === "i") {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log(`[Electron] Loading Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlCandidates = [
      path.join(__dirname$1, "../../dist/index.html"),
      path.join(__dirname$1, "../renderer/index.html"),
      path.join(__dirname$1, "index.html")
    ];
    const htmlPath = htmlCandidates.find((p) => fs.existsSync(p)) ?? htmlCandidates[0];
    console.log(`[Electron] Loading file: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (mainWindow) placeTopCenter(mainWindow, 0);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  if (process.platform === "darwin" && electron.app.dock) electron.app.dock.hide();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
exports.getMainWindow = getMainWindow;
exports.placeTopCenter = placeTopCenter;
