"use client";

import { Sparkles } from "lucide-react";

function PageBackground() {
  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(168,85,247,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168,85,247,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 left-1/3 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />
    </>
  );
}

export default function RecommendationsPage() {
  return (
      <main className="min-h-screen font-sans">
        <PageBackground />

        <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-4 py-12">
          <header className="flex items-start gap-4">
            <div
              className="flex size-14 flex-shrink-0 items-center justify-center rounded-2xl border"
              style={{
                borderColor: "rgba(168,85,247,0.3)",
                background: "rgba(168,85,247,0.1)",
                boxShadow: "0 0 24px rgba(168,85,247,0.2)",
              }}
            >
              <Sparkles className="size-7" style={{ color: "#a855f7" }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Recommendations
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                AI-powered suggestions tailored to your sets and taste.
              </p>
            </div>
          </header>

          <section
            className="flex flex-col items-center justify-center rounded-2xl border border-[#a855f7]/25 px-6 py-20 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(59,130,246,0.08) 50%, rgba(168,85,247,0.12) 100%)",
              boxShadow: "0 0 60px rgba(168,85,247,0.12)",
            }}
          >
            <Sparkles className="size-10 text-[#c084fc]" style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }} />
            <p className="mt-6 max-w-md text-base font-medium leading-relaxed text-foreground/90">
              Coming Soon — AI-powered track recommendations based on your set
            </p>
          </section>
        </div>
      </main>
  );
}
