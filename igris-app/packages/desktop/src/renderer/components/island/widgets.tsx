import React, { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
  CloudSun,
  GitBranch,
  ListMusic,
  Mail,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  SquarePen,
  StickyNote,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import type {
  FocusTimerControls,
  FocusTimerState,
  MediaCommandName,
  MediaCommandResult,
  NowPlayingInfo,
  Section,
} from "./island-types";
import { formatClock } from "./NotchCore";
// import { IgrisModel } from "./IgrisModel";
import { AnimatePresence, motion } from "motion/react";

export interface WidgetProps {
  timer: FocusTimerState;
  timerControls: FocusTimerControls;
  nowPlaying: NowPlayingInfo | null;
  mediaCommand: (
    command: MediaCommandName,
    positionSec?: number,
  ) => Promise<MediaCommandResult | undefined>;
}

export interface WidgetProps {
  timer: FocusTimerState;
  timerControls: FocusTimerControls;
  nowPlaying: NowPlayingInfo | null;
}

// ---------------------------------------------------------------------------
// Local persistence (device-only; nothing leaves the machine).
// ---------------------------------------------------------------------------

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full / unavailable — UI still works for the session.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function openExternal(url: string) {
  window.igris?.openExternal?.(url)?.catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Shell + heading (Apple card discipline: tight tracking on titles,
// small positive tracking on eyebrows, generous radii).
// ---------------------------------------------------------------------------

function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`h-full w-full gap-0 overflow-y-auto border-0 py-0 shadow-none ${className}`}
    >
      {children}
    </Card>
  );
}

function CardHeading({
  icon,
  title,
  subtitle,
  dark = false,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  dark?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-center gap-2 px-5 pt-5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
          dark ? "bg-white/10 text-white" : "bg-white/60 text-black"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <CardTitle className="text-[15px] leading-none tracking-tight">
          {title}
        </CardTitle>
        <span
          className={`mt-1 block text-[9px] tracking-wide ${dark ? "text-white/35" : "text-black/35"}`}
        >
          {subtitle}
        </span>
      </span>
      {trailing}
    </CardHeader>
  );
}

// ---------------------------------------------------------------------------
// TODAY → Todo (Apple Reminders style, device-local).
// ---------------------------------------------------------------------------

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

