import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function RouteLoadingGate({ children }: { children: ReactNode }) {
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), 120);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (showLoader) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center py-16 animate-in fade-in duration-150">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-brand-green" />
          <span className="text-sm font-medium">Loading…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
