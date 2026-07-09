import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllJobs, listTeam, assignJob, deleteJob } from "@/lib/admin.functions";
import { formatWorkerPay } from "@/lib/pay";
import { Trash2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const listFn = useServerFn(listAllJobs);
  const teamFn = useServerFn(listTeam);
  const assignFn = useServerFn(assignJob);
  const delFn = useServerFn(deleteJob);
  const qc = useQueryClient();
  const { data: jobs = [] } = useQuery({ queryKey: ["allJobs"], queryFn: () => listFn() });
  const { data: team = [] } = useQuery({ queryKey: ["team"], queryFn: () => teamFn() });

  const assign = useMutation({
    mutationFn: (v: { jobId: string; assignedTo: string | null }) => assignFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["allJobs"] }); toast.success("Assigned"); },
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["allJobs"] }); toast.success("Job deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3">Client</th>
            <th className="p-3">Due</th>
            <th className="p-3">Status</th>
            <th className="p-3">Assigned</th>
            <th className="p-3">Price</th>
            <th className="p-3 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No jobs yet.</td></tr>}
          {jobs.map((j: any) => (
            <tr key={j.id} className="hover:bg-secondary/30">
              <td className="p-3">
                <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="font-medium text-brand-green hover:underline">
                  {j.contact ? `${j.contact.first_name ?? ""} ${j.contact.last_name ?? ""}`.trim() : "—"}
                </Link>
              </td>
              <td className="p-3 text-xs">{j.due_date ? format(new Date(j.due_date), "d MMM yyyy") : "—"}</td>
              <td className="p-3"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase">{j.status}</span></td>
              <td className="p-3">
                <select
                  value={j.assigned_to ?? ""}
                  onChange={(e) => assign.mutate({ jobId: j.id, assignedTo: e.target.value || null })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="">Unassigned</option>
                  {team.map((t: any) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                </select>
              </td>
              <td className="p-3 text-xs">{j.price_cents ? `$${(j.price_cents / 100).toFixed(2)} ${j.currency}` : "—"}</td>
              <td className="p-3">
              <button
                onClick={() => { if (confirm("Delete this job? This cannot be undone.")) del.mutate(j.id); }}
                disabled={del.isPending}
                className="rounded-lg p-2 text-muted-foreground transition-all duration-200 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-[0.92] disabled:opacity-50"
                aria-label="Delete job"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
