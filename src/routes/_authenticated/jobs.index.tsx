import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatCents, formatWorkerPay } from "@/lib/pay";
import { MapPin, Clock, DollarSign, Wallet, CheckCircle2, Lock } from "lucide-react";
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, startOfDay } from "date-fns";
import { useNow } from "@/hooks/use-now";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useScramble } from "@/hooks/use-scramble";


export const Route = createFileRoute("/_authenticated/jobs/")({
  component: JobsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function sectionLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, d MMMM yyyy");
}

function groupJobsByDay(jobs: any[]) {
  const groups = new Map<string, { label: string; date: Date; jobs: any[] }>();
  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    const date = startOfDay(new Date(job.scheduled_for));
    const key = date.toISOString();
    if (!groups.has(key)) {
      groups.set(key, { label: sectionLabel(date), date, jobs: [] });
    }
    groups.get(key)!.jobs.push(job);
  }
  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function JobsPage() {
  const fn = useServerFn(listMyJobs);
  const meFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "today"],
    queryFn: () => fn({ data: { scope: "today" } }),
  });
  useRealtimeInvalidate(["jobs", "job_checklist_progress"], [["jobs"]]);


  const isWorker = !!me && !me.isAdmin;
  const sections = groupJobsByDay(jobs);
  const todayPayCents = jobs.reduce((sum, j) => sum + calculateWorkerPayCents(j.price_cents), 0);
  const payCurrency = jobs[0]?.currency ?? "";

  return (
    <AppShell>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Jobs</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-4">
          {todayPayCents > 0 && (
            <div className="text-right">
              <div className="font-display text-2xl font-semibold text-brand-green">{formatCents(todayPayCents, payCurrency)}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">today's pay</div>
            </div>
          )}
          <div className="text-right">
            <div className="font-display text-2xl font-semibold text-brand-green">{jobs.length}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">jobs</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-secondary/60" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-brand-lime" />
          <h3 className="mt-4 font-display text-lg font-semibold">All clear</h3>
          <p className="mt-1 text-sm text-muted-foreground">No jobs scheduled for today.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.date.toISOString()}>
              <h2 className="sticky top-0 z-10 mb-3 bg-background/95 py-2 font-display text-lg font-semibold text-foreground">
                {section.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.jobs.map((j: any) => <JobCard key={j.id} job={j} showPay isWorker={isWorker} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function JobCard({ job, showPay, isWorker }: { job: any; showPay?: boolean; isWorker?: boolean }) {
  const now = useNow(15000);
  const { scrambleFirst, scrambleLast, scrambleAddress, scrambleCity } = useScramble();
  const price = job.price_cents ? `$${(job.price_cents / 100).toFixed(2)}` : null;

  const startMs = job.scheduled_for ? new Date(job.scheduled_for).getTime() : null;
  const isActive = startMs ? startMs <= now : true;
  const statusColor = !isActive
    ? "bg-brand-yellow/30 text-yellow-900"
    : ({
        scheduled: "bg-brand-lime/30 text-green-900",
        in_progress: "bg-brand-lime/30 text-green-900",
        completed: "bg-brand-green text-white",
        cancelled: "bg-muted text-muted-foreground",
      }[job.status as string] ?? "bg-muted");
  const statusLabel = !isActive ? "upcoming" : (job.status as string).replace("_", " ");

  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className="group block rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-lime hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight">
            {job.contact ? `${scrambleFirst(job.contact.first_name) ?? ""} ${scrambleLast(job.contact.last_name) ?? ""}`.trim() || "Client" : "Unassigned contact"}
          </h3>
          <p className="text-xs text-muted-foreground">{job.job_type?.name ?? "Job"}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
      {job.contact?.address && (
        <div className="mb-1 flex items-start gap-2 text-sm text-foreground/80">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
          <span>{scrambleAddress(job.contact.address)}{job.contact.city ? `, ${scrambleCity(job.contact.city)}` : ""}</span>
        </div>
      )}

      {job.scheduled_for && (
        <div className="mb-1 flex items-center gap-2 text-sm text-foreground/80">
          {isActive ? <Clock className="h-4 w-4 text-brand-green" /> : <Lock className="h-4 w-4 text-yellow-700" />}
          <span>
            {format(new Date(job.scheduled_for), "EEE h:mm a")}
            {!isActive && startMs && <span className="ml-2 text-xs text-muted-foreground">· starts in {formatDistanceToNow(new Date(startMs))}</span>}
          </span>
        </div>
      )}
      {price && (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="h-4 w-4 text-brand-green" />
          <span>{price} {job.currency}</span>
        </div>
      )}
      {showPay && calculateWorkerPayCents(job.price_cents) > 0 && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-green/10 px-2.5 py-1 text-sm font-semibold text-brand-green">
          <Wallet className="h-4 w-4" />
          <span>Your pay {formatWorkerPay(job.price_cents)}</span>
        </div>
      )}
    </Link>
  );
}
