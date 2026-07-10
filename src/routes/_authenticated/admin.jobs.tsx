import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAllJobs, listTeam, assignJob, deleteJob, updateJob, listJobTypes, listContacts } from "@/lib/admin.functions";
import { formatWorkerPay } from "@/lib/pay";
import { Trash2, Wallet, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateOnly, formatJobDateTime, getJobTimeZone } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/admin/jobs")({
  component: JobsPage,
});

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function JobsPage() {
  const listFn = useServerFn(listAllJobs);
  const teamFn = useServerFn(listTeam);
  const assignFn = useServerFn(assignJob);
  const delFn = useServerFn(deleteJob);
  const qc = useQueryClient();
  const { data: jobs = [] } = useQuery({ queryKey: ["allJobs"], queryFn: () => listFn() });
  const { data: team = [] } = useQuery({ queryKey: ["team"], queryFn: () => teamFn() });

  const [editing, setEditing] = useState<any | null>(null);

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
            <th className="p-3">Time</th>
            <th className="p-3">Due</th>
            <th className="p-3">Status</th>
            <th className="p-3">Assigned</th>
            <th className="p-3">Price</th>
            <th className="p-3">Worker pay</th>
            <th className="p-3 w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No jobs yet.</td></tr>}
          {jobs.map((j: any) => (
            <tr key={j.id} className="hover:bg-secondary/30">
              <td className="p-3">
                <Link to="/jobs/$jobId" params={{ jobId: j.id }} className="font-medium text-brand-green hover:underline">
                  {j.contact ? `${j.contact.first_name ?? ""} ${j.contact.last_name ?? ""}`.trim() : "—"}
                </Link>
              </td>
              <td className="p-3 text-xs">{j.scheduled_for ? formatJobDateTime(j.scheduled_for, getJobTimeZone(j)) : "—"}</td>
              <td className="p-3 text-xs">{formatDateOnly(j.due_date)}</td>
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
              <td className="p-3 text-xs">
                {j.price_cents ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-brand-green/10 px-2 py-1 font-semibold text-brand-green">
                    <Wallet className="h-3 w-3" />
                    {formatWorkerPay(j.price_cents, j.currency)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(j)}
                    className="rounded-lg p-2 text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-[0.92]"
                    aria-label="Edit job"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this job? This cannot be undone.")) del.mutate(j.id); }}
                    disabled={del.isPending}
                    className="rounded-lg p-2 text-muted-foreground transition-all duration-200 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-[0.92] disabled:opacity-50"
                    aria-label="Delete job"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <EditJobModal job={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditJobModal({ job, onClose }: { job: any; onClose: () => void }) {
  const updateFn = useServerFn(updateJob);
  const jobTypesFn = useServerFn(listJobTypes);
  const contactsFn = useServerFn(listContacts);
  const qc = useQueryClient();
  const { data: jobTypes = [] } = useQuery({ queryKey: ["jobTypes"], queryFn: () => jobTypesFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => contactsFn() });

  const [form, setForm] = useState({
    job_type_id: job.job_type_id ?? "",
    contact_id: job.contact_id ?? "",
    status: job.status ?? "scheduled",
    price: job.price_cents != null ? (job.price_cents / 100).toString() : "",
    currency: job.currency ?? "AUD",
    scheduled_for: toDatetimeLocal(job.scheduled_for),
    due_date: job.due_date ?? "",
    notes: job.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: job.id,
        job_type_id: form.job_type_id || undefined,
        contact_id: form.contact_id || null,
        status: form.status as any,
        price_cents: form.price.trim() === "" ? null : Math.round(parseFloat(form.price) * 100),
        currency: form.currency,
        scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
        due_date: form.due_date || null,
        notes: form.notes,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allJobs"] });
      toast.success("Job updated");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit job</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Contact" className="col-span-2">
            <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5">
              <option value="">— None —</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || c.phone || "Unnamed"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job type">
            <select value={form.job_type_id} onChange={(e) => setForm({ ...form, job_type_id: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5">
              {jobTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5">
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Scheduled for">
            <input type="datetime-local" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </Field>
          <Field label="Due date">
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </Field>
          <Field label="Price">
            <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </Field>
          <Field label="Currency">
            <input type="text" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={8} className="w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </Field>
          <Field label="Notes" className="col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={2000} className="w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
