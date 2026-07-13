import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function RoutePendingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }
    // Only show if loading persists >150ms to avoid flicker on fast navigations
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border/60 bg-background/95 px-5 py-4 shadow-lg backdrop-blur animate-in fade-in zoom-in-95 duration-200">
        <Loader2 className="h-5 w-5 animate-spin text-brand-green" />
        <span className="text-sm font-medium text-foreground">Loading…</span>
      </div>
    </div>
  );
}
