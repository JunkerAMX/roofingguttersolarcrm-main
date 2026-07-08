import { createFileRoute, Link, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { getMe } from "@/lib/jobs.functions";
import { ListChecks, Users, Contact, Briefcase, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/admin", label: "Overview", icon: SettingsIcon, exact: true },
  { to: "/admin/checklists", label: "Checklists", icon: ListChecks },
  { to: "/admin/team", label: "Team", icon: Users },
  { to: "/admin/contacts", label: "Contacts", icon: Contact },
  { to: "/admin/jobs", label: "All Jobs", icon: Briefcase },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const meFn = useServerFn(getMe);
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });

  if (isLoading) return <AppShell><div className="h-64 animate-pulse rounded-2xl bg-secondary" /></AppShell>;
  if (!me?.isAdmin) return <AppShell><div className="rounded-2xl border p-8 text-center text-muted-foreground">Admin access required.</div></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage your CRM configuration.</p>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-brand-green text-brand-green" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </AppShell>
  );
}
