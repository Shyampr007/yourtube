import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import { getAllVideos } from "@/lib/videoCache";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useRef, useState } from "react";

const WatchPage = () => {
  const router = useRouter();
  const { id } = router.query;

  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [currentVideo, setCurrentVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const commentSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const data = await getAllVideos();
        const found = data.find((v) => v._id === id) ?? null;
        setCurrentVideo(found);
        setAllVideos(data);
      } catch (err) {
        console.error("Failed to fetch video list:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // ── Gesture callbacks ──────────────────────────────────────────────────
  // Scroll to the comment section when the player receives a 3× left-tap
  const handleOpenComments = useCallback(() => {
    commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Navigate to the next video in the list on 3× center-tap
  const handleNextVideo = useCallback(() => {
    if (!allVideos.length || !id) return;
    const idx = allVideos.findIndex((v) => v._id === id);
    const nextVideo = allVideos[(idx + 1) % allVideos.length];
    if (nextVideo) {
      router.push(`/watch/${nextVideo._id}`);
    }
  }, [allVideos, id, router]);

  // ── Loading / not-found states ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentVideo) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Video not found.
      </div>
    );
  }

  // Related videos = everything except the one currently playing
  const relatedVideos = allVideos.filter((v) => v._id !== id);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — player + info + comments */}
          <div className="lg:col-span-2 space-y-4">
            <Videopplayer
              video={currentVideo}
              onOpenComments={handleOpenComments}
              onNextVideo={handleNextVideo}
            />
            <VideoInfo video={currentVideo} />

            {/* Anchor div so gesture scroll lands here */}
            <div ref={commentSectionRef} id="comment-section">
              <Comments videoId={id} />
            </div>
          </div>

          {/* Right column — related videos */}
          <div className="space-y-4">
            <RelatedVideos videos={relatedVideos} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
