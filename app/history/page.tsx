"use client";

import { Clock } from "lucide-react";

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

export default function HistoryPage() {
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
              <Clock className="size-7" style={{ color: "#a855f7" }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                History
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Past comparisons and mixing patterns over time.
              </p>
            </div>
          </header>

          <section
            className="rounded-2xl border border-border bg-card px-6 py-20 text-center"
            style={{ boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}
          >
            <Clock className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-6 max-w-md mx-auto text-base font-medium leading-relaxed text-muted-foreground">
              Coming Soon — your comparison history and pattern insights
            </p>
          </section>
        </div>
      </main>
  );
}
