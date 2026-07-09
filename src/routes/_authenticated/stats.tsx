import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatCents, formatWorkerPay } from "@/lib/pay";
import { MapPin, Wallet, CheckCircle2, Clock, Briefcase, DollarSign, Users } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/stats")({
  component: StatsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function StatsPage() {
  const meFn = useServerFn(getMe);
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  if (meLoading) return <AppShell><div className="h-64 animate-pulse rounded-2xl bg-secondary" /></AppShell>;
  if (!me?.isAdmin) return <AppShell><div className="rounded-2xl border p-8 text-center text-muted-foreground">Admin access required.</div></AppShell>;
  return <StatsInner />;
}

function StatsInner() {
  const fn = useServerFn(listMyJobs);
  const meFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: () => fn({ data: { scope: "all" } }),
  });

  const isAdmin = true;

  const { done, due, currency, totalRevenueDone, totalRevenuePending, totalPayDone, totalPayPending } = useMemo(() => {
    const done = jobs.filter((j: any) => j.status === "completed");
    const due = jobs.filter((j: any) => j.status !== "completed" && j.status !== "cancelled");
    const currency = jobs[0]?.currency ?? "";
    const totalRevenueDone = done.reduce((s, j) => s + (j.price_cents ?? 0), 0);
    const totalRevenuePending = due.reduce((s, j) => s + (j.price_cents ?? 0), 0);
    const totalPayDone = done.reduce((s, j) => s + calculateWorkerPayCents(j.price_cents), 0);
    const totalPayPending = due.reduce((s, j) => s + calculateWorkerPayCents(j.price_cents), 0);
    return { done, due, currency, totalRevenueDone, totalRevenuePending, totalPayDone, totalPayPending };
  }, [jobs]);

  const perWorker = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { name: string; done: number; due: number; revenue: number; pay: number }>();
    for (const j of jobs) {
      const key = j.assigned_to ?? "unassigned";
      const name = j.assignee?.full_name || j.assignee?.email || "Unassigned";
      const cur = map.get(key) ?? { name, done: 0, due: 0, revenue: 0, pay: 0 };
      if (j.status === "completed") { cur.done += 1; cur.revenue += j.price_cents ?? 0; cur.pay += calculateWorkerPayCents(j.price_cents); }
      else if (j.status !== "cancelled") cur.due += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [isAdmin, jobs]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">My Jobs</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "All jobs across the team" : "Everything assigned to you"}
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Completed" value={String(done.length)} tone="green" />
        <StatCard icon={Clock} label="Outstanding" value={String(due.length)} tone="yellow" />
        {isAdmin ? (
          <>
            <StatCard icon={DollarSign} label="Revenue earned" value={formatCents(totalRevenueDone, currency)} tone="green" />
            <StatCard icon={Briefcase} label="Revenue pending" value={formatCents(totalRevenuePending, currency)} tone="muted" />
          </>
        ) : (
          <>
            <StatCard icon={Wallet} label="You've earned" value={formatCents(totalEarned, currency)} tone="green" />
            <StatCard icon={Wallet} label="Pending pay" value={formatCents(totalPending, currency)} tone="muted" />
          </>
        )}
      </div>

      {isAdmin && perWorker.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Users className="h-4 w-4 text-brand-green" /> By worker
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Worker</th>
                  <th className="p-3 text-right">Done</th>
                  <th className="p-3 text-right">Due</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Worker pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perWorker.map((w) => (
                  <tr key={w.name} className="hover:bg-secondary/30">
                    <td className="p-3 font-medium">{w.name}</td>
                    <td className="p-3 text-right">{w.done}</td>
                    <td className="p-3 text-right">{w.due}</td>
                    <td className="p-3 text-right">{formatCents(w.revenue, currency)}</td>
                    <td className="p-3 text-right text-brand-green">{formatCents(w.pay, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary/60" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
          No jobs yet.
        </div>
      ) : (
        <div className="space-y-8">
          <JobGroup title="Due" items={due} emptyLabel="Nothing outstanding." isAdmin={isAdmin} />
          <JobGroup title="Done" items={done} emptyLabel="No completed jobs yet." isAdmin={isAdmin} />
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "green" | "yellow" | "muted" }) {
  const toneCls = tone === "green" ? "text-brand-green" : tone === "yellow" ? "text-yellow-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function JobGroup({ title, items, emptyLabel, isAdmin }: { title: string; items: any[]; emptyLabel: string; isAdmin: boolean }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-brand-green">
        {title} · {items.length}
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="grid gap-2">
          {items.map((j: any) => (
            <Link
              key={j.id}
              to="/jobs/$jobId"
              params={{ jobId: j.id }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:-translate-y-px hover:border-brand-lime hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {j.contact ? `${j.contact.first_name ?? ""} ${j.contact.last_name ?? ""}`.trim() : "Client"}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {j.contact?.address && (
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.contact.address}</span>
                  )}
                  {j.scheduled_for && <span>{format(new Date(j.scheduled_for), "d MMM, h:mm a")}</span>}
                  {isAdmin && j.assignee && <span>· {j.assignee.full_name || j.assignee.email}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {calculateWorkerPayCents(j.price_cents) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-brand-green/10 px-2 py-1 text-xs font-semibold text-brand-green">
                    <Wallet className="h-3 w-3" />
                    {formatWorkerPay(j.price_cents, j.currency)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{j.job_type?.name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
