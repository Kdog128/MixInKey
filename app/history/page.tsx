"use client";

import { PageHeader } from "@/components/page-header";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import { PAGE_CONTENT_CLASS, PAGE_SECTION_CARD_CLASS, cohesiveCardStyle } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  return (
    <main className="min-h-screen font-sans">
      <div className={PAGE_CONTENT_CLASS}>
        <PageHeader
          icon="clock"
          title="History"
          description="Past comparisons and mixing patterns over time."
        />

        <section
          className={cn(
            PAGE_SECTION_CARD_CLASS,
            "flex flex-col items-center justify-center py-16 text-center"
          )}
          style={cohesiveCardStyle()}
        >
          <GradientFlowIcon name="clock" className="size-10" />
          <p className="mt-6 max-w-md text-base font-medium leading-relaxed text-muted-foreground">
            Coming Soon — your comparison history and pattern insights
          </p>
        </section>
      </div>
    </main>
  );
}
