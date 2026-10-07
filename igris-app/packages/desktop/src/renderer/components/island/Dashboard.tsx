import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import gsap from "gsap";
import { ChevronDown, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { VoiceInput } from "../VoiceInput";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type ChatResult,
  type FocusTimerControls,
  type FocusTimerState,
  type MediaCommandName,
  type MediaCommandResult,
  type NowPlayingInfo,
  type Section,
} from "./island-types";
import { formatClock } from "./NotchCore";
// import { IgrisModel } from "./IgrisModel";
import { WidgetForSection } from "./widgets";

interface DashboardProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  onCollapse: () => void;
  onClose: () => void;
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  hiveOnline: boolean | null;
  loading: boolean;
  response: string;
  error: string | null;
  route: ChatResult["route"] | null;
  onSubmitChat: (text: string) => void;
  muted: boolean | null;
  onToggleMute: () => void;
  timer: FocusTimerState;
  timerControls: FocusTimerControls;
  nowPlaying: NowPlayingInfo | null;
  mediaCommand: (
    command: MediaCommandName,
    positionSec?: number,
  ) => Promise<MediaCommandResult | undefined>;
  onListeningChange: (listening: boolean) => void;
  listenSignal: number;
}

/**
 * Expanded panel, flush against the top edge (the notch slides away while
 * this owns the window). Utility bar, pill tab row, and a swipeable
 * carousel showing ~2.5 panels at a time: drag the track (or flick it) to
 * travel, tabs stay put as status indicators and scroll the active card
 * into view when clicked.
 */
