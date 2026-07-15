import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { completeWorkerOnboarding } from "@/lib/admin.functions";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  component: AcceptInvitePage,
  head: () => ({ meta: [{ title: "Accept invite" }] }),
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const complete = useServerFn(completeWorkerOnboarding);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [stateName, setStateName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    if (!username.trim()) return toast.error("Enter your full name");
    if (!suburb.trim()) return toast.error("Enter your suburb");
    if (!postcode.trim()) return toast.error("Enter your postcode");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setSaving(true);
    try {
      const { error: uerr } = await supabase.auth.updateUser({
        password,
        data: { full_name: username.trim() },
      });
      if (uerr) throw new Error(uerr.message);

      const res = await complete({
        data: {
          full_name: username.trim(),
          phone: phone.trim() || null,
          suburb: suburb.trim(),
          postcode: postcode.trim(),
          state: stateName.trim() || null,
        },
      });
      if (res?.hlSynced === false && res?.reason) {
        toast.warning(`Account ready. HighLevel sync skipped: ${res.reason}`);
      } else {
        toast.success("Account ready");
      }
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
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
          <label className="text-xs font-medium">Full name</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium">Suburb</label>
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="e.g. Parramatta" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Postcode</label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. 2150" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">State (optional)</label>
          <input value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="e.g. NSW" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md hover:brightness-110 active:scale-[0.97] disabled:opacity-60">
          {saving ? "Saving…" : "Finish setup"}
        </button>
      </form>
    </div>
  );
}
