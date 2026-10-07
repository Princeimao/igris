import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatClock, Waveform } from "./NotchCore";
import type {
  MediaCommandName,
  MediaCommandResult,
  NowPlayingInfo,
} from "./island-types";

interface MediaOrbProps {
  nowPlaying: NowPlayingInfo | null;
  miniOpen: boolean;
  onOrbHover: () => void;
  onMiniEnter: () => void;
  onMiniLeave: () => void;
  onCommand: (
    command: MediaCommandName,
    positionSec?: number,
  ) => Promise<MediaCommandResult | undefined>;
}

export function mediaTitle(nowPlaying: NowPlayingInfo | null): string {
  if (nowPlaying?.title) return nowPlaying.title;
  return "Unknown title";
}

export function mediaSubtitle(nowPlaying: NowPlayingInfo | null): string {
  const parts = [nowPlaying?.artist, nowPlaying?.album].filter(Boolean);
  return parts.length ? (parts.join(" · ") as string) : "Unknown artist";
}

/**
 * iPhone-island style side orb: a small round element pinned to the notch
 * showing the album art (or a note mark). Hovering it expands ONLY the mini
 * player below — never the full dashboard.
 */
export const MediaOrb: React.FC<MediaOrbProps> = ({
  nowPlaying,
  miniOpen,
  onOrbHover,
  onMiniEnter,
  onMiniLeave,
  onCommand,
}) => {
  const playing = nowPlaying?.status === "Playing";

  return (
    <>
      <motion.button
        type="button"
        aria-label="Now playing"
        onMouseEnter={onOrbHover}
        onFocus={onOrbHover}
        onClick={onOrbHover}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="absolute left-[calc(50%+132px)] top-[2px] z-30 flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/92 shadow-[0_10px_30px_rgba(0,0,0,0.5)] outline-none"
      >
        {nowPlaying?.artwork ? (
          <img
            src={`data:image/jpeg;base64,${nowPlaying.artwork}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Music2 size={16} className="text-[#1DB954]" />
        )}
        {playing && (
          <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-black bg-[#1DB954]" />
        )}
      </motion.button>

      {miniOpen && (
        <MiniPlayer
          nowPlaying={nowPlaying}
          onEnter={onMiniEnter}
          onLeave={onMiniLeave}
          onCommand={onCommand}
        />
      )}
    </>
  );
};

function MiniPlayer({
  nowPlaying,
  onEnter,
  onLeave,
  onCommand,
}: {
  nowPlaying: NowPlayingInfo | null;
  onEnter: () => void;
  onLeave: () => void;
  onCommand: MediaOrbProps["onCommand"];
}) {
  const position = nowPlaying?.positionSec ?? 0;
  const duration = nowPlaying?.durationSec ?? 0;
  const playing = nowPlaying?.status === "Playing";
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onCommand("seek", frac * duration);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ transformOrigin: "100% 0%" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute left-[calc(50%-128px)] top-[48px] z-30 w-[300px] overflow-hidden rounded-[20px] border border-white/10 bg-black/92 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
    >
      <div className="flex items-center gap-3 p-3.5">
        {nowPlaying?.artwork ? (
          <img
            src={`data:image/jpeg;base64,${nowPlaying.artwork}`}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Music2 size={18} className="text-white/60" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold tracking-tight">
            {mediaTitle(nowPlaying)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-white/45">
            {mediaSubtitle(nowPlaying)}
          </div>
        </div>
        {playing ? (
          <Waveform className="shrink-0 text-[#1DB954]" />
        ) : (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-white/50">
            Paused
          </span>
        )}
      </div>

      {duration > 0 && (
        <div className="px-3.5">
          <div
            onClick={seek}
            className="group/bar h-1 cursor-pointer rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: `${Math.min(100, Math.max(0, (position / duration) * 100))}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/40">
            <span>{formatClock(position)}</span>
            <span>-{formatClock(Math.max(0, duration - position))}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-6 px-3.5 pb-3.5 pt-1">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => onCommand("prev")}
          className="text-white/70 outline-none transition-colors hover:text-white active:scale-90"
        >
          <SkipBack size={19} fill="currentColor" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => onCommand("toggle")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black outline-none transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" className="ml-0.5" />
          )}
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => onCommand("next")}
          className="text-white/70 outline-none transition-colors hover:text-white active:scale-90"
        >
          <SkipForward size={19} fill="currentColor" />
        </button>
      </div>
    </motion.div>
  );
}
