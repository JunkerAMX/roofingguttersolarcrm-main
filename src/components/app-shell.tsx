import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, BarChart3, Settings, LogOut, User } from "lucide-react";
import type { ReactNode } from "react";
import { getMe } from "@/lib/jobs.functions";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { RouteLoadingGate } from "@/components/route-pending-indicator";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const getMeFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMeFn() });
  

  const nav = [
    { to: "/jobs", label: "Jobs", icon: Home },
    ...(me?.isAdmin ? [{ to: "/stats", label: "Stats", icon: BarChart3 }] : []),
    ...(me?.isAdmin ? [{ to: "/admin", label: "Admin", icon: Settings }] : []),
  ];

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/jobs" className="flex items-center gap-2">
            <img src={logo} alt="Roofing.Gutter.Solar" className="h-9 w-auto" />
          </Link>

          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const active = pathname === n.to || (n.to !== "/jobs" && pathname.startsWith(n.to));
              return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] sm:px-3",
                  active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                )}
              >
                  <n.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationBell userId={me?.userId} />
            <Link
              to="/settings"
              aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary/80 hover:text-foreground active:scale-[0.92]"
            >
              <User className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8"><RouteLoadingGate>{children}</RouteLoadingGate></main>
    </div>
  );
}