const TodoWidget = () => {
  const [todos, setTodos] = useLocalStorage<Todo[]>("igris:todos", []);
  const [draft, setDraft] = useState("");

  const doneCount = todos.filter((t) => t.done).length;

  const add = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTodos([...todos, { id: `${Date.now()}`, text, done: false }]);
    setDraft("");
  };

  return (
    <Shell className="bg-white text-black">
      <CardHeading
        icon={<CalendarDays size={16} />}
        title="Today"
        subtitle={`${doneCount} of ${todos.length} done`}
      />
      <CardContent className="px-5 pb-5">
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.07]">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{
              width: `${todos.length ? (doneCount / todos.length) * 100 : 0}%`,
            }}
          />
        </div>

        <div className="mt-3 space-y-1">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-black/[0.03]"
            >
              <button
                type="button"
                aria-label={todo.done ? "Mark open" : "Mark done"}
                onClick={() =>
                  setTodos(
                    todos.map((t) =>
                      t.id === todo.id ? { ...t, done: !t.done } : t,
                    ),
                  )
                }
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors active:scale-90 ${
                  todo.done
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-black/20 text-transparent hover:border-blue-500"
                }`}
              >
                <Check size={11} strokeWidth={3} />
              </button>
              <span
                className={`flex-1 text-[12px] ${
                  todo.done ? "text-black/30 line-through" : "text-black/80"
                }`}
              >
                {todo.text}
              </span>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => setTodos(todos.filter((t) => t.id !== todo.id))}
                className="text-black/20 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {todos.length === 0 && (
            <div className="py-6 text-center text-[11px] text-black/30">
              All clear. Enjoy your day.
            </div>
          )}
        </div>

        <form onSubmit={add} className="mt-2 flex items-center gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New reminder…"
            className="h-8 border-0 bg-black/[0.045] text-[11px] shadow-none placeholder:text-black/30 focus-visible:ring-1 focus-visible:ring-black/10"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!draft.trim()}
            aria-label="Add"
            className="h-8 w-8 shrink-0 rounded-full bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
          >
            <Plus size={14} />
          </Button>
        </form>
      </CardContent>
    </Shell>
  );
};

const PRESETS = [
  { label: "25 min", sec: 25 * 60 },
  { label: "5 min", sec: 5 * 60 },
  { label: "15 min", sec: 15 * 60 },
];
const RADIUS = 67;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TimeWidget = ({ timer, timerControls }: WidgetProps) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");

  const progress = timer.totalSec
    ? Math.min(1, Math.max(0, 1 - timer.leftSec / timer.totalSec))
    : 0;

  const isComplete = timer.totalSec > 0 && timer.leftSec <= 0 && !timer.running;
  const isStarted = timer.totalSec > 0 && timer.leftSec < timer.totalSec;
  const circumferenceOffset = CIRCUMFERENCE * (1 - progress);

  const handleCustomTime = () => {
    const minutes = Number(customMinutes);
    if (!minutes || minutes <= 0) return;
    timerControls.setPreset(minutes * 60);

    setCustomMinutes("");
    setCustomOpen(false);
  };

  return (
    <Shell className="relative overflow-hidden bg-[#e9e4ff] text-black">
      {/* subtle ambient glow */}
      <motion.div
        className="pointer-events-none absolute -right-16 -top-20 size-40 rounded-full bg-[#8b7bea]/20 blur-3xl"
        animate={{
          scale: timer.running ? [1, 1.15, 1] : 1,
          opacity: timer.running ? [0.35, 0.6, 0.35] : 0.35,
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <CardHeading
        icon={
          <div
            className={`
              flex size-8 items-center justify-center rounded-xl
              bg-white/70
              transition-all duration-300
              ${
                timer.running
                  ? "bg-[#5d4bc1] text-white shadow-lg shadow-[#5d4bc1]/20"
                  : ""
              }
            `}
          >
            <Clock3 size={15} />
          </div>
        }
        title="Focus"
        subtitle={
          timer.running
            ? "Deep work in progress"
            : isComplete
              ? "Session complete"
              : isStarted
                ? "Session paused"
                : "Ready when you are"
        }
        trailing={
          timer.running ? (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2 py-1 text-[8px] font-semibold text-orange-700">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-orange-500" />
                <span className="relative size-1.5 rounded-full bg-orange-500" />
              </span>
              Live
            </span>
          ) : null
        }
      />

      <CardContent className="relative flex min-h-0 flex-1 flex-col px-5 pb-4">
        {/* PRESETS */}
        <div className="mt-1 flex items-center gap-1 rounded-full bg-black/[0.045] p-1">
          {PRESETS.map((preset) => {
            const active = timer.totalSec === preset.sec;

            return (
              <button
                key={preset.sec}
                type="button"
                onClick={() => {
                  setCustomOpen(false);
                  timerControls.setPreset(preset.sec);
                }}
                className={`
                  flex-1 rounded-full px-2 py-1.5
                  text-[9px] font-medium
                  transition-all duration-200
                  active:scale-95
                  ${
                    active
                      ? "bg-white text-black shadow-sm"
                      : "text-black/40 hover:text-black/70"
                  }
                `}
              >
                {preset.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCustomOpen((value) => !value)}
            className={`
              flex size-7 shrink-0 items-center justify-center
              rounded-full
              transition-all
              active:scale-90
              ${
                customOpen
                  ? "bg-[#5d4bc1] text-white"
                  : "text-black/40 hover:bg-white hover:text-black"
              }
            `}
            aria-label="Custom duration"
          >
            <Settings2 size={12} />
          </button>
        </div>

        {/* CUSTOM DURATION */}
        <AnimatePresence initial={false}>
          {customOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -4 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -4 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/55 p-2">
                <input
                  autoFocus
                  type="number"
                  min="1"
                  max="999"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCustomTime();
                    }
                  }}
                  placeholder="Minutes"
                  className="
                    h-8 min-w-0 flex-1 rounded-lg
                    bg-white/70 px-3
                    text-[10px] outline-none
                    placeholder:text-black/25
                    focus:ring-2 focus:ring-[#5d4bc1]/20
                  "
                />

                <button
                  type="button"
                  onClick={handleCustomTime}
                  disabled={!customMinutes}
                  className="
                    h-8 rounded-lg bg-[#5d4bc1]
                    px-3 text-[9px] font-semibold text-white
                    disabled:opacity-40
                    active:scale-95
                  "
                >
                  Set
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TIMER */}
        <div className="flex min-h-0 flex-1 items-center justify-center py-3">
          <div className="relative size-[150px]">
            {/* background glow */}
            <motion.div
              className="absolute inset-5 rounded-full bg-[#5d4bc1]/10 blur-xl"
              animate={{
                scale: timer.running ? [1, 1.12, 1] : 1,
                opacity: timer.running ? [0.4, 0.8, 0.4] : 0.4,
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            <svg
              viewBox="0 0 160 160"
              className="relative size-full -rotate-90"
            >
              {/* track */}
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke="rgba(93,75,193,0.10)"
                strokeWidth="13"
              />

              {/* progress */}
              <motion.circle
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke="#5d4bc1"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                animate={{
                  strokeDashoffset: circumferenceOffset,
                }}
                transition={{
                  duration: 0.5,
                  ease: "easeOut",
                }}
              />
            </svg>

            {/* timer content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                key={timer.leftSec}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                className="
                  font-mono text-[36px]
                  font-semibold leading-none
                  tracking-[-2.5px]
                  tabular-nums
                "
              >
                {formatClock(timer.leftSec)}
              </motion.div>

              <span className="mt-2 text-[8px] font-medium uppercase tracking-[0.18em] text-black/35">
                {isComplete
                  ? "Complete"
                  : timer.running
                    ? `${Math.round(progress * 100)}% focused`
                    : "Focus session"}
              </span>
            </div>
          </div>
        </div>

        {/* PROGRESS META */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[9px] font-medium text-black/35">
            {timer.running
              ? "Stay focused"
              : isComplete
                ? "Nice work"
                : "Choose a duration"}
          </span>

          <span className="text-[9px] font-semibold text-black/45">
            {Math.round(progress * 100)}%
          </span>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isComplete}
            onClick={timer.running ? timerControls.pause : timerControls.start}
            className={`
              flex h-9 flex-1 items-center justify-center gap-1.5
              rounded-full
              text-[9px] font-semibold text-white
              transition-all
              active:scale-[0.97]
              disabled:opacity-50
              ${
                timer.running
                  ? "bg-black"
                  : "bg-[#5d4bc1] shadow-[0_8px_20px_-10px_rgba(93,75,193,0.9)]"
              }
            `}
          >
            {timer.running ? (
              <>
                <Pause size={11} fill="currentColor" />
                Pause
              </>
            ) : isComplete ? (
              <>
                <Check size={11} />
                Complete
              </>
            ) : (
              <>
                <Play size={11} fill="currentColor" />
                {isStarted ? "Resume" : "Start focus"}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={timerControls.reset}
            className="
              flex size-9 items-center justify-center
              rounded-full bg-white/60
              text-black/40
              transition-all
              hover:bg-white hover:text-black/70
              active:scale-90
            "
            aria-label="Reset timer"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </CardContent>
    </Shell>
  );
};

function appDisplayName(app?: string): string {
  if (!app) return "System media";
  const lower = app.toLowerCase();
  if (lower.includes("spotify")) return "Spotify";
  if (lower.includes("chrome")) return "Chrome";
  if (lower.includes("edge")) return "Edge";
  if (lower.includes("firefox")) return "Firefox";
  return app;
}

import { cn } from "cn";

const SpotifyWidget = ({ nowPlaying, mediaCommand }: WidgetProps) => {
  const live =
    nowPlaying?.session && Boolean(nowPlaying.title || nowPlaying.artist);

  const playing = nowPlaying?.status === "Playing";

  const position = Math.max(0, nowPlaying?.positionSec ?? 0);

  const duration = Math.max(0, nowPlaying?.durationSec ?? 0);

  const progress =
    duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;

    const rect = e.currentTarget.getBoundingClientRect();

    const fraction = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );

    mediaCommand("seek", fraction * duration);
  };

  return (
    <Shell className="relative overflow-hidden bg-[#0b0b0e] text-white">
      {/* =====================================================
          BLURRED ALBUM ART BACKGROUND
      ====================================================== */}

      <AnimatePresence mode="sync">
        {live && nowPlaying?.artwork && (
          <motion.div
            key={nowPlaying.artwork}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-none absolute inset-0"
          >
            <motion.img
              src={`data:image/jpeg;base64,${nowPlaying.artwork}`}
              alt=""
              className="
                absolute inset-[-15%]
                h-[130%] w-[130%]
                object-cover
                blur-[45px]
              "
              animate={{
                scale: playing ? [1.05, 1.1, 1.05] : 1.05,
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* darken artwork */}
            <div className="absolute inset-0 bg-black/55" />

            {/* vertical cinematic gradient */}
            <div
              className="
                absolute inset-0
                bg-gradient-to-b
                from-black/10
                via-black/35
                to-[#0b0b0e]
              "
            />

            {/* extra soft vignette */}
            <div
              className="
                absolute inset-0
                bg-[radial-gradient(
                  circle_at_center,
                  transparent_10%,
                  rgba(0,0,0,.35)_100%
                )]
              "
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* =====================================================
          CONTENT
      ====================================================== */}

      <div className="relative flex h-full flex-col">
        <CardHeading
          dark
          icon={
            <div
              className="
                flex size-8 items-center justify-center
                rounded-xl
                bg-[#1DB954]/15
                text-[#1DB954]
                backdrop-blur-md
              "
            >
              <Music2 size={15} />
            </div>
          }
          title="Spotify"
          subtitle={live ? appDisplayName(nowPlaying?.app) : "Nothing playing"}
          trailing={
            live ? (
              <div className="flex items-center gap-1.5">
                {playing && <PlayingBars />}

                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-[8px] font-semibold",
                    playing
                      ? "bg-[#1DB954]/15 text-[#1DB954]"
                      : "bg-white/10 text-white/40",
                  )}
                >
                  {playing ? "Playing" : "Paused"}
                </span>
              </div>
            ) : undefined
          }
        />

        <CardContent className="relative flex min-h-0 flex-1 flex-col px-5 pb-5">
          {live ? (
            <>
              <div className="flex flex-1 items-center justify-center py-4">
                <motion.div
                  className="
                    relative
                    aspect-square
                    w-[min(58%,190px)]
                    max-w-[190px]
                    overflow-hidden
                    rounded-[18px]
                    shadow-[0_25px_70px_rgba(0,0,0,.55)]
                  "
                  animate={{
                    y: playing ? [0, -2, 0] : 0,
                    scale: playing ? [1, 1.008, 1] : 1,
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {nowPlaying?.artwork ? (
                    <motion.img
                      key={nowPlaying.artwork}
                      src={`data:image/jpeg;base64,${nowPlaying.artwork}`}
                      alt="Album art"
                      initial={{
                        opacity: 0,
                        scale: 1.08,
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: "easeOut",
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="
                        flex h-full w-full
                        items-center justify-center
                        bg-white/10
                      "
                    >
                      <Music2 size={42} className="text-white/25" />
                    </div>
                  )}

                  {playing && (
                    <motion.div
                      className="
                        pointer-events-none absolute inset-0
                        rounded-[18px]
                        ring-1 ring-white/20
                      "
                      animate={{
                        opacity: [0.3, 0.7, 0.3],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                      }}
                    />
                  )}
                </motion.div>
              </div>

              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${nowPlaying?.title}-${nowPlaying?.artist}`}
                    initial={{
                      opacity: 0,
                      y: 8,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      y: -8,
                    }}
                    transition={{
                      duration: 0.25,
                    }}
                  >
                    <div className="truncate text-[16px] font-bold tracking-[-0.02em]">
                      {nowPlaying?.title ?? "Unknown title"}
                    </div>

                    <div className="mt-1 truncate text-[10px] text-white/45">
                      {[nowPlaying?.artist, nowPlaying?.album]
                        .filter(Boolean)
                        .join(" · ") || "Unknown artist"}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {duration > 0 && (
                <div className="mt-4">
                  <div
                    role="slider"
                    aria-label="Track progress"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={position}
                    onClick={seek}
                    className="
                      group relative
                      h-5 cursor-pointer
                      flex items-center
                    "
                  >
                    <div
                      className="
                        relative h-[5px] w-full
                        overflow-visible
                        rounded-full
                        bg-white/15
                      "
                    >
                      <motion.div
                        className="
                          absolute left-0 top-0
                          h-full rounded-full
                          bg-white
                        "
                        animate={{
                          width: `${progress * 100}%`,
                        }}
                        transition={{
                          duration: 0.25,
                          ease: "linear",
                        }}
                      />

                      <motion.div
                        className="
                          absolute top-1/2
                          size-3
                          -translate-y-1/2
                          rounded-full
                          bg-white
                          shadow-[0_0_12px_rgba(255,255,255,.45)]
                        "
                        animate={{
                          left: `calc(${progress * 100}% - 6px)`,
                        }}
                        transition={{
                          duration: 0.25,
                          ease: "linear",
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-[8px] font-medium tabular-nums text-white/35">
                    <span>{formatClock(position)}</span>

                    <span>{formatClock(duration)}</span>
                  </div>
                </div>
              )}

              {/* =================================================
                  PLAYER CONTROLS
              ================================================== */}

              <div className="mt-3 flex items-center justify-between">
                {/* Left */}
                <button
                  type="button"
                  aria-label="Queue"
                  className="
                    flex size-8
                    items-center justify-center
                    rounded-full
                    text-white/35
                    transition-colors
                    hover:text-white
                  "
                >
                  <ListMusic size={15} />
                </button>

                {/* Main controls */}
                <div className="flex items-center gap-7">
                  <button
                    type="button"
                    aria-label="Previous track"
                    onClick={() => mediaCommand("prev")}
                    className="
                      text-white/60
                      transition-all
                      hover:text-white
                      active:scale-75
                    "
                  >
                    <SkipBack size={19} fill="currentColor" />
                  </button>

                  <motion.button
                    type="button"
                    aria-label={playing ? "Pause" : "Play"}
                    onClick={() => mediaCommand("toggle")}
                    whileHover={{
                      scale: 1.06,
                    }}
                    whileTap={{
                      scale: 0.9,
                    }}
                    className="
                      flex size-[48px]
                      items-center justify-center
                      rounded-full
                      bg-white
                      text-black
                      shadow-[0_8px_30px_rgba(0,0,0,.45)]
                    "
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {playing ? (
                        <motion.div
                          key="pause"
                          initial={{
                            opacity: 0,
                            scale: 0.6,
                          }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                          }}
                          exit={{
                            opacity: 0,
                            scale: 0.6,
                          }}
                        >
                          <Pause size={18} fill="currentColor" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="play"
                          initial={{
                            opacity: 0,
                            scale: 0.6,
                          }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                          }}
                          exit={{
                            opacity: 0,
                            scale: 0.6,
                          }}
                        >
                          <Play
                            size={18}
                            fill="currentColor"
                            className="ml-0.5"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <button
                    type="button"
                    aria-label="Next track"
                    onClick={() => mediaCommand("next")}
                    className="
                      text-white/60
                      transition-all
                      hover:text-white
                      active:scale-75
                    "
                  >
                    <SkipForward size={19} fill="currentColor" />
                  </button>
                </div>

                {/* Right */}
                <VolumeControl
                  onChange={(value) => mediaCommand("volume", value)}
                />
              </div>
            </>
          ) : (
            <EmptySpotify />
          )}
        </CardContent>
      </div>
    </Shell>
  );
};

