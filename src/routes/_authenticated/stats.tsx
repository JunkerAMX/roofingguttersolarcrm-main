import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { MessagesDialog } from "@/components/messages-dialog";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatCents, formatWorkerPay } from "@/lib/pay";
import { MapPin, Wallet, CheckCircle2, Clock, Briefcase, DollarSign, Users, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { useMemo, useState } from "react";

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
        <h1 className="font-display text-3xl font-bold">Stats</h1>
        <p className="text-sm text-muted-foreground">Business overview & team performance</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Completed" value={String(done.length)} tone="green" />
        <StatCard icon={Clock} label="Outstanding" value={String(due.length)} tone="yellow" />
        <StatCard icon={DollarSign} label="Revenue earned" value={formatCents(totalRevenueDone, currency)} tone="green" />
        <StatCard icon={Briefcase} label="Revenue pending" value={formatCents(totalRevenuePending, currency)} tone="muted" />
        <StatCard icon={Wallet} label="Worker pay owed" value={formatCents(totalPayDone, currency)} tone="green" />
        <StatCard icon={Wallet} label="Worker pay pending" value={formatCents(totalPayPending, currency)} tone="muted" />
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
          {items.map((j: any) => {
            const progress = Array.isArray(j.progress) ? j.progress : [];
            const total = progress.length;
            const doneCount = progress.filter((p: any) => p.completed).length;
            const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
            const price = j.price_cents ? `$${(j.price_cents / 100).toFixed(0)}` : null;
            return (
              <Link
                key={j.id}
                to="/jobs/$jobId"
                params={{ jobId: j.id }}
                className="block rounded-xl border border-border bg-card px-4 py-3 transition-all hover:-translate-y-px hover:border-brand-lime hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {j.contact ? `${j.contact.first_name ?? ""} ${j.contact.last_name ?? ""}`.trim() : "Client"}
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {(j.status as string).replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {j.job_type?.name && <span>{j.job_type.name}</span>}
                      {j.contact?.address && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.contact.address}</span>
                      )}
                      {j.scheduled_for && <span>{format(new Date(j.scheduled_for), "d MMM, h:mm a")}</span>}
                      {j.assignee ? (
                        <span className="text-foreground/80">· {j.assignee.full_name || j.assignee.email}</span>
                      ) : (
                        <span className="text-yellow-700">· Unassigned</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {price && <span className="text-sm font-semibold">{price}</span>}
                    {calculateWorkerPayCents(j.price_cents) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-brand-green/10 px-2 py-0.5 text-[11px] font-semibold text-brand-green">
                        <Wallet className="h-3 w-3" />
                        {formatWorkerPay(j.price_cents, j.currency)}
                      </span>
                    )}
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{doneCount} of {total} tasks</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all ${pct === 100 ? "bg-brand-green" : "bg-brand-lime"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
