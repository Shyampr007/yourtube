"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useUser } from "@/lib/AuthContext";
import { Crown, Lock, Play, Pause, SkipForward, RotateCcw, MessageCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import PremiumModal from "./PremiumModal";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
  };
  onOpenComments?: () => void;
  onNextVideo?: () => void;
}

// Tier-based watch limits (in seconds)
const WATCH_LIMITS: Record<string, number> = {
  Free: 300,
  Bronze: 420,
  Silver: 600,
  Gold: Infinity,
};

// Ripple animation colours by zone
const RIPPLE_COLOURS: Record<string, string> = {
  left: "rgba(99, 179, 237, 0.35)",
  center: "rgba(255, 255, 255, 0.28)",
  right: "rgba(252, 129, 74, 0.35)",
};

type GestureZone = "left" | "center" | "right";
type TapAction = "seek-back" | "seek-forward" | "play-pause" | "next-video" | "open-comments" | "close-site";

interface FeedbackToast {
  id: number;
  text: string;
  icon: React.ReactNode;
  zone: GestureZone;
}

interface RippleItem {
  id: number;
  x: number;
  y: number;
  zone: GestureZone;
}

// How many ms between taps still count as the same multi-tap burst
const TAP_GAP = 320;
// How many ms before we treat a pending tap count as "done"
const TAP_COMMIT_DELAY = TAP_GAP + 40;

let _rippleSeq = 0;
let _toastSeq = 0;

