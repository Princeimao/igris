import React from "react";
import { motion } from "motion/react";
import { Music2, Sparkles, Timer } from "lucide-react";
import { cn } from "cn";
//import { IgrisModel } from "./IgrisModel";

export interface NotchLive {
  kind: "timer" | "media";
  text: string;
  /** base64 artwork for the media orb content (best-effort) */
  artwork?: string | null;
}

export type VoiceState = "listening" | "speaking" | null;

interface NotchCoreProps {
  hiveOnline: boolean | null;
  live: NotchLive | null;
  /** Voice activity shows a waveform marking, like the iPhone island. */
  voice: VoiceState;
  /** false while the dashboard owns the window — notch slides away. */
  visible: boolean;
  onHoverStart: () => void;
  onOpen: () => void;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** iPhone-style live waveform bars. */
export const Waveform: React.FC<{ className?: string; barClass?: string }> = ({
  className = "",
  barClass = "bg-current",
}) => {
  return (
    <span className={`igris-eq flex items-center gap-[2.5px] ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-3 w-[3px] rounded-full ${barClass}`} />
      ))}
    </span>
  );
};

/**
 * iPhone Dynamic-Island-style notch: a black pill hugging the top edge.
 * Idle shows the core mark; timer / media / voice take over the pill with
 * activity-specific markings. Media also gets a separate side orb (with the
 * album art) whose hover opens just the mini player.
 */
export const NotchCore: React.FC<NotchCoreProps> = ({
  hiveOnline,
  live,
  voice,
  visible,
  onHoverStart,
  onOpen,
}) => {
  return (
    <motion.button
      type="button"
      aria-label="Open Igris"
      onMouseEnter={onHoverStart}
      onFocus={onHoverStart}
      onClick={onOpen}
      initial={{ y: -44, opacity: 0 }}
      animate={{
        y: visible ? 0 : -44,
        opacity: visible ? 1 : 0,
        width: live || voice ? 248 : 172,
      }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "absolute left-1/2 top-0 z-30 flex h-9 -translate-x-1/2",
        "items-center justify-center gap-2 overflow-hidden px-3",
        "rounded-b-[18px] border border-white/10 border-t-0",
        "bg-black/92 text-white",
        "shadow-[0_12px_40px_rgba(0,0,0,0.5)]",
        "outline-none cursor-pointer",
      )}
    >
      {voice ? (
        <>
          <Waveform className="text-emerald-400" />
          <span className="text-[11px] font-semibold tracking-tight text-white/90">
            {voice === "listening" ? "Listening…" : "Speaking…"}
          </span>
          <span className="h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
        </>
      ) : live?.kind === "timer" ? (
        <>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white">
            <Timer size={12} strokeWidth={2.2} />
          </span>
          <span className="text-[11px] font-semibold tracking-tight text-white tabular-nums">
            {live.text}
          </span>
          <StatusDot hiveOnline={hiveOnline} />
        </>
      ) : live?.kind === "media" ? (
        <>
          {live.artwork ? (
            <img
              src={`data:image/jpeg;base64,${live.artwork}`}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1DB954] text-white">
              <Music2 size={12} strokeWidth={2.2} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-tight text-white/90">
            {live.text}
          </span>
          <Waveform className="shrink-0 text-white/50" barClass="bg-current" />
        </>
      ) : (
        <>
          {/* <IgrisModel
            size={22}
            spin={0.3}
            fallback={
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-black">
                <Sparkles size={12} strokeWidth={2.2} />
              </span>
            }
          />
          <span className="text-[11px] font-medium tracking-wide text-white/80">
            igris
          </span> */}
          <StatusDot hiveOnline={hiveOnline} />
        </>
      )}
    </motion.button>
  );
};

function StatusDot({ hiveOnline }: { hiveOnline: boolean | null }) {
  return (
    <span
      className={cn(
        "h-[7px] w-[7px] rounded-full",
        hiveOnline === null && "bg-white/25",
        hiveOnline === true &&
          "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]",
        hiveOnline === false && "bg-amber-400/80",
      )}
    />
  );
}
