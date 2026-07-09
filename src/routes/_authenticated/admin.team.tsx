import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTeam, inviteWorker, deleteTeamMember } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Plus, Shield, Trash2, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: TeamPage,
});

function TeamPage() {
  const listFn = useServerFn(listTeam);
  const inviteFn = useServerFn(inviteWorker);
  const deleteFn = useServerFn(deleteTeamMember);
  const qc = useQueryClient();
  const { data: team = [] } = useQuery({ queryKey: ["team"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "worker">("worker");

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
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
              <div className="flex-1">
                <div className="font-medium">{m.full_name || m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              <div className="flex items-center gap-1">
                {m.roles.map((r: string) => (
                  <span key={r} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase">{r}</span>
                ))}
                <button
                  onClick={() => { if (confirm(`Revoke access for ${m.email}? This deletes their account.`)) remove.mutate(m.id); }}
                  disabled={remove.isPending}
                  className="ml-2 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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
              <button onClick={() => invite.mutate()} disabled={invite.isPending || !email} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground disabled:opacity-60">
                {invite.isPending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