const WeatherWidget = () => {
  const [sync, setSync] = useLocalStorage("igris:weather-sync", false);

  return (
    <Shell className="bg-[#dcecf5] text-black">
      <CardHeading
        icon={<CloudSun size={16} />}
        title="Weather"
        subtitle="Windows Weather"
        trailing={
          <Badge
            variant="secondary"
            className="rounded-full bg-black/[0.05] text-[9px] text-black/50"
          >
            Preview
          </Badge>
        }
      />
      <CardContent className="flex h-full flex-col px-5 pb-5">
        <div className="mt-2 flex items-center justify-between">
          <div>
            <div className="text-[54px] font-semibold leading-none tracking-[-3px]">
              27°
            </div>
            <div className="mt-2 text-[10px] text-black/40">Partly cloudy</div>
          </div>
          <CloudSun size={64} strokeWidth={1.2} className="text-orange-400" />
        </div>

        <div className="mt-auto flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2.5 pt-2.5">
          <div>
            <div className="text-[10px] font-semibold">Sync with Windows</div>
            <div className="text-[9px] text-black/40">
              {sync
                ? "Will mirror the taskbar widget"
                : "Match the taskbar widget"}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sync}
            onClick={() => setSync(!sync)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors active:scale-95 ${
              sync ? "bg-blue-500" : "bg-black/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                sync ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </CardContent>
    </Shell>
  );
};

const RemindersWidget = () => {
  const reminders = [
    "Review design system",
    "Reply to Aarav",
    "Push desktop agent",
    "Plan tomorrow",
  ];
  return (
    <Shell className="bg-[#f6e3d6] text-black">
      <CardHeading
        icon={<Bell size={16} />}
        title="Reminders"
        subtitle="4 open"
      />
      <CardContent className="space-y-2 px-5 pb-5">
        {reminders.map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[14px] bg-white/45 p-2.5"
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                index === 0
                  ? "border-black bg-black text-white"
                  : "border-black/15"
              }`}
            >
              {index === 0 && <Check size={11} />}
            </div>
            <span
              className={`text-[11px] ${index === 0 ? "text-black/30 line-through" : ""}`}
            >
              {item}
            </span>
          </div>
        ))}
      </CardContent>
    </Shell>
  );
};

import type { GitHubProfile } from "./island-types";
import { AnimatedCircularProgressBar } from "../ui/animated-circular-progress-bar";
import { Slider } from "../ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const GitHubWidget = () => {
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [checked, setChecked] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // One-time migration: a token stored by older builds (localStorage) is
  // moved into the OS vault once, then wiped from renderer storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await window.igris?.githubProfile?.();
        if (!status) return;
        if (status.connected) {
          if (!cancelled) {
            setProfile(status.profile);
            setChecked(true);
          }
          return;
        }
        const legacy = localStorage.getItem("igris:github");
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy) as { token?: string };
            if (parsed?.token) {
              const res = await window.igris?.githubConnect?.(parsed.token);
              if (res?.ok) {
                if (!cancelled) setProfile(res.profile);
              }
            }
          } catch {
            // corrupt legacy entry — drop it below
          }
          localStorage.removeItem("igris:github");
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const token = tokenDraft.trim();
    if (!token || busy) return;
    setBusy(true);
    setConnectError(null);
    try {
      const res = await window.igris?.githubConnect?.(token);
      if (!res) throw new Error("Vault unavailable.");
      if (!res.ok) throw new Error(res.error || "GitHub rejected the token.");
      setProfile(res.profile);
      setTokenDraft("");
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Could not verify that token.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      await window.igris?.githubDisconnect?.();
    } finally {
      setProfile(null);
    }
  };

  return (
    <Shell className="bg-[#e8e8ec] text-black">
      <CardHeading
        icon={<GitBranch size={16} />}
        title="GitHub"
        subtitle="Direct connection"
        trailing={
          profile ? (
            <Badge className="rounded-full bg-emerald-500/15 text-[9px] text-emerald-700 hover:bg-emerald-500/15">
              Connected
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="rounded-full bg-black/[0.05] text-[9px] text-black/50"
            >
              Not connected
            </Badge>
          )
        }
      />
      <CardContent className="px-5 pb-5">
        {profile ? (
          <div>
            <div className="mt-2 flex items-center gap-3">
              <img
                src={profile.avatarUrl}
                alt={profile.login}
                className="h-11 w-11 rounded-full border border-black/10"
              />
              <div>
                <div className="text-[13px] font-semibold tracking-tight">
                  {profile.login}
                </div>
                <div className="text-[9px] text-black/40">
                  {profile.publicRepos} repos · {profile.followers} followers
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={disconnect}
              className="mt-4 h-8 w-full rounded-full text-[10px] text-black/50 hover:bg-black/[0.05] hover:text-black"
            >
              Disconnect
            </Button>
          </div>
        ) : !checked ? (
          <div className="py-8 text-center text-[11px] text-black/35">
            Checking OS vault…
          </div>
        ) : (
          <form onSubmit={connect} className="mt-2">
            <div className="text-[11px] leading-relaxed text-black/55">
              Paste a personal access token. It is sealed into the OS keychain —
              the UI never holds it.
            </div>
            <Input
              type="password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="ghp_…"
              className="mt-2.5 h-8 border-0 bg-white/70 font-mono text-[11px] shadow-none placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/10"
            />
            {connectError && (
              <div className="mt-1.5 text-[10px] text-red-500">
                {connectError}
              </div>
            )}
            <Button
              type="submit"
              disabled={!tokenDraft.trim() || busy}
              className="mt-2.5 h-8 w-full rounded-full bg-black text-[11px] text-white hover:bg-black/85 active:scale-[0.98]"
            >
              {busy ? "Verifying…" : "Connect directly"}
            </Button>
            <button
              type="button"
              onClick={() => openExternal("https://github.com/settings/tokens")}
              className="mt-1.5 w-full text-center text-[10px] text-black/40 underline-offset-2 hover:text-black hover:underline"
            >
              Get a token on github.com
            </button>
          </form>
        )}
      </CardContent>
    </Shell>
  );
};

const ClaudeWidget = () => (
  <Shell className="bg-[#eee4d8] text-black">
    <CardHeading
      icon={
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#d97745] font-semibold text-white">
          C
        </span>
      }
      title="Claude"
      subtitle="Latest conversation"
    />
    <CardContent className="flex h-full flex-col px-5 pb-5">
      <div className="mt-auto text-[22px] font-semibold tracking-tight">
        Product architecture
      </div>
    </CardContent>
  </Shell>
);

interface Sticky {
  id: string;
  text: string;
  color: string;
}

const STICKY_COLORS = ["#fff3aa", "#ffd9e3", "#d6ecff", "#d9f5d6"];

const NotesWidget = () => {
  const [stickies, setStickies] = useLocalStorage<Sticky[]>(
    "igris:sticky-notes",
    [
      {
        id: "1",
        text: "Desktop intelligence layer — remember context across devices.",
        color: STICKY_COLORS[0]!,
      },
    ],
  );

  const add = () => {
    setStickies([
      ...stickies,
      {
        id: `${Date.now()}`,
        text: "",
        color: STICKY_COLORS[stickies.length % STICKY_COLORS.length]!,
      },
    ]);
  };

  return (
    <Shell className="bg-[#faf7f0] text-black">
      <CardHeading
        icon={<MessageCircle size={16} />}
        title="Sticky notes"
        subtitle={`${stickies.length} notes · on this device`}
        trailing={
          <Button
            size="icon-sm"
            onClick={add}
            aria-label="New note"
            className="h-7 w-7 rounded-full bg-black text-white hover:bg-black/85 active:scale-95"
          >
            <Plus size={14} />
          </Button>
        }
      />
      <CardContent className="px-5 pb-5">
        {stickies.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <StickyNote size={22} className="text-black/20" />
            <div className="mt-2 text-[11px] text-black/35">
              No notes yet — tap + to stick one.
            </div>
          </div>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2">
          {stickies.map((note) => (
            <div
              key={note.id}
              style={{ backgroundColor: note.color }}
              className="group relative rounded-[6px] rounded-tr-[16px] p-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.10)]"
            >
              <button
                type="button"
                aria-label="Delete note"
                onClick={() =>
                  setStickies(stickies.filter((s) => s.id !== note.id))
                }
                className="absolute right-1.5 top-1.5 text-black/25 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
              <textarea
                value={note.text}
                onChange={(e) =>
                  setStickies(
                    stickies.map((s) =>
                      s.id === note.id ? { ...s, text: e.target.value } : s,
                    ),
                  )
                }
                placeholder="Write…"
                rows={3}
                className="w-full resize-none bg-transparent text-[11px] leading-relaxed text-black/80 outline-none placeholder:text-black/30"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Shell>
  );
};

const GmailWidget = () => (
  <Shell className="bg-white text-black">
    <CardHeading
      icon={<Mail size={16} />}
      title="Gmail"
      subtitle="Quick actions"
    />
    <CardContent className="flex h-full flex-col px-5 pb-5">
      <div className="mt-2 text-[11px] leading-relaxed text-black/55">
        Jump straight into your inbox or start a message. Unread sync arrives
        with Google sign-in.
      </div>
      <div className="mt-auto space-y-2 pt-4">
        <Button
          onClick={() => openExternal("https://mail.google.com")}
          className="h-9 w-full rounded-full bg-black text-[11px] text-white hover:bg-black/85 active:scale-[0.98]"
        >
          Open inbox
        </Button>
        <Button
          variant="ghost"
          onClick={() => openExternal("https://mail.google.com/mail/?view=cm")}
          className="h-9 w-full rounded-full text-[11px] text-black/60 hover:bg-black/[0.05] hover:text-black active:scale-[0.98]"
        >
          <SquarePen size={13} /> Compose
        </Button>
      </div>
    </CardContent>
  </Shell>
);

export function WidgetForSection({
  section,
  timer,
  timerControls,
  nowPlaying,
  mediaCommand,
}: {
  section: Section;
} & WidgetProps) {
  const shared = { timer, timerControls, nowPlaying, mediaCommand };
  switch (section) {
    case "time":
      return <TimeWidget {...shared} />;
    case "music":
      return <SpotifyWidget {...shared} />;
    case "gmail":
      return <GmailWidget />;
    case "weather":
      return <WeatherWidget />;
    case "reminders":
      return <RemindersWidget />;
    case "github":
      return <GitHubWidget />;
    case "claude":
      return <ClaudeWidget />;
    case "notes":
      return <NotesWidget />;
    case "today":
    default:
      return <TodoWidget />;
  }
}

const PlayingBars = () => {
  return (
    <span className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full bg-[#1DB954]"
          animate={{
            height: [3, 9, 5, 8, 3],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
};

const VolumeControl = ({ onChange }: { onChange: (value: number) => void }) => {
  const [volume, setVolume] = React.useState(75);

  const updateVolume = (values: number[]) => {
    const value = values[0] ?? 0;

    setVolume(value);
    onChange(value);
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Volume"
          className="
            flex size-8
            items-center justify-center
            rounded-full
            text-white/40
            transition-all
            hover:bg-white/10
            hover:text-white
            active:scale-90
          "
        >
          <VolumeIcon size={15} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="
          w-[190px]
          rounded-2xl
          border-white/10
          bg-[#18181c]/95
          p-3
          text-white
          shadow-2xl
          backdrop-blur-xl
        "
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-medium text-white/45">Volume</span>

          <span className="text-[9px] tabular-nums text-white/35">
            {volume}%
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Volume1 size={13} className="shrink-0 text-white/35" />

          <Slider
            value={[volume]}
            min={0}
            max={100}
            step={1}
            onValueChange={updateVolume}
            className="flex-1"
          />

          <Volume2 size={13} className="shrink-0 text-white/35" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

const EmptySpotify = () => {
  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: 0.97,
      }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      className="
        flex flex-1
        flex-col
        items-center
        justify-center
        text-center
      "
    >
      <motion.div
        animate={{
          scale: [1, 1.04, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="
          flex size-20
          items-center justify-center
          rounded-[22px]
          bg-white/[0.06]
          ring-1 ring-white/[0.07]
        "
      >
        <Music2 size={30} className="text-white/20" />
      </motion.div>

      <div className="mt-5 text-[13px] font-semibold">Nothing playing</div>

      <div className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-white/35">
        Start a song in Spotify and it will appear here automatically.
      </div>

      <button
        type="button"
        onClick={() => openExternal("https://open.spotify.com")}
        className="
          mt-4
          rounded-full
          bg-[#1DB954]
          px-5 py-2
          text-[10px]
          font-semibold
          text-black
          transition-all
          hover:bg-[#1ed760]
          active:scale-95
        "
      >
        Open Spotify
      </button>
    </motion.div>
  );
};
