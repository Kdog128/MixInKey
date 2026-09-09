"use client";

import { ArtworkMosaicWall } from "@/components/artwork-mosaic-wall";
import { PageAmbientBackground } from "@/components/page-ambient-background";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ArtworkMosaicWall active />
      <PageAmbientBackground />
      <div className="relative z-10 min-h-screen min-w-0 w-full max-w-full overflow-x-clip pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:ml-16 md:w-[calc(100%-4rem)] md:pb-0">
        {children}
      </div>
    </div>
  );
}
