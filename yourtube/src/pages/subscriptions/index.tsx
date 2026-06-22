import React, { useEffect, useState } from "react";
import Videocard from "@/components/videocard";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import Link from "next/link";

export default function SubscriptionsPage() {
  const { user } = useUser();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await axiosInstance.get("/video/getall");
        const allVideos: any[] = res.data ?? [];

        if (user?.subscribedChannels?.length) {
          // Show videos whose uploader/channel is in the subscribed list
          const subbed = allVideos.filter(
            (v) =>
              user.subscribedChannels.includes(v.uploader) ||
              user.subscribedChannels.includes(v.videochanel)
          );
          setVideos(subbed);
        } else {
          setVideos([]);
        }
      } catch (error) {
        console.error("Failed to fetch subscriptions feed:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [user]);

  return (
    <main className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-6">Subscriptions</h1>

      {!user ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="text-5xl">📺</div>
          <h2 className="text-xl font-semibold">Sign in to see your subscriptions</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Videos from channels you subscribe to will appear here.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="text-5xl">🔔</div>
          <h2 className="text-xl font-semibold">No videos yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Subscribe to channels to see their latest videos here.
          </p>
          <Link
            href="/"
            className="mt-2 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Browse videos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((video: any) => (
            <Videocard key={video._id} video={video} />
          ))}
        </div>
      )}
    </main>
  );
}
