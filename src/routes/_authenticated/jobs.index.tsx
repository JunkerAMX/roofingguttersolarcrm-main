import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatCents, formatWorkerPay } from "@/lib/pay";
import { MapPin, Clock, DollarSign, Wallet, CheckCircle2, Lock, LayoutGrid, List } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useScramble } from "@/hooks/use-scramble";
import { formatJobDateTime, formatJobFullDate, getJobTimeZone, startOfDayInAppTz } from "@/lib/time";

const VIEW_MODE_KEY = "jobs-view-mode";
type ViewMode = "grid" | "list";

export const Route = createFileRoute("/_authenticated/jobs/")({
  component: JobsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function sectionLabel(job: any) {
  const tz = getJobTimeZone(job);
  const key = startOfDayInAppTz(job.scheduled_for, tz);
  const today = startOfDayInAppTz(new Date(), tz);
  const tomorrow = startOfDayInAppTz(new Date(Date.now() + 86400000), tz);
  const yesterday = startOfDayInAppTz(new Date(Date.now() - 86400000), tz);
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  if (key === yesterday) return "Yesterday";
  return formatJobFullDate(job.scheduled_for, tz);
}

function groupJobsByDay(jobs: any[]) {
  const groups = new Map<string, { label: string; key: string; jobs: any[] }>();
  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    const key = startOfDayInAppTz(job.scheduled_for, getJobTimeZone(job));
    if (!groups.has(key)) {
      groups.set(key, { label: sectionLabel(job), key, jobs: [] });
    }
    groups.get(key)!.jobs.push(job);
  }
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function JobsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (window.localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) : null;
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

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
        <div className="flex items-center gap-3">
          {todayPayCents > 0 && (
            <div className="hidden text-right sm:block">
              <div className="font-display text-2xl font-semibold text-brand-green">{formatCents(todayPayCents, payCurrency)}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">today's pay</div>
            </div>
          )}
          <div className="hidden text-right sm:block">
            <div className="font-display text-2xl font-semibold text-brand-green">{jobs.length}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">jobs</div>
          </div>
          <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => handleSetViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Grid view"
              className={`rounded-lg p-2 transition-colors ${viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
              className={`rounded-lg p-2 transition-colors ${viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-shimmer h-32 rounded-2xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="animate-pop rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-brand-lime" />
          <h3 className="mt-4 font-display text-lg font-semibold">All clear</h3>
          <p className="mt-1 text-sm text-muted-foreground">No jobs scheduled for today. Enjoy the break.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const isToday = section.label === "Today";
            return (
              <section key={section.key}>
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {section.jobs.length} {section.jobs.length === 1 ? "job" : "jobs"}
                  </span>
                </div>
                {viewMode === "grid" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {section.jobs.map((j: any) => (
                      <JobCard key={j.id} job={j} showPay isWorker={isWorker} highlight={isToday} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {section.jobs.map((j: any) => (
                      <JobListItem key={j.id} job={j} showPay isWorker={isWorker} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}




    </AppShell>
  );
}

function useJobStatus(job: any) {
  const now = useNow(15000);
  const startMs = job.scheduled_for ? new Date(job.scheduled_for).getTime() : null;
  const isActive = startMs ? startMs <= now : true;
  const statusColor = !isActive
    ? "bg-warning/10 text-warning"
    : ({
        scheduled: "bg-brand-green/10 text-brand-green",
        in_progress: "bg-brand-green/10 text-brand-green",
        completed: "bg-brand-green/10 text-brand-green",
        cancelled: "bg-muted/40 text-muted-foreground",
      }[job.status as string] ?? "bg-muted/40 text-muted-foreground");
  const statusLabel = !isActive ? "upcoming" : (job.status as string).replace("_", " ");
  return { isActive, statusColor, statusLabel, startMs };
}

function JobCard({ job, showPay, isWorker }: { job: any; showPay?: boolean; isWorker?: boolean }) {
  const { scrambleFirst, scrambleLast, scrambleAddress, scrambleCity } = useScramble();
  const price = job.price_cents ? `$${(job.price_cents / 100).toFixed(2)}` : null;
  const { isActive, statusColor, statusLabel, startMs } = useJobStatus(job);

  const activeOutline = isActive ? "ring-2 ring-brand-green ring-offset-2 ring-offset-background" : "";

  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className={`group block rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-lime hover:shadow-md ${activeOutline}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight">
            {job.contact
              ? `${scrambleFirst(job.contact.first_name) ?? ""} ${scrambleLast(job.contact.last_name) ?? ""}`.trim() || "Client"
              : "Unassigned contact"}
          </h3>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-brand-green">{job.job_type?.name ?? "Job"}</span>
            {job.service_details ? <span className="text-foreground/80"> · {job.service_details}</span> : null}
            {job.is_two_storey ? <span className="ml-1.5 inline-flex items-center rounded bg-brand-yellow/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-yellow">2-storey</span> : null}
          </p>

        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
      {job.contact?.address && (
        <div className="mb-1 flex items-start gap-2 text-sm text-foreground/80">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
          <span>
            {scrambleAddress(job.contact.address)}
            {job.contact.city ? `, ${scrambleCity(job.contact.city)}` : ""}
          </span>
        </div>
      )}

      {job.scheduled_for && (
        <div className="mb-1 flex items-center gap-2 text-sm text-foreground/80">
          {isActive ? <Clock className="h-4 w-4 text-brand-green" /> : <Lock className="h-4 w-4 text-warning" />}
          <span>
            {formatJobDateTime(job.scheduled_for, getJobTimeZone(job))}
            {!isActive && startMs && (
              <span className="ml-2 text-xs text-muted-foreground">· starts in {formatDistanceToNow(new Date(startMs))}</span>
            )}
          </span>
        </div>
      )}
      {price && (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="h-4 w-4 text-brand-green" />
          <span>
            {price} {job.currency}
          </span>
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

function JobListItem({ job, showPay, isWorker }: { job: any; showPay?: boolean; isWorker?: boolean }) {
  const { scrambleFirst, scrambleLast, scrambleAddress, scrambleCity } = useScramble();
  const price = job.price_cents ? `$${(job.price_cents / 100).toFixed(2)}` : null;
  const { isActive, statusColor, statusLabel, startMs } = useJobStatus(job);

  const activeOutline = isActive ? "ring-2 ring-brand-green ring-offset-2 ring-offset-background" : "";

  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className={`group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-brand-lime hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${activeOutline}`}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="font-display text-base font-semibold leading-tight">
            {job.contact
              ? `${scrambleFirst(job.contact.first_name) ?? ""} ${scrambleLast(job.contact.last_name) ?? ""}`.trim() || "Client"
              : "Unassigned contact"}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-brand-green">{job.job_type?.name ?? "Job"}</span>
          {job.service_details ? <span className="text-foreground/80"> · {job.service_details}</span> : null}
          {job.is_two_storey ? <span className="ml-1.5 inline-flex items-center rounded bg-brand-yellow/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-yellow">2-storey</span> : null}
        </p>

        {job.contact?.address && (
          <div className="mt-1 flex items-center gap-2 text-sm text-foreground/80">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-green" />
            <span className="truncate">
              {scrambleAddress(job.contact.address)}
              {job.contact.city ? `, ${scrambleCity(job.contact.city)}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/80 sm:justify-end">
        {job.scheduled_for && (
          <div className="flex items-center gap-1.5">
            {isActive ? <Clock className="h-4 w-4 text-brand-green" /> : <Lock className="h-4 w-4 text-warning" />}
            <span>{formatJobDateTime(job.scheduled_for, getJobTimeZone(job))}</span>
            {!isActive && startMs && (
              <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(startMs))}</span>
            )}
          </div>
        )}
        {price && (
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <DollarSign className="h-4 w-4 text-brand-green" />
            <span>
              {price} {job.currency}
            </span>
          </div>
        )}
        {showPay && calculateWorkerPayCents(job.price_cents) > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand-green/10 px-2 py-1 text-sm font-semibold text-brand-green">
            <Wallet className="h-4 w-4" />
            <span>{formatWorkerPay(job.price_cents)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
