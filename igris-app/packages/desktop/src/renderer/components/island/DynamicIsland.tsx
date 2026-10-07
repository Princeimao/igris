import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "motion/react";
import {
  type ChatResult,
  type FocusTimerControls,
  type FocusTimerState,
  type IslandPhase,
  type MediaCommandName,
  type MediaCommandResult,
  type NowPlayingInfo,
  type Section,
} from "./island-types";
import { NotchCore, formatClock, type NotchLive, type VoiceState } from "./NotchCore";
import { MediaOrb } from "./MediaOrb";
import { startWakeWord } from "../voice/wakeword";
import { Dashboard } from "./Dashboard";

export const DynamicIsland: React.FC = () => {
  const [phase, setPhase] = useState<IslandPhase>("idle");
  const [activeSection, setActiveSection] = useState<Section>("today");

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<ChatResult["route"] | null>(null);

  const [hiveOnline, setHiveOnline] = useState<boolean | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  /** True when an answer/error arrived that the user hasn't seen. */
  const [unseen, setUnseen] = useState(false);

  // Fresh snapshot for timer/push callbacks (avoids stale closures).
  const latest = useRef({ loading: false, response: "", error: null as string | null });
  latest.current = {
    loading,
    response,
    error,
  };

  // -- Voice activity (notch waveform) ------------------------------------------
  const [listening, setListening] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const voice: VoiceState = listening
    ? "listening"
    : ttsSpeaking
      ? "speaking"
      : null;

  // External listen requests (wake word drives the mic button).
  const [listenSignal, setListenSignal] = useState(0);

  // -- Mini player (orb hover expands only the player) ----------------------------
  const [miniOpen, setMiniOpen] = useState(false);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelMiniClose = useCallback(() => {
    if (miniTimer.current) {
      clearTimeout(miniTimer.current);
      miniTimer.current = null;
    }
  }, []);

  const openMini = useCallback(() => {
    cancelMiniClose();
    setMiniOpen(true);
  }, [cancelMiniClose]);

  const scheduleMiniClose = useCallback(() => {
    cancelMiniClose();
    miniTimer.current = setTimeout(() => setMiniOpen(false), 250);
  }, [cancelMiniClose]);

  useEffect(
    () => () => {
      if (miniTimer.current) clearTimeout(miniTimer.current);
    },
    [],
  );

  // -- Focus timer ------------------------------------------------------------
  const [timerTotal, setTimerTotal] = useState(25 * 60);
  const [timerLeft, setTimerLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerLeft((left) => {
        if (left <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const timerControls: FocusTimerControls = {
    start: () => {
      setTimerLeft((left) => (left <= 0 ? timerTotal : left));
      setTimerRunning(true);
    },
    pause: () => setTimerRunning(false),
    reset: () => {
      setTimerRunning(false);
      setTimerLeft(timerTotal);
    },
    setPreset: (sec: number) => {
      setTimerRunning(false);
      setTimerTotal(sec);
      setTimerLeft(sec);
    },
  };

  const timer: FocusTimerState = {
    totalSec: timerTotal,
    leftSec: timerLeft,
    running: timerRunning,
  };

  // -- Now playing (OS media layer poll) --------------------------------------
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchMedia() {
      try {
        const info = await window.igris?.mediaNowPlaying?.();
        if (!cancelled && info) setNowPlaying(info);
      } catch {
        // OS media layer unavailable — panel shows empty state.
      }
    }
    fetchMedia();
    const id = setInterval(fetchMedia, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // -- System mute ---------------------------------------------------------------
  const [muted, setMuted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchMute() {
      try {
        const state = await window.igris?.systemMuteGet?.();
        if (!cancelled && state?.ok && typeof state.muted === "boolean") {
          setMuted(state.muted);
        }
      } catch {
        // mute query unavailable — toggle still works.
      }
    }
    fetchMute();
    const id = setInterval(fetchMute, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const toggleMute = useCallback(async () => {
    try {
      const state = await window.igris?.systemMuteToggle?.();
      if (state?.ok && typeof state.muted === "boolean") {
        setMuted(state.muted);
      } else {
        setMuted((m) => !(m ?? false));
      }
    } catch {
      setMuted((m) => !(m ?? false));
    }
  }, []);

  // -- Hive status -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        if (window.igris?.checkHiveStatus) {
          const online = await window.igris.checkHiveStatus();
          if (!cancelled) setHiveOnline(online);
        }
      } catch {
        if (!cancelled) setHiveOnline(false);
      }
    }
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // -- Window size + click-through follow the phase ------------------------------------
  // The mini player borrows the 'radial' hit-test mode (fully interactive).
  useEffect(() => {
    window.igris?.resizeWindow?.(phase === "dashboard");
    window.igris?.setInteractionMode?.(
      phase === "dashboard" ? "dashboard" : miniOpen ? "radial" : phase,
    );
  }, [phase, miniOpen]);

  // -- Phase transitions ---------------------------------------------------------------
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  useEffect(() => cancelCollapse, [cancelCollapse]);

  const openDashboard = useCallback(
    (section?: Section) => {
      cancelCollapse();
      if (section) setActiveSection(section);
      setPhase("dashboard");
    },
    [cancelCollapse],
  );

  const collapseDashboard = useCallback(() => {
    cancelCollapse();
    // An unread answer/error survives collapse as a notch badge.
    setUnseen(!!(latest.current.response || latest.current.error));
    setPhase("idle");
  }, [cancelCollapse]);

  /** Leaving the window dismisses the dashboard after a short grace period —
   * but never mid-answer: a рассказыва loading chat or an unseen result pins it. */
  const scheduleCollapse = useCallback(() => {
    if (latest.current.loading) return;
    cancelCollapse();
    collapseTimer.current = setTimeout(() => {
      if (latest.current.loading) return;
      setUnseen(!!(latest.current.response || latest.current.error));
      setPhase("idle");
    }, 300);
  }, [cancelCollapse]);

  // Main-process dismissal: the poll there watches the real cursor and
  // pushes this when it stays outside the dashboard window (~500ms).
  // Belt and suspenders next to the renderer mouseleave above.
  useEffect(() => {
    const off = window.igris?.onAutoCollapse?.(() => collapseDashboard());
    return () => {
      off?.();
    };
  }, [collapseDashboard]);

  const handleCloseWindow = useCallback(() => {
    window.igris?.closeWindow?.().catch(() => undefined);
  }, []);

  // -- Wake word ("Hey Igris", on-device) -----------------------------------------
  // Barge-in included: a wake during TTS cancels the speech, opens the panel,
  // and starts listening — one gesture from talking to commanding.
  const handleWake = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTtsSpeaking(false);
    if (phaseRef.current !== "dashboard") openDashboard();
    setListenSignal((n) => n + 1);
  }, [openDashboard]);

  useEffect(() => {
    let handle: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    startWakeWord(handleWake).then((h) => {
      if (cancelled) {
        h?.stop();
        return;
      }
      handle = h;
    });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [handleWake]);

  // -- Chat -----------------------------------------------------------------------------
  const speakText = useCallback(
    (text: string) => {
      if (!autoSpeak || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onstart = () => setTtsSpeaking(true);
      const done = () => setTtsSpeaking(false);
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    },
    [autoSpeak],
  );

  const submitChat = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query || loading) return;
      setLoading(true);
      setError(null);
      setResponse("");
      setRoute(null);
      try {
        const result = await window.igris.chat(query);
        setRoute(result.route);
        if (result.status === "failed") {
          setError(result.error || "Failed to process request");
        } else {
          setResponse(result.content);
          speakText(result.content);
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Unexpected communication failure",
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, speakText],
  );

  // -- Media transport (OS session control + refresh) ----------------------------------
  const refreshMedia = useCallback(async () => {
    try {
      const info = await window.igris?.mediaNowPlaying?.();
      if (info) setNowPlaying(info);
    } catch {
      // ignore — next poll recovers.
    }
  }, []);

  const sendMediaCommand = useCallback(
    async (
      command: MediaCommandName,
      positionSec?: number,
    ): Promise<MediaCommandResult | undefined> => {
      let result: MediaCommandResult | undefined;
      try {
        result = await window.igris?.mediaCommand?.(command, positionSec);
      } catch {
        result = undefined;
      }
      await refreshMedia();
      return result;
    },
    [refreshMedia],
  );
  const timerActive = timerRunning || timerLeft < timerTotal;
  const mediaTitle = nowPlaying?.session ? (nowPlaying.title ?? null) : null;
  const mediaArtist = nowPlaying?.session ? (nowPlaying.artist ?? null) : null;
  const mediaArtwork = nowPlaying?.session
    ? (nowPlaying.artwork ?? null)
    : null;
  const mediaIsPlaying = nowPlaying?.status === "Playing";
  const mediaLive = !!(nowPlaying?.session && (mediaTitle || mediaArtist));
  // Voice takes over the pill; otherwise timer wins over media.
  const live: NotchLive | null = useMemo(() => {
    if (voice) return null;
    if (timerActive) return { kind: "timer", text: formatClock(timerLeft) };
    if (mediaIsPlaying && mediaTitle) {
      return {
        kind: "media",
        artwork: mediaArtwork,
        text: mediaArtist ? `${mediaTitle} · ${mediaArtist}` : mediaTitle,
      };
    }
    return null;
  }, [
    voice,
    timerActive,
    timerLeft,
    mediaIsPlaying,
    mediaTitle,
    mediaArtist,
    mediaArtwork,
  ]);

  const inDashboard = phase === "dashboard";

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      onMouseEnter={cancelCollapse}
      onMouseLeave={scheduleCollapse}
    >
      <NotchCore
        hiveOnline={hiveOnline}
        live={live}
        voice={voice}
        visible={!inDashboard}
        onHoverStart={() => openDashboard()}
        onOpen={() => openDashboard()}
      />

      {mediaLive && !inDashboard && (
        <MediaOrb
          nowPlaying={nowPlaying}
          miniOpen={miniOpen}
          onOrbHover={openMini}
          onMiniEnter={cancelMiniClose}
          onMiniLeave={scheduleMiniClose}
          onCommand={sendMediaCommand}
        />
      )}

      <AnimatePresence>
        {inDashboard && (
          <Dashboard
            key="dashboard"
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            onCollapse={collapseDashboard}
            onClose={handleCloseWindow}
            autoSpeak={autoSpeak}
            onToggleSpeak={() => setAutoSpeak((v) => !v)}
            hiveOnline={hiveOnline}
            loading={loading}
            response={response}
            error={error}
            route={route}
            onSubmitChat={submitChat}
            muted={muted}
            onToggleMute={toggleMute}
            timer={timer}
            timerControls={timerControls}
            nowPlaying={nowPlaying}
            mediaCommand={sendMediaCommand}
            onListeningChange={setListening}
            listenSignal={listenSignal}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
