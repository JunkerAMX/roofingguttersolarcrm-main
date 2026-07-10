import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { getMe } from "@/lib/jobs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";
import { LogOut, User, Shield, Mail, Sun, Moon, Monitor, EyeOff } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { useScramble } from "@/hooks/use-scramble";
import { cn } from "@/lib/utils";



export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const router = useRouter();
  const meFn = useServerFn(getMe);
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { theme, setTheme, mounted } = useTheme();
  const { enabled: scrambleOn, mounted: scrambleMounted, setScramble } = useScramble();


  const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];


  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account</p>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
      ) : (
        <div className="max-w-xl space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-semibold">
                  {me?.profile?.full_name ?? "—"}
                </div>
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> {me?.profile?.email ?? ""}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-brand-green" />
              <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold uppercase tracking-wide">
                {me?.isAdmin ? "Admin" : "Worker"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold">Appearance</h2>
            <p className="mt-1 text-xs text-muted-foreground">Choose how the app looks.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {themeOptions.map((opt) => {
                const active = mounted && theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.97]",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    <opt.icon className="h-5 w-5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {me?.isAdmin && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                    <EyeOff className="h-4 w-4 text-brand-green" /> Scramble mode
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Replace client names and addresses with fake values on screen. Only affects what you see — data is unchanged.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScramble(!scrambleOn)}
                  disabled={!scrambleMounted}
                  role="switch"
                  aria-checked={scrambleOn}
                  aria-label="Toggle scramble mode"
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    scrambleOn ? "bg-primary" : "bg-input",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition-transform",
                      scrambleOn ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            </div>
          )}





          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive transition-all duration-200 ease-out hover:bg-destructive/10 active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </AppShell>
  );
}
