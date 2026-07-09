import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { listMyJobs, getMe } from "@/lib/jobs.functions";
import { calculateWorkerPayCents, formatWorkerPay } from "@/lib/pay";
import { format, parseISO } from "date-fns";
import { MapPin, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upcoming")({
  component: UpcomingPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function UpcomingPage() {
  const fn = useServerFn(listMyJobs);
  const meFn = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs", "upcoming"],
    queryFn: () => fn({ data: { scope: "upcoming" } }),
  });

  const isWorker = !!me && !me.isAdmin;
  const byDate = jobs.reduce((acc: Record<string, any[]>, j: any) => {
    const d = j.due_date ?? "unscheduled";
    (acc[d] ??= []).push(j);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Upcoming</h1>
        <p className="text-sm text-muted-foreground">Next 7 days</p>
      </div>

      {Object.keys(byDate).length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
          Nothing scheduled in the next week.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byDate).map(([date, list]) => (
            <section key={date}>
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-brand-green">
                {date === "unscheduled" ? "Unscheduled" : format(parseISO(date), "EEEE, d MMM")}
              </h2>
              <div className="grid gap-2">
                {list.map((j: any) => (
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
                      {j.contact?.address && (
                        <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {j.contact.address}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isWorker && calculateWorkerPayCents(j.price_cents) > 0 && (
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
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
