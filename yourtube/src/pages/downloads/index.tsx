import DownloadsContent from "@/components/DownloadsContent";
import React, { Suspense } from "react";

const DownloadsPage = () => {
  return (
    <main className="flex-1 p-6 bg-gray-50/20 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">Downloads</h1>
        <Suspense fallback={<div className="text-sm text-gray-600">Loading your downloads shelf...</div>}>
          <DownloadsContent />
        </Suspense>
      </div>
    </main>
  );
};

export default DownloadsPage;
