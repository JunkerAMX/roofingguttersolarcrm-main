import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTeam, inviteWorker, deleteTeamMember, updateTeamMember } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Plus, Shield, Trash2, User, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: TeamPage,
});

function TeamPage() {
  const listFn = useServerFn(listTeam);
  const inviteFn = useServerFn(inviteWorker);
  const deleteFn = useServerFn(deleteTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const qc = useQueryClient();
  const { data: team = [] } = useQuery({ queryKey: ["team"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "worker">("worker");
  const [editing, setEditing] = useState<any | null>(null);

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { email, role, redirectTo: `${window.location.origin}/accept-invite` } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Invite email sent");
      setOpen(false); setEmail("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Access revoked"); },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (v: { userId: string; full_name: string; phone: string; stripe_account_id: string; suburb: string; postcode: string; state: string }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Team member updated");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]">
          <Plus className="h-4 w-4" /> Add team member
        </button>
      </div>
      <div className="rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {team.map((m: any) => (
            <li key={m.id} className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-lime/20 text-brand-green">
                {m.roles.includes("admin") ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.full_name || m.email}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                {(m.phone || m.suburb || m.postcode || m.state) && (
                  <div className="truncate text-xs text-muted-foreground">
                    {[m.phone, [m.suburb, m.state, m.postcode].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                  </div>
                )}
                {m.stripe_account_id && (
                  <div className="truncate text-[10px] font-mono text-muted-foreground">Stripe: {m.stripe_account_id}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {m.roles.map((r: string) => (
                  <span key={r} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase">{r}</span>
                ))}
                <button
                  onClick={() => setEditing(m)}
                  className="ml-2 rounded-lg p-2 text-muted-foreground transition-all duration-200 ease-out hover:bg-secondary hover:text-foreground active:scale-[0.92]"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { if (confirm(`Revoke access for ${m.email}? This deletes their account.`)) remove.mutate(m.id); }}
                  disabled={remove.isPending}
                  className="rounded-lg p-2 text-muted-foreground transition-all duration-200 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-[0.92] disabled:opacity-50"
                  aria-label="Revoke access"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Invite team member</h3>
            <p className="mt-1 text-xs text-muted-foreground">They'll get an email to set their username and password.</p>
            <div className="mt-4 space-y-3">
              <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="worker">Worker</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={() => invite.mutate()} disabled={invite.isPending || !email} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97] disabled:opacity-60">
                {invite.isPending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditMemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => update.mutate({ userId: editing.id, ...v })}
          saving={update.isPending}
        />
      )}
    </div>
  );
}

function EditMemberDialog({ member, onClose, onSave, saving }: {
  member: any;
  onClose: () => void;
  onSave: (v: { full_name: string; phone: string; stripe_account_id: string; suburb: string; postcode: string; state: string }) => void;
  saving: boolean;
}) {
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [stripeId, setStripeId] = useState(member.stripe_account_id ?? "");
  const [suburb, setSuburb] = useState(member.suburb ?? "");
  const [postcode, setPostcode] = useState(member.postcode ?? "");
  const [state, setState] = useState(member.state ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold">Edit team member</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{member.email}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Suburb</label>
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Postcode</label>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
              <input value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Stripe account ID</label>
            <input value={stripeId} onChange={(e) => setStripeId(e.target.value)} placeholder="acct_..." className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm" />
            <p className="mt-1 text-[10px] text-muted-foreground">Sent with the payment webhook when this worker completes a job.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-input bg-background py-2 text-sm font-medium">Cancel</button>
            <button
              onClick={() => onSave({ full_name: fullName, phone, stripe_account_id: stripeId, suburb, postcode, state })}
              disabled={saving}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

