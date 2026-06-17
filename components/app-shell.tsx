"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ArtworkMosaicWall } from "@/components/artwork-mosaic-wall";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <ArtworkMosaicWall active />
      <div className="relative z-10 min-h-screen pl-16">{children}</div>
    </div>
  );
}
