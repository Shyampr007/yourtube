import React, { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Check,
  Clock,
  Copy,
  Download,
  Mail,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";
import PremiumModal from "./PremiumModal";

const VideoInfo = ({ video }: any) => {
  const [likes, setLikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user, login } = useUser();
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subCount, setSubCount] = useState(0);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Guards to prevent duplicate in-flight requests
  const pendingLike = useRef(false);
  const pendingDislike = useRef(false);
  const pendingSubscribe = useRef(false);
  const pendingWatchLater = useRef(false);

  useEffect(() => {
    if (user && user.subscribedChannels && video) {
      const channelId = video.uploader || video.videochanel;
      setIsSubscribed(user.subscribedChannels.includes(channelId));
    } else {
      setIsSubscribed(false);
    }
  }, [user, video]);

  useEffect(() => {
    setLikes(video.Like || 0);
    setDislikes(video.Dislike || 0);
    setIsLiked(false);
    setIsDisliked(false);
  }, [video]);

  // Fire-and-forget view tracking — never blocks the UI
  useEffect(() => {
    if (!video?._id) return;
    if (user) {
      axiosInstance.post(`/history/${video._id}`, { userId: user._id }).catch(() => {});
    } else {
      axiosInstance.post(`/history/views/${video._id}`).catch(() => {});
    }
  }, [video._id, user?._id]);

  // ── Like — instant optimistic flip ──────────────────────────────────────
  const handleLike = useCallback(() => {
    if (!user || pendingLike.current) return;
    pendingLike.current = true;

    // Snapshot for rollback
    const prevLiked = isLiked;
    const prevDisliked = isDisliked;
    const prevLikes = likes;
    const prevDislikes = dislikes;

    // Update UI immediately — no waiting for server
    if (isLiked) {
      setIsLiked(false);
      setLikes((n: number) => n - 1);
    } else {
      setIsLiked(true);
      setLikes((n: number) => n + 1);
      if (isDisliked) {
        setIsDisliked(false);
        setDislikes((n: number) => n - 1);
      }
    }

    axiosInstance
      .post(`/like/${video._id}`, { userId: user._id })
      .catch(() => {
        // Quietly restore previous state if server rejects
        setIsLiked(prevLiked);
        setIsDisliked(prevDisliked);
        setLikes(prevLikes);
        setDislikes(prevDislikes);
      })
      .finally(() => {
        pendingLike.current = false;
      });
  }, [user, isLiked, isDisliked, likes, dislikes, video._id]);

  // ── Dislike — instant optimistic flip ──────────────────────────────
  const handleDislike = useCallback(() => {
    if (!user || pendingDislike.current) return;
    pendingDislike.current = true;

    const prevLiked = isLiked;
    const prevDisliked = isDisliked;
    const prevLikes = likes;
    const prevDislikes = dislikes;

    if (isDisliked) {
      setIsDisliked(false);
      setDislikes((n: number) => n - 1);
    } else {
      setIsDisliked(true);
      setDislikes((n: number) => n + 1);
      if (isLiked) {
        setIsLiked(false);
        setLikes((n: number) => n - 1);
      }
    }

    axiosInstance
      .post(`/like/${video._id}`, { userId: user._id })
      .catch(() => {
        setIsLiked(prevLiked);
        setIsDisliked(prevDisliked);
        setLikes(prevLikes);
        setDislikes(prevDislikes);
      })
      .finally(() => {
        pendingDislike.current = false;
      });
  }, [user, isLiked, isDisliked, likes, dislikes, video._id]);

  // ── Watch Later — instant optimistic flip ───────────────────────────────
  const handleWatchLater = useCallback(() => {
    if (pendingWatchLater.current) return;
    pendingWatchLater.current = true;

    const prev = isWatchLater;
    setIsWatchLater(!prev);

    axiosInstance
      .post(`/watch/${video._id}`, { userId: user?._id })
      .catch(() => setIsWatchLater(prev))
      .finally(() => {
        pendingWatchLater.current = false;
      });
  }, [isWatchLater, video._id, user]);

  // ── Subscribe — instant optimistic flip ─────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    if (!user) {
      try {
        const response = await axiosInstance.post("/user/login", {
          email: "developer@example.com",
          name: "Developer User",
          image: "https://github.com/shadcn.png",
        });
        login(response.data.result);
      } catch (err) {
        console.error("Auto login failed", err);
      }
      return;
    }

    if (pendingSubscribe.current) return;
    pendingSubscribe.current = true;

    const channelId = video.uploader || video.videochanel;
    const prev = isSubscribed;
    const prevCount = subCount;

    // Flip immediately
    setIsSubscribed(!prev);
    setSubCount((n) => (prev ? n - 1 : n + 1));

    axiosInstance
      .patch(`/user/subscribe/${user._id}`, { channelId })
      .then((res) => {
        if (res.data) {
          setIsSubscribed(res.data.subscribed);
          login({ ...user, subscribedChannels: res.data.subscribedChannels });
        }
      })
      .catch(() => {
        setIsSubscribed(prev);
        setSubCount(prevCount);
      })
      .finally(() => {
        pendingSubscribe.current = false;
      });
  }, [user, isSubscribed, subCount, video, login]);

  // ── Download — inherently async, stays async ─────────────────────────────
  const handleDownload = async () => {
    if (!user) {
      toast.info("Signing you in first...");
      try {
        const response = await axiosInstance.post("/user/login", {
          email: "developer@example.com",
          name: "Developer User",
          image: "https://github.com/shadcn.png",
        });
        login(response.data.result);
        toast.success("Signed in. Click Download again.");
      } catch {
        toast.error("Sign in failed. Please sign in manually.");
      }
      return;
    }

    setDownloading(true);
    const toastId = toast.loading("Preparing download...");

    try {
      const res = await axiosInstance.post("/download/register", {
        userId: user._id,
        videoId: video._id,
      });
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
      const fileUrl = `${baseUrl}/${res.data.filePath.replace(/\\/g, "/")}`;

      toast.loading("Downloading…", { id: toastId });
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error("File fetch failed");

      const blob = await fileRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = res.data.fileName || `${video.videotitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download started!", { id: toastId });
    } catch (error: any) {
      if (error.response?.status === 403) {
        toast.error(error.response.data.message || "Daily limit reached.", { id: toastId });
        setIsPremiumModalOpen(true);
      } else {
        toast.error("Download failed. Check your network.", { id: toastId });
      }
    } finally {
      setDownloading(false);
    }
  };

  const videoUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://yourtube.com/video/${video._id}`;

  const handleShare = (platform: string) => {
    const encodedUrl = encodeURIComponent(videoUrl);
    const encodedTitle = encodeURIComponent(video.videotitle || "Check out this video");
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      email: `mailto:?subject=${encodedTitle}&body=Check%20out%20this%20video%3A%20${encodedUrl}`,
    };
    if (urls[platform]) window.open(urls[platform], "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{video.videotitle}</h1>

      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Channel info + subscribe */}
        <div className="flex items-center gap-4">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{video.videochanel}</h3>
            <p className="text-sm text-muted-foreground">
              {subCount >= 1000000
                ? `${(subCount / 1000000).toFixed(1)}M`
                : subCount.toLocaleString()}{" "}
              subscribers
            </p>
          </div>
          <Button
            className={`ml-4 rounded-full px-6 transition-all active:scale-95 ${
              isSubscribed
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
            onClick={handleSubscribe}
          >
            {isSubscribed ? "Subscribed" : "Subscribe"}
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Like / Dislike pill */}
          <div className="flex items-center bg-secondary rounded-full">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-l-full text-secondary-foreground hover:bg-secondary/80 active:scale-90 transition-transform"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 transition-all ${
                  isLiked ? "fill-foreground text-foreground scale-110" : ""
                }`}
              />
              {likes.toLocaleString()}
            </Button>
            <div className="w-px h-6 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="rounded-r-full text-secondary-foreground hover:bg-secondary/80 active:scale-90 transition-transform"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 transition-all ${
                  isDisliked ? "fill-foreground text-foreground scale-110" : ""
                }`}
              />
              {dislikes.toLocaleString()}
            </Button>
          </div>

          {/* Watch Later */}
          <Button
            variant="ghost"
            size="sm"
            className={`bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full active:scale-90 transition-transform ${
              isWatchLater ? "text-primary" : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className={`w-5 h-5 mr-2 transition-all ${isWatchLater ? "text-primary" : ""}`} />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>

          {/* Share */}
          <Button
            variant="ghost"
            size="sm"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full active:scale-90 transition-transform"
            onClick={() => setIsShareModalOpen(true)}
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="sm"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full active:scale-90 transition-transform"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="w-5 h-5 mr-2" />
            {downloading ? "Downloading…" : "Download"}
          </Button>

          {/* More */}
          <Button
            variant="ghost"
            size="icon"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-full active:scale-90 transition-transform"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Description box */}
      <div className="bg-secondary rounded-lg p-4">
        <div className="flex gap-4 text-sm font-medium mb-2 text-secondary-foreground">
          <span>{video.views.toLocaleString()} views</span>
          <span>{formatDistanceToNow(new Date(video.createdAt))} ago</span>
        </div>
        <div
          className={`text-sm text-secondary-foreground ${
            showFullDescription ? "" : "line-clamp-3"
          }`}
        >
          <p>
            {video.description || "No description provided for this video."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium text-secondary-foreground hover:text-foreground"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>

      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
      />

      {/* Share Modal */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          onClick={() => setIsShareModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl p-6 shadow-2xl"
            style={{
              background: "var(--card, #1a1a1a)",
              border: "1px solid rgba(255,255,255,0.1)",
              animation: "shareModalIn 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Share video</h2>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-8 w-8 hover:bg-secondary"
                onClick={() => setIsShareModalOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Social buttons */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {/* WhatsApp */}
              <button
                onClick={() => handleShare("whatsapp")}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.3)" }}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-xs font-medium" style={{ color: "#25D366" }}>WhatsApp</span>
              </button>

              {/* Twitter / X */}
              <button
                onClick={() => handleShare("twitter")}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(29,161,242,0.12)", border: "1px solid rgba(29,161,242,0.3)" }}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#1DA1F2">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-xs font-medium" style={{ color: "#1DA1F2" }}>Twitter / X</span>
              </button>

              {/* Email */}
              <button
                onClick={() => handleShare("email")}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.3)" }}
              >
                <Mail className="w-8 h-8" style={{ color: "#EA580C" }} />
                <span className="text-xs font-medium" style={{ color: "#EA580C" }}>Email</span>
              </button>
            </div>

            {/* Copy link row */}
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <input
                readOnly
                value={videoUrl}
                className="flex-1 bg-transparent text-sm text-muted-foreground outline-none truncate"
              />
              <Button
                size="sm"
                className="shrink-0 rounded-lg gap-1.5 transition-all"
                style={{
                  background: copied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.1)",
                  color: copied ? "#22C55E" : "inherit",
                }}
                onClick={handleCopyLink}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shareModalIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default VideoInfo;
