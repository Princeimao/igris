import { execFile } from 'node:child_process';

// ---------------------------------------------------------------------------
// Windows OS media + audio services for the Electron main process.
//
// Spotify (and any other player) publishes its session to the OS media layer
// (SystemMediaTransportControls). We read that layer — no Spotify Web API,
// no OAuth, no developer credentials. Flow:
//
//   Spotify -> SMTC session -> PowerShell (WinRT) -> JSON -> Electron -> UI
//
// Everything runs via dependency-free PowerShell (WinRT interop + a small
// CoreAudio COM helper for mute state). Non-Windows platforms return
// { ok: false } so the UI can degrade gracefully; the module boundary keeps
// macOS/Linux adapters pluggable later.
// ---------------------------------------------------------------------------

export interface NowPlayingInfo {
  ok: boolean;
  session: boolean;
  app?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  /** e.g. 'Playing' | 'Paused' | 'Stopped' */
  status?: string;
  positionSec?: number;
  durationSec?: number;
  /** base64-encoded artwork (best-effort, may be null) */
  artwork?: string | null;
}

export interface MuteState {
  ok: boolean;
  muted?: boolean;
}

function runPowerShell(script: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    // -EncodedCommand (base64 UTF-16LE): the reliable way to pass
    // multi-line scripts. `-Command -` over stdin silently drops scripts
    // containing multi-line here-strings.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

/** Extract the first {...} JSON object (PowerShell may emit warnings). */
function parseJsonOutput<T>(stdout: string): T | null {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as T;
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

export async function getNowPlaying(): Promise<NowPlayingInfo> {
  if (process.platform !== 'win32') return { ok: false, session: false };
  try {
    const stdout = await runPowerShell(NOW_PLAYING_SCRIPT);
    return parseJsonOutput<NowPlayingInfo>(stdout) ?? { ok: false, session: false };
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

export interface MediaCommandResult {
  ok: boolean;
  result?: boolean;
  reason?: string;
}

export type MediaCommandName = "toggle" | "next" | "prev" | "seek";

/**
 * Transport control on the current OS media session (same SMTC channel as
 * the reads — no Spotify API, no credentials). `seek` needs positionSec.
 */
export async function sendMediaCommand(
  command: MediaCommandName,
  positionSec?: number,
): Promise<MediaCommandResult> {
  if (process.platform !== "win32") return { ok: false, reason: "unsupported" };
  const safePosition =
    typeof positionSec === "number" && Number.isFinite(positionSec)
      ? Math.max(0, positionSec)
      : -1;
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
    return (
      parseJsonOutput<MediaCommandResult>(stdout) ?? {
        ok: false,
        reason: "parse",
      }
    );
  } catch {
    return { ok: false, reason: "exec" };
  }
}

export async function getSystemMuted(): Promise<MuteState> {
  if (process.platform !== 'win32') return { ok: false };
  try {
    const stdout = await runPowerShell(MUTE_GET_SCRIPT);
    return parseJsonOutput<MuteState>(stdout) ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function toggleSystemMuted(): Promise<MuteState> {
  if (process.platform !== 'win32') return { ok: false };
  try {
    await runPowerShell(MUTE_TOGGLE_SCRIPT);
  } catch {
    return { ok: false };
  }
  // Re-read state (best-effort; may be unavailable on some machines).
  return getSystemMuted();
}
