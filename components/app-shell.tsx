"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ArtworkMosaicWall } from "@/components/artwork-mosaic-wall";
import { PageAmbientBackground } from "@/components/page-ambient-background";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <ArtworkMosaicWall active />
      <PageAmbientBackground />
      <div className="relative z-10 min-h-screen min-w-0 ml-16 w-[calc(100%-4rem)]">
        {children}
      </div>
    </div>
  );
}
