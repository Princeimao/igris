export interface WakeWordHandle {
  stop: () => Promise<void>;
}

export interface WakeWordStatus {
  /** "on" while the engine is listening for the phrase. */
  active: boolean;
  /** Human-readable reason when unavailable (setup hint). */
  reason: string | null;
}

/** Resolve a public/ asset URL in both vite-dev (http) and packaged (file://). */
function publicAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  if (window.location.protocol === "file:") {
    return new URL(clean, window.location.href).href;
  }
  return `/${clean}`;
}

/**
 * On-device "Hey Igris" wake word (Picovoice Porcupine WASM + mic via
 * WebVoiceProcessor). No audio leaves this machine.
 *
 * Requires:
 *   VITE_PORCUPINE_ACCESS_KEY  — free key from console.picovoice.ai
 *   <keyword .ppn>             — train "Hey Igris" in the console, drop the
 *                               file at desktop/public/porcupine/hey-igris.ppn
 *                               (override with VITE_PORCUPINE_KEYWORD_URL)
 *
 * Returns null with a setup reason when unconfigured — voice stays
 * push-to-talk in that case. Never throws outwards.
 */
export async function startWakeWord(
  onWake: () => void,
  onStatus?: (status: WakeWordStatus) => void,
): Promise<WakeWordHandle | null> {
  const report = (status: WakeWordStatus) => onStatus?.(status);
  try {
    const accessKey = import.meta.env.VITE_PORCUPINE_ACCESS_KEY as
      | string
      | undefined;
    if (!accessKey) {
      report({
        active: false,
        reason:
          "Wake word off — set VITE_PORCUPINE_ACCESS_KEY and add hey-igris.ppn (see .env.example).",
      });
      return null;
    }

    const keywordUrl =
      (import.meta.env.VITE_PORCUPINE_KEYWORD_URL as string | undefined) ??
      "/porcupine/hey-igris.ppn";
    const keywordResolved = publicAssetUrl(keywordUrl);
    const keywordRes = await fetch(keywordResolved);
    if (!keywordRes.ok) {
      report({
        active: false,
        reason: `Wake-word model not found at ${keywordUrl} — train "Hey Igris" in Picovoice Console and drop the .ppn there.`,
      });
      return null;
    }

    // Lazy-loaded: the ~3.7MB Porcupine WASM bundle splits into its own
    // chunk and never touches the main bundle when unconfigured.
    const [{ PorcupineWorker }, { WebVoiceProcessor }] = await Promise.all([
      import("@picovoice/porcupine-web"),
      import("@picovoice/web-voice-processor"),
    ]);
    const worker = await PorcupineWorker.create(
      accessKey,
      {
        label: "Hey Igris",
        publicPath: keywordResolved,
        sensitivity: 0.6,
      },
      () => onWake(),
      { publicPath: publicAssetUrl("/porcupine/porcupine_params.pv") },
    );
    await WebVoiceProcessor.subscribe(worker);
    report({ active: true, reason: null });
    return {
      stop: async () => {
        try {
          await WebVoiceProcessor.unsubscribe(worker);
        } finally {
          await worker.release();
        }
        report({ active: false, reason: null });
      },
    };
  } catch (err) {
    report({
      active: false,
      reason:
        err instanceof Error
          ? `Wake word failed: ${err.message}`
          : "Wake word failed to start.",
    });
    return null;
  }
}
