import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { formatDistanceToNow } from "date-fns";
import { Download, Play, ArrowDownToLine, Crown } from "lucide-react";
import { Button } from "./ui/button";

export default function DownloadsContent() {
  const [downloadedVideos, setDownloadedVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      loadDownloadedVideos();
    }
  }, [user]);

  const loadDownloadedVideos = async () => {
    if (!user) return;
    try {
      const response = await axiosInstance.get(`/download/history/${user._id}`);
      setDownloadedVideos(response.data);
    } catch (error) {
      console.error("Error loading downloaded videos:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <Download className="w-16 h-16 mx-auto text-gray-400 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold mb-2">Offline Downloads</h2>
        <p className="text-gray-600 max-w-sm mx-auto mb-6">
          Sign in to access and manage your downloaded offline videos.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-sm text-gray-600">Retrieving downloads history...</p>
      </div>
    );
  }

  if (downloadedVideos.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <ArrowDownToLine className="w-16 h-16 mx-auto text-indigo-500/70 mb-4" />
        <h2 className="text-xl font-bold mb-2">Your Downloads shelf is empty</h2>
        <p className="text-gray-600 max-w-sm mx-auto mb-6">
          Download videos directly from the watch page to watch them offline anytime.
        </p>
        <Link href="/">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6">
            Explore Videos
          </Button>
        </Link>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
            Offline Shelf 
            {user.isPremium && (
              <span className="flex items-center gap-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                <Crown className="w-3 h-3 fill-amber-900 text-amber-900" />
                PREMIUM
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            You have downloaded {downloadedVideos.length} {downloadedVideos.length === 1 ? "video" : "videos"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {downloadedVideos.length > 0 && (
            <Link href={`/watch/${downloadedVideos[0]._id}`}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 rounded-full px-6 shadow-sm">
                <Play className="w-4 h-4 fill-white" />
                Play All
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {downloadedVideos.map((video) => (
          <div key={video._id} className="group flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow duration-200">
            <Link href={`/watch/${video._id}`} className="relative aspect-video w-full bg-gray-900 block overflow-hidden">
              <video
                src={`${baseUrl}/${video.filepath.replace(/\\/g, "/")}`}
                preload="metadata"
                className="object-cover w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
                muted
                onMouseOver={(e: any) => e.target.play()}
                onMouseOut={(e: any) => { e.target.pause(); e.target.currentTime = 0; }}
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                <div className="bg-white text-indigo-600 p-2.5 rounded-full shadow-lg">
                  <Play className="w-5 h-5 fill-indigo-600 text-indigo-600" />
                </div>
              </div>
            </Link>

            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <Link href={`/watch/${video._id}`}>
                  <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 hover:text-indigo-600 transition-colors">
                    {video.videotitle}
                  </h3>
                </Link>
                <p className="text-xs text-gray-600 mt-1.5 font-medium">{video.videochanel}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {video.views.toLocaleString()} views • {formatDistanceToNow(new Date(video.createdAt))} ago
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 font-semibold">
                <span>{(video.filesize / (1024 * 1024)).toFixed(1)} MB</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                  Offline Ready
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
