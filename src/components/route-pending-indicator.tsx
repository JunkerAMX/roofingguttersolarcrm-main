import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

export function RouteLoadingGate({ children }: { children: ReactNode }) {
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 120);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (showSkeleton) {
    return (
      <div className="space-y-4 animate-in fade-in duration-150" aria-busy="true" aria-live="polite">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-secondary" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-secondary/70" />
        <div className="mt-6 grid gap-3">
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
