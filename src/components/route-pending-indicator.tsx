import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function RouteLoadingGate({ children }: { children: ReactNode }) {
  const isLoading = useRouterState((s) => s.isLoading || s.isTransitioning);
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), 120);
    return () => clearTimeout(t);
  }, [isLoading]);

  return (
    <>
      <div style={{ display: showLoader ? "none" : "contents" }}>{children}</div>
      {showLoader && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background animate-in fade-in duration-150">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-brand-green" />
            <span className="text-sm font-medium text-foreground">Loading…</span>
          </div>
        </div>
      )}
    </>
  );
}
