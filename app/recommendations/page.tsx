"use client";

import { PageHeader } from "@/components/page-header";
import { SourceBadgesFooter } from "@/components/source-badges-footer";
import { GradientFlowIcon } from "@/components/gradient-flow-icon";
import { PAGE_CONTENT_CLASS, PAGE_SECTION_CARD_CLASS, cohesiveCardStyle } from "@/lib/ui-surfaces";
import { cn } from "@/lib/utils";

export default function RecommendationsPage() {
  return (
    <main className="min-h-screen font-sans">
      <div className={PAGE_CONTENT_CLASS}>
        <PageHeader
          icon="sparkles"
          title="Recommendations"
          description="AI-powered suggestions tailored to your sets and taste."
        />

        <section
          className={cn(PAGE_SECTION_CARD_CLASS, "flex flex-col overflow-hidden p-0")}
          style={cohesiveCardStyle()}
        >
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center md:px-6">
            <GradientFlowIcon name="sparkles" className="size-10" />
            <p className="mt-6 max-w-md text-base font-medium leading-relaxed text-foreground/90">
              Coming Soon — AI-powered track recommendations based on your set
            </p>
          </div>

          <div className="border-t border-border/50 px-4 py-3">
            <SourceBadgesFooter />
          </div>
        </section>
      </div>
    </main>
  );
}
