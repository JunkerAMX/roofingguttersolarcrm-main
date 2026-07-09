import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  component: AcceptInvitePage,
  head: () => ({ meta: [{ title: "Accept invite" }] }),
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Supabase parses the URL hash on load and stores a session for invites.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        toast.error("Invite link is invalid or expired.");
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.session.user.email ?? "");
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    if (!username.trim()) return toast.error("Enter a username");
    setSaving(true);
    const { error: uerr } = await supabase.auth.updateUser({
      password,
      data: { full_name: username.trim() },
    });
    if (uerr) { setSaving(false); return toast.error(uerr.message); }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").update({ full_name: username.trim() }).eq("id", u.user.id);
    }
    toast.success("Account ready");
    navigate({ to: "/" });
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading invite…</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Set up your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signing in as {email}</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground disabled:opacity-60">
          {saving ? "Saving…" : "Finish setup"}
        </button>
      </form>
    </div>
  );
}
