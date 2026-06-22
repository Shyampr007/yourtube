import Videogrid from "@/components/Videogrid";
import { Suspense } from "react";

export default function ExplorePage() {
  return (
    <main className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-6">Explore</h1>
      <Suspense fallback={<div>Loading videos...</div>}>
        <Videogrid />
      </Suspense>
    </main>
  );
}
