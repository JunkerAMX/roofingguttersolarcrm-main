import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { MessagesDialog } from "@/components/messages-dialog";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatCents } from "@/lib/pay";
import { MapPin, Wallet, TrendingUp, Users, MessageSquare, ArrowRight, CircleDot } from "lucide-react";
import { format, isThisMonth, isThisWeek } from "date-fns";
import { useMemo, useState } from "react";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useScramble } from "@/hooks/use-scramble";
import { formatJobDayMonth, getJobTimeZone } from "@/lib/time";



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

type Range = "week" | "month" | "all";

function StatsInner() {
  const fn = useServerFn(listMyJobs);
  const meFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: () => fn({ data: { scope: "all" } }),
  });
  const [msgJobId, setMsgJobId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("all");
  useRealtimeInvalidate(["jobs", "job_checklist_progress"], [["jobs"]]);

  const jobs = useMemo(() => {
    if (range === "all") return allJobs;
    return allJobs.filter((j: any) => {
      const d = j.completed_at || j.scheduled_for || j.created_at;
      if (!d) return false;
      const dt = new Date(d);
      return range === "week" ? isThisWeek(dt, { weekStartsOn: 1 }) : isThisMonth(dt);
    });
  }, [allJobs, range]);

  const s = useMemo(() => {
    const done = jobs.filter((j: any) => j.status === "completed");
    const due = jobs.filter((j: any) => j.status !== "completed" && j.status !== "cancelled");
    const currency = jobs[0]?.currency ?? "";
    const revenueDone = done.reduce((n, j) => n + (j.price_cents ?? 0), 0);
    const revenuePending = due.reduce((n, j) => n + (j.price_cents ?? 0), 0);
    const payDone = done.reduce((n, j) => n + calculateWorkerPayCents(j.price_cents), 0);
    const payPending = due.reduce((n, j) => n + calculateWorkerPayCents(j.price_cents), 0);
    const profitDone = revenueDone - payDone;
    return { done, due, currency, revenueDone, revenuePending, payDone, payPending, profitDone };
  }, [jobs]);

  const perWorker = useMemo(() => {
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
  }, [jobs]);

  const maxWorkerRevenue = Math.max(1, ...perWorker.map((w) => w.revenue));

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl bg-secondary/60" />
          <div className="grid grid-cols-3 gap-3"><div className="h-24 animate-pulse rounded-2xl bg-secondary/60" /><div className="h-24 animate-pulse rounded-2xl bg-secondary/60" /><div className="h-24 animate-pulse rounded-2xl bg-secondary/60" /></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Header + range */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Stats</h1>
          <p className="text-sm text-muted-foreground">Business overview & team performance</p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1 text-xs font-medium">
          {(["week", "month", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1.5 capitalize transition ${range === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r === "all" ? "All time" : `This ${r}`}
            </button>
          ))}
        </div>
      </div>

      {/* Hero revenue card */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary to-brand-green p-6 text-primary-foreground shadow-lg sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
          <TrendingUp className="h-3.5 w-3.5" /> Revenue earned
        </div>
        <div className="mt-2 font-display text-5xl font-bold sm:text-6xl">{formatCents(s.revenueDone, s.currency)}</div>
        <div className="mt-1 text-sm text-primary-foreground/80">
          from {s.done.length} completed job{s.done.length === 1 ? "" : "s"}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-primary-foreground/15 pt-5 text-sm">
          <HeroStat label="Profit" value={formatCents(s.profitDone, s.currency)} />
          <HeroStat label="Worker pay" value={formatCents(s.payDone, s.currency)} />
          <HeroStat label="Pending revenue" value={formatCents(s.revenuePending, s.currency)} />
        </div>
      </div>

      {/* Pipeline row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PipelineCard label="Completed" value={s.done.length} accent="green" />
        <PipelineCard label="Outstanding" value={s.due.length} accent="amber" />
        <PipelineCard label="Pending pay" value={formatCents(s.payPending, s.currency)} accent="muted" />
        <PipelineCard label="Avg job value" value={formatCents(s.done.length ? Math.round(s.revenueDone / s.done.length) : 0, s.currency)} accent="muted" />
      </div>

      {/* By worker */}
      {perWorker.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Users className="h-4 w-4 text-brand-green" /> By worker
            </h2>
            <span className="text-xs text-muted-foreground">Ranked by revenue</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {perWorker.map((w) => {
              const pct = Math.round((w.revenue / maxWorkerRevenue) * 100);
              return (
                <div key={w.name} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{w.name}</div>
                      <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                        <span><span className="font-semibold text-brand-green">{w.done}</span> done</span>
                        <span><span className="font-semibold text-warning">{w.due}</span> due</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-lg font-semibold">{formatCents(w.revenue, w.revenue ? s.currency : "")}</div>
                      <div className="text-[11px] text-brand-green">{formatCents(w.pay, w.pay ? s.currency : "")} pay</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-green to-brand-lime" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Jobs lists */}
      {jobs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
          No jobs in this period.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <JobColumn tone="amber" title="Outstanding" items={s.due} emptyLabel="Nothing outstanding — nice." currency={s.currency} currentUserId={me?.userId} onOpenMessages={setMsgJobId} />
          <JobColumn tone="green" title="Completed" items={s.done} emptyLabel="No completed jobs yet." currency={s.currency} currentUserId={me?.userId} onOpenMessages={setMsgJobId} />
        </div>
      )}
      {msgJobId && <MessagesDialog jobId={msgJobId} currentUserId={me?.userId} onClose={() => setMsgJobId(null)} />}
    </AppShell>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-primary-foreground/70">{label}</div>
      <div className="mt-0.5 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}

function PipelineCard({ label, value, accent }: { label: string; value: string | number; accent: "green" | "amber" | "muted" }) {
  const dot = accent === "green" ? "bg-brand-green" : accent === "amber" ? "bg-warning" : "bg-muted-foreground/40";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function JobColumn({ tone, title, items, emptyLabel, currency, currentUserId: _u, onOpenMessages }: { tone: "amber" | "green"; title: string; items: any[]; emptyLabel: string; currency: string; currentUserId?: string; onOpenMessages?: (jobId: string) => void }) {
  const { scrambleFirst, scrambleLast, scrambleAddress } = useScramble();

  const chipCls = tone === "green" ? "bg-brand-green/10 text-brand-green" : "bg-warning/10 text-warning";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipCls}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="grid gap-2">
          {items.map((j: any) => {
            const progress = Array.isArray(j.progress) ? j.progress : [];
            const total = progress.length;
            const doneCount = progress.filter((p: any) => p.completed).length;
            const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
            const price = j.price_cents ? formatCents(j.price_cents, currency) : null;
            const pay = calculateWorkerPayCents(j.price_cents);
            return (
              <div key={j.id} className="group rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-px hover:border-brand-lime hover:shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {j.contact ? `${scrambleFirst(j.contact.first_name) ?? ""} ${scrambleLast(j.contact.last_name) ?? ""}`.trim() || "Client" : "Client"}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {j.job_type?.name && <span>{j.job_type.name}</span>}
                      {j.contact?.address && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{scrambleAddress(j.contact.address)}</span></span>}
                      {j.scheduled_for && <span>· {formatJobDayMonth(j.scheduled_for, getJobTimeZone(j))}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-muted-foreground">{j.assignee?.full_name || j.assignee?.email || "Unassigned"}</span>
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end sm:gap-1">
                    {price && <span className="font-display text-base font-semibold">{price}</span>}
                    {pay > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold text-brand-green">
                        <Wallet className="h-3 w-3" />
                        {formatCents(pay, currency)}
                      </span>
                    )}
                    {onOpenMessages && (
                      <button onClick={() => onOpenMessages(j.id)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-brand-green" aria-label="Open messages">
                        <MessageSquare className="h-3 w-3" /> Chat
                      </button>
                    )}
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{doneCount}/{total} tasks</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-brand-green" : "bg-brand-lime"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
