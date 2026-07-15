import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { completeWorkerOnboarding } from "@/lib/admin.functions";
import { ArrowLeft, ArrowRight, Check, MapPin, Lock, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  component: AcceptInvitePage,
  head: () => ({ meta: [{ title: "Welcome" }] }),
});

const STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "profile", label: "Your details" },
  { key: "location", label: "Where you work" },
  { key: "password", label: "Secure it" },
] as const;

function AcceptInvitePage() {
  const navigate = useNavigate();
  const complete = useServerFn(completeWorkerOnboarding);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(0);
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

  function next() {
    if (step === 1) {
      if (!username.trim()) return toast.error("Enter your full name");
    }
    if (step === 2) {
      if (!suburb.trim()) return toast.error("Enter your suburb");
      if (!postcode.trim()) return toast.error("Enter your postcode");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleFinish() {
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
        toast.success("You're all set");
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-brand-lime/10 p-4">
      <div className="w-full max-w-lg">
        {/* Stepper */}
        <div className="mb-6 flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done && "bg-brand-green text-white",
                    active && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !done && !active && "bg-secondary text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-0.5 flex-1 rounded-full transition-colors", i < step ? "bg-brand-green" : "bg-secondary")} />
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-3xl border border-border bg-card p-8 shadow-lg">
          {step === 0 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-lime/20 text-brand-green">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold">Welcome aboard</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  You've been invited to join the team as <span className="font-medium text-foreground">{email}</span>.
                </p>
              </div>
              <div className="rounded-2xl bg-secondary/50 p-4 text-left text-sm text-muted-foreground">
                We'll take you through a few quick steps:
                <ul className="mt-2 space-y-1.5">
                  <li className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-brand-green" /> Tell us your name and number</li>
                  <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-brand-green" /> Where you're based, so we can send nearby jobs</li>
                  <li className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-brand-green" /> Pick a password to secure your account</li>
                </ul>
              </div>
              <button
                onClick={next}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
              >
                Let's go <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold">Your details</h2>
                <p className="mt-1 text-sm text-muted-foreground">This is how you'll appear on jobs.</p>
              </div>
              <Field label="Full name">
                <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Sam Taylor" className={inputCls} />
              </Field>
              <Field label="Phone" hint="Optional — used if we need to reach you on-site">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" className={inputCls} />
              </Field>
              <StepNav onBack={back} onNext={next} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold">Where you work</h2>
                <p className="mt-1 text-sm text-muted-foreground">We use this to route nearby jobs to you first.</p>
              </div>
              <Field label="Suburb">
                <input autoFocus value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="e.g. Parramatta" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postcode">
                  <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="2150" className={inputCls} />
                </Field>
                <Field label="State" hint="Optional">
                  <input value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="NSW" className={inputCls} />
                </Field>
              </div>
              <StepNav onBack={back} onNext={next} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold">Secure your account</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose a password with at least 8 characters.</p>
              </div>
              <Field label="Password">
                <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className={inputCls} />
              </Field>
              <Field label="Confirm password">
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              </Field>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={back}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium transition-all hover:bg-secondary active:scale-[0.98] disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? "Setting up…" : (<>Finish setup <Check className="h-4 w-4" /></>)}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step].label}
        </p>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        onClick={onBack}
        className="inline-flex items-center justify-center gap-1 rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium transition-all hover:bg-secondary active:scale-[0.98]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        onClick={onNext}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
      >
        Continue <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