export const Dashboard: React.FC<DashboardProps> = ({
  activeSection,
  onSectionChange,
  onCollapse,
  onClose,
  autoSpeak,
  onToggleSpeak,
  hiveOnline,
  loading,
  response,
  error,
  route,
  onSubmitChat,
  muted,
  onToggleMute,
  timer,
  timerControls,
  nowPlaying,
  mediaCommand,
  onListeningChange,
  listenSignal,
}) => {
  const [prompt, setPrompt] = useState("");
  // Elapsed-seconds counter so a long first run visibly stays alive.
  const [busySince, setBusySince] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (loading) {
      setBusySince((prev) => prev ?? Date.now());
    } else {
      setBusySince(null);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);
  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<Section, HTMLDivElement>());
  const dragRef = useRef<{ x: number; scrollLeft: number } | null>(null);
  const scrollRaf = useRef(0);
  const suppressClick = useRef(false);
  const activeRef = useRef<Section>(activeSection);
  activeRef.current = activeSection;

  // GSAP expansion: the dashboard grows out of the notch position
  // (top-centre origin) instead of opening as a separate layer.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { y: -72, scale: 0.72, opacity: 0, transformOrigin: "50% 0%" },
        { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" },
      );
      gsap.fromTo(
        ".igris-rise",
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.38,
          stagger: 0.05,
          ease: "power3.out",
          delay: 0.1,
          clearProps: "transform,opacity",
        },
      );
    }, cardRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = prompt.trim();
    if (!query || loading) return;
    setPrompt("");
    // Dismiss IME composition / mobile keyboards so Enter always commits.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSubmitChat(query);
  };

  const busySecs =
    loading && busySince ? Math.floor((Date.now() - busySince) / 1000) : 0;

  const scrollToSection = (section: Section, smooth = true) => {
    const track = trackRef.current;
    const card = cardRefs.current.get(section);
    if (!track || !card) return;
    const left = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    track.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  };

  const goToSection = (section: Section) => {
    onSectionChange(section);
    scrollToSection(section);
  };

  /** Track scroll → nearest card centre becomes the active section. */
  const updateActiveFromScroll = () => {
    scrollRaf.current = 0;
    const track = trackRef.current;
    if (!track) return;
    const centre = track.scrollLeft + track.clientWidth / 2;
    let best: Section = activeRef.current;
    let bestDist = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((card, section) => {
      const dist = Math.abs(card.offsetLeft + card.clientWidth / 2 - centre);
      if (dist < bestDist) {
        bestDist = dist;
        best = section;
      }
    });
    if (best !== activeRef.current) onSectionChange(best);
  };

  // rAF-throttled: scroll events fire faster than frames; without this the
  // whole dashboard re-renders mid-gesture and the track stutters.
  const handleTrackScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(updateActiveFromScroll);
  };

  // -- Drag-to-scroll (mouse). Interactive descendants opt out so inputs,
  // buttons and textareas keep their native behaviour.
  const DRAG_OPT_OUT = "button,input,textarea,a,select,[contenteditable]";

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest(DRAG_OPT_OUT)) return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = { x: e.clientX, scrollLeft: track.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    const dx = e.clientX - drag.x;
    // Past a few px this is a swipe, not a tap — swallow the click that
    // the browser will fire on release so cards don't toggle mid-swipe.
    if (Math.abs(dx) > 6) suppressClick.current = true;
    track.scrollLeft = drag.scrollLeft - dx;
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  /** Swallow the synthetic click after a real swipe. */
  const handleTrackClickCapture = (e: React.SyntheticEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const timerVisible = timer.running || timer.leftSec < timer.totalSec;

  return (
    <motion.div
      initial={false}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.16, ease: "easeIn" }}
      style={{ transformOrigin: "50% 0%" }}
      className="absolute inset-x-2 top-0 bottom-2"
    >
      <div
        ref={cardRef}
        className="flex h-full w-full flex-col overflow-hidden rounded-b-[24px] rounded-t-[6px] bg-[#f5f5f7]/95 text-[#18181b] shadow-[0_35px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl backdrop-saturate-150"
      >
        <header
          data-drag
          className="igris-rise flex h-12 shrink-0 items-center justify-between bg-white/70 px-3.5 backdrop-blur-2xl"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={onCollapse}
              aria-label="Collapse"
              className="h-7 w-7 rounded-full bg-black/[0.045] hover:bg-black/[0.08] active:scale-95"
            >
              <ChevronDown size={15} />
            </Button>
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[9px] bg-black text-white">
              {/* <IgrisModel size={26} spin={0.4} /> */}
            </div>
            <div>
              <div className="text-[12px] font-semibold leading-none tracking-tight">
                igris
              </div>
            </div>
            {timerVisible && (
              <button
                type="button"
                onClick={() => goToSection("time")}
                className="ml-1 flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-600 tabular-nums hover:bg-orange-500/15 active:scale-95"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
                {formatClock(timer.leftSec)}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSpeak}
              aria-label="Toggle voice replies"
              className="h-7 w-7 rounded-full text-black/45 active:scale-95"
            >
              {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute system" : "Mute system"}
              className="h-7 w-7 rounded-full text-black/45 active:scale-95"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Quit Igris"
              className="h-7 w-7 rounded-full text-black/45 active:scale-95"
            >
              <X size={14} />
            </Button>
          </div>
        </header>
        <Separator />
        {/* Section tabs — indicators that scroll the active card into view */}
        <Tabs
          value={activeSection}
          onValueChange={(v) => goToSection(v as Section)}
          className="igris-rise shrink-0"
        >
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-black/[0.045] bg-white/45 px-3">
            {SECTION_LABELS.map(({ id, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="shrink-0 rounded-full px-3 py-1 text-[10px] data-[state=active]:bg-black data-[state=active]:text-white"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Swipeable carousel (~2.5 cards visible) */}
        <main className="igris-rise min-h-0 flex-1 px-2.5 py-2">
          <div
            ref={trackRef}
            onScroll={handleTrackScroll}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={handleTrackClickCapture}
            className="no-scrollbar relative flex h-full gap-2.5 overflow-x-auto overscroll-x-contain cursor-grab touch-pan-y active:cursor-grabbing"
          >
            {SECTION_ORDER.map((section) => (
              <div
                key={section}
                ref={(el) => {
                  if (el) cardRefs.current.set(section, el);
                  else cardRefs.current.delete(section);
                }}
                style={{ width: "38%" }}
                className="h-full shrink-0"
              >
                <WidgetForSection
                  section={section}
                  timer={timer}
                  timerControls={timerControls}
                  nowPlaying={nowPlaying}
                  mediaCommand={mediaCommand}
                />
              </div>
            ))}
          </div>
        </main>
        {/* Spotlight command bar */}
        <footer className="igris-rise shrink-0 border-t border-black/[0.05] bg-white/60 px-3 py-2 backdrop-blur-2xl">
          {(loading || response || error) && (
            <div className="mb-1.5 max-h-[44px] overflow-y-auto px-1 text-[10px] leading-relaxed text-black/60">
              {loading ? (
                <span className="text-black/40">
                  {route === "hive" ? "Hive is working…" : "Thinking…"}
                  {busySecs > 2 ? ` ${busySecs}s` : ""}
                </span>
              ) : error ? (
                <span className="text-red-500">{error}</span>
              ) : (
                response
              )}
            </div>
          )}
          <form onSubmit={submit} className="flex items-center gap-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border border-black/10 border-t-black/60" />
              ) : (
                <Sparkles size={14} className="text-black/30" />
              )}
            </div>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Ask Igris anything…"
              className="h-8 border-0 bg-black/[0.045] text-[11px] shadow-none outline-none placeholder:text-black/30 focus-visible:ring-1 focus-visible:ring-black/10"
            />
            <VoiceInput
              tone="light"
              onTranscript={(text) => onSubmitChat(text)}
              onListeningChange={onListeningChange}
              listenSignal={listenSignal}
              disabled={loading}
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={loading || !prompt.trim()}
              aria-label="Send"
              className="h-8 w-8 shrink-0 rounded-full bg-black text-white hover:bg-black/85 active:scale-95"
            >
              <Send size={13} />
            </Button>
          </form>
        </footer>
      </div>
    </motion.div>
  );
};