export default function VideoPlayer({ video, onOpenComments, onNextVideo }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  const [limitReached, setLimitReached] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const [showControls, setShowControls] = useState(true);

  // Per-zone tap tracking
  const tapCountRef = useRef<Record<GestureZone, number>>({ left: 0, center: 0, right: 0 });
  const tapTimerRef = useRef<Record<GestureZone, ReturnType<typeof setTimeout> | null>>({
    left: null,
    center: null,
    right: null,
  });
  const lastTapRef = useRef<Record<GestureZone, number>>({ left: 0, center: 0, right: 0 });

  const currentPlan = user?.planType ?? "Free";
  const watchLimit = WATCH_LIMITS[currentPlan] ?? 300;

  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const videoSrc = video?.filepath
    ? `${backendBase}/${video.filepath.replace(/\\/g, "/")}`
    : "";

  // ── Playback limit enforcement ──────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.currentTime >= watchLimit) {
      el.pause();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setLimitReached(true);
    }
  }, [watchLimit]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (videoRef.current.currentTime < watchLimit) {
      setLimitReached(false);
    }
  }, [currentPlan, watchLimit]);

  // Sync isPlaying state with native video events
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  // Reset states and reload/play when the video changes
  useEffect(() => {
    setLimitReached(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    const el = videoRef.current;
    if (el) {
      el.load();
      el.play().catch((err) => {
        console.log("Autoplay blocked or failed:", err);
      });
    }
  }, [video?._id]);

  // ── Toast helpers ────────────────────────────────────────────────────────
  const spawnToast = useCallback((text: string, icon: React.ReactNode, zone: GestureZone) => {
    const id = ++_toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, text, icon, zone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 1600);
  }, []);

  // ── Ripple helpers ───────────────────────────────────────────────────────
  const spawnRipple = useCallback((x: number, y: number, zone: GestureZone) => {
    const id = ++_rippleSeq;
    setRipples((prev) => [...prev, { id, x, y, zone }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 650);
  }, []);

  // ── Core action dispatcher ───────────────────────────────────────────────
  const executeAction = useCallback(
    (action: TapAction) => {
      const el = videoRef.current;
      switch (action) {
        case "play-pause":
          if (!el) return;
          if (el.paused) {
            el.play().catch(() => {});
            spawnToast("Playing", <Play className="w-5 h-5" />, "center");
          } else {
            el.pause();
            spawnToast("Paused", <Pause className="w-5 h-5" />, "center");
          }
          break;

        case "seek-back":
          if (!el) return;
          el.currentTime = Math.max(0, el.currentTime - 10);
          spawnToast("−10 seconds", <RotateCcw className="w-5 h-5" />, "left");
          break;

        case "seek-forward":
          if (!el) return;
          el.currentTime = Math.min(el.duration || el.currentTime, el.currentTime + 10);
          spawnToast("+10 seconds", <SkipForward className="w-5 h-5" />, "right");
          break;

        case "next-video":
          spawnToast("Next Video", <SkipForward className="w-5 h-5" />, "center");
          if (onNextVideo) {
            onNextVideo();
          } else {
            // Fallback: browser history back, then user can pick next
            window.history.back();
          }
          break;

        case "open-comments":
          spawnToast("Comments", <MessageCircle className="w-5 h-5" />, "left");
          if (onOpenComments) {
            onOpenComments();
          } else {
            // Scroll the comment section into view
            const commentSection = document.getElementById("comment-section");
            if (commentSection) {
              commentSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
          break;

        case "close-site":
          spawnToast("Closing…", <X className="w-5 h-5" />, "right");
          setTimeout(() => window.close(), 600);
          break;
      }
    },
    [onNextVideo, onOpenComments, spawnToast]
  );

  // ── Resolve tap burst into an action ────────────────────────────────────
  const resolveTaps = useCallback(
    (zone: GestureZone, count: number) => {
      if (zone === "left") {
        if (count === 2) executeAction("seek-back");
        else if (count >= 3) executeAction("open-comments");
      } else if (zone === "right") {
        if (count === 2) executeAction("seek-forward");
        else if (count >= 3) executeAction("close-site");
      } else {
        // center
        if (count === 1) executeAction("play-pause");
        else if (count >= 3) executeAction("next-video");
        // 2 taps in center = no action (avoids accidental triggers)
      }
    },
    [executeAction]
  );

  // ── Zone detection (left 33% / center 34% / right 33%) ──────────────────
  const getZone = (clientX: number): GestureZone => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return "center";
    const relX = clientX - rect.left;
    const third = rect.width / 3;
    if (relX < third) return "left";
    if (relX > third * 2) return "right";
    return "center";
  };

  // ── Unified tap handler (touch & mouse) ─────────────────────────────────
  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      if (limitReached) return;

      const zone = getZone(clientX);
      const now = Date.now();

      // Reset if user waited too long since last tap in this zone
      if (now - lastTapRef.current[zone] > TAP_GAP + 80) {
        tapCountRef.current[zone] = 0;
      }
      lastTapRef.current[zone] = now;
      tapCountRef.current[zone] += 1;

      // Visual feedback on each tap
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        spawnRipple(clientX - rect.left, clientY - rect.top, zone);
      }

      // Clear existing commit timer for this zone
      if (tapTimerRef.current[zone]) {
        clearTimeout(tapTimerRef.current[zone]!);
      }

      // Commit after the gap — whatever count we've reached
      tapTimerRef.current[zone] = setTimeout(() => {
        const finalCount = tapCountRef.current[zone];
        tapCountRef.current[zone] = 0;
        resolveTaps(zone, finalCount);
      }, TAP_COMMIT_DELAY);
    },
    [limitReached, resolveTaps, spawnRipple]
  );

  // Touch handler — prevent default to avoid iOS double-tap zoom
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) handleTap(t.clientX, t.clientY);
    },
    [handleTap]
  );

  // Mouse click handler (desktop fallback)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Skip if the click originated from a button / control overlay
      if ((e.target as HTMLElement).closest("button")) return;
      handleTap(e.clientX, e.clientY);
    },
    [handleTap]
  );

  // ── Seek / volume helpers ────────────────────────────────────────────────
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration || 0);
  }, []);

  const handleTimeUpdateCustom = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    // also enforce limit
    if (el.currentTime >= watchLimit) {
      el.pause();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setLimitReached(true);
    }
  }, [watchLimit]);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(t, duration));
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
    setVolume(v);
    setIsMuted(v === 0);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Zone overlay positions for toasts ────────────────────────────────────
  const toastPositionClass: Record<GestureZone, string> = {
    left: "left-[8%] top-1/2 -translate-y-1/2",
    center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    right: "right-[8%] top-1/2 -translate-y-1/2",
  };

  // Auto-hide custom controls
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealControls = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/5 select-none group"
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
    >
      {/* ── Native video — NO browser controls ──────────────────────────── */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdateCustom}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        Your browser doesn&apos;t support HTML5 video.
      </video>

      {/* ── Gesture capture overlay (covers frame only, not the control bar) */}
      {!limitReached && (
        <div
          className="absolute left-0 right-0 top-0 z-10"
          style={{ bottom: "56px", touchAction: "none", WebkitUserSelect: "none" } as React.CSSProperties}
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
        />
      )}

      {/* ── Ripple effects ────────────────────────────────────────────────── */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full animate-ping z-20"
          style={{
            left: r.x - 36, top: r.y - 36, width: 72, height: 72,
            background: RIPPLE_COLOURS[r.zone],
            animationDuration: "0.55s",
            animationIterationCount: 1,
          }}
        />
      ))}

      {/* ── Action feedback toasts ────────────────────────────────────────── */}
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-none absolute flex items-center gap-2 px-3.5 py-2
            rounded-xl text-white text-sm font-semibold shadow-xl z-30
            backdrop-blur-md bg-black/55 border border-white/10
            animate-in fade-in zoom-in-90 duration-150 ${toastPositionClass[t.zone]}`}
        >
          {t.icon}
          {t.text}
        </div>
      ))}

      {/* ── Custom control bar — always rendered, visible on hover ────────── */}
      {!limitReached && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-6
            bg-gradient-to-t from-black/80 via-black/40 to-transparent
            transition-opacity duration-300 ${showControls || !isPlaying ? "opacity-100" : "opacity-0"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gesture hint strip */}
          <div className="flex justify-between text-[9px] text-white/40 font-medium tracking-wide mb-2 px-1">
            <span>2× ⏪ rewind &nbsp;|&nbsp; 3× 💬 comments</span>
            <span>1× ⏯ play/pause &nbsp;|&nbsp; 3× ⏭ next</span>
            <span>2× ⏩ forward &nbsp;|&nbsp; 3× ✕ close</span>
          </div>

          {/* Seekbar */}
          <input
            type="range" min={0} max={duration || 100} step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full h-1 mb-2 cursor-pointer accent-red-500"
            style={{ appearance: "none", background: `linear-gradient(to right, #ef4444 ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) 0%)` }}
          />

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              className="text-white hover:text-red-400 transition-colors p-1"
              onClick={() => {
                if (!videoRef.current) return;
                if (isPlaying) videoRef.current.pause();
                else videoRef.current.play().catch(() => {});
              }}
            >
              {isPlaying
                ? <Pause className="w-5 h-5 fill-white" />
                : <Play className="w-5 h-5 fill-white" />}
            </button>

            {/* Rewind 10s */}
            <button className="text-white/70 hover:text-white transition-colors p-1"
              onClick={() => seek(currentTime - 10)}>
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Skip 10s */}
            <button className="text-white/70 hover:text-white transition-colors p-1"
              onClick={() => seek(currentTime + 10)}>
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Volume */}
            <button className="text-white/70 hover:text-white transition-colors p-1" onClick={toggleMute}>
              {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </button>
            <input
              type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 cursor-pointer accent-white"
            />

            {/* Time display */}
            <span className="text-white/70 text-xs ml-1 tabular-nums">
              {fmt(currentTime)} / {fmt(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Fullscreen */}
            <button className="text-white/70 hover:text-white transition-colors p-1"
              onClick={toggleFullscreen}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Big center play button when paused ───────────────────────────── */}
      {!isPlaying && !limitReached && (
        <button
          className="absolute inset-0 flex items-center justify-center z-20 group/play"
          onClick={() => videoRef.current?.play().catch(() => {})}
        >
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover/play:bg-black/80 group-hover/play:scale-110 transition-all duration-150">
            <Play className="w-7 h-7 fill-white text-white ml-1" />
          </div>
        </button>
      )}

      {/* ── Playback limit overlay ────────────────────────────────────────── */}
      {limitReached && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-5 z-50">
          <div className="bg-amber-500/10 p-4 rounded-full border border-amber-500/20 shadow-inner">
            <Lock className="w-8 h-8 text-amber-500 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h3 className="text-xl font-bold tracking-tight text-white">Playback Time Limit Reached</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Your <strong>{currentPlan}</strong> plan allows{" "}
              {watchLimit >= 60 ? `${watchLimit / 60} minutes` : `${watchLimit} seconds`} of
              playback. Upgrade to keep watching!
            </p>
          </div>
          <div className="flex flex-col gap-2.5 w-full max-w-xs">
            <Button
              onClick={() => setIsPlanModalOpen(true)}
              className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-semibold py-5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] transition-transform cursor-pointer"
            >
              <Crown className="w-4 h-4 fill-white" />
              Upgrade Plan
            </Button>
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.max(0, watchLimit - 10);
                  setLimitReached(false);
                }
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors py-1.5"
            >
              Rewind 10s &amp; Preview
            </button>
          </div>
        </div>
      )}

      {/* ── Premium plan modal ────────────────────────────────────────────── */}
      <PremiumModal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} />
    </div>
  );
}

