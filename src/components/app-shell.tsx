import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, Calendar, Settings, LogOut, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { getMe } from "@/lib/jobs.functions";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const getMeFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMeFn() });
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = [
    { to: "/today", label: "Today", icon: Home },
    { to: "/upcoming", label: "Upcoming", icon: Calendar },
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
          <Link to="/today" className="flex items-center gap-2">
            <img src={logo} alt="Roofing.Gutter.Solar" className="h-9 w-auto" />
            <span className="hidden font-display text-sm font-semibold text-brand-green sm:inline">
              RGS Field
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const active = pathname === n.to || (n.to !== "/today" && pathname.startsWith(n.to));
              return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98]",
                  active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                )}
              >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium text-foreground">{me?.profile?.full_name ?? me?.profile?.email ?? ""}</div>
              <div className="text-muted-foreground">{me?.isAdmin ? "Admin" : "Worker"}</div>
            </div>
            <button
              onClick={signOut}
              className="hidden rounded-lg p-2 text-foreground/60 transition-all duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-[0.92] md:block"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-foreground transition-all duration-200 ease-out hover:bg-secondary active:scale-[0.92] md:hidden"
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-border/60 bg-background md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col p-3">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground/80 hover:bg-secondary"
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              ))}
              <button onClick={signOut} className="mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
