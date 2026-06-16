import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="min-h-screen pl-16">{children}</div>
    </div>
  );
}
