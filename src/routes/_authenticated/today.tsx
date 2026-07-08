import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMyJobs } from "@/lib/jobs.functions";
import { MapPin, Clock, DollarSign, CheckCircle2, Lock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/today")({
  component: TodayPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function TodayPage() {
  const fn = useServerFn(listMyJobs);
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "today"],
    queryFn: () => fn({ data: { scope: "today" } }),
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Today</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold text-brand-green">{jobs.length}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">jobs</div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {jobs.map((j: any) => <JobCard key={j.id} job={j} />)}
        </div>
      )}
    </AppShell>
  );
}

function JobCard({ job }: { job: any }) {
  const price = job.price_cents ? `$${(job.price_cents / 100).toFixed(2)}` : null;
  const statusColor = {
    scheduled: "bg-brand-yellow/30 text-yellow-900",
    in_progress: "bg-brand-lime/30 text-green-900",
    completed: "bg-brand-green text-white",
    cancelled: "bg-muted text-muted-foreground",
  }[job.status as string] ?? "bg-muted";

  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className="group block rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-lime hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight">
            {job.contact ? `${job.contact.first_name ?? ""} ${job.contact.last_name ?? ""}`.trim() || "Client" : "Unassigned contact"}
          </h3>
          <p className="text-xs text-muted-foreground">{job.job_type?.name ?? "Job"}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
          {job.status.replace("_", " ")}
        </span>
      </div>
      {job.contact?.address && (
        <div className="mb-1 flex items-start gap-2 text-sm text-foreground/80">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
          <span>{job.contact.address}{job.contact.city ? `, ${job.contact.city}` : ""}</span>
        </div>
      )}
      {job.scheduled_for && (
        <div className="mb-1 flex items-center gap-2 text-sm text-foreground/80">
          <Clock className="h-4 w-4 text-brand-green" />
          <span>{format(new Date(job.scheduled_for), "h:mm a")}</span>
        </div>
      )}
      {price && (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="h-4 w-4 text-brand-green" />
          <span>{price} {job.currency}</span>
        </div>
      )}
    </Link>
  );
}
