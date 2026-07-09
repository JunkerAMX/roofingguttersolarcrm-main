import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getSettings, saveSettings } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => getFn() });
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    if (data) {
      setCompanyName(data.company_name);
      setCurrency(data.default_currency);
      setWebhookUrl(data.highlevel_payment_webhook_url ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { company_name: companyName, default_currency: currency, highlevel_payment_webhook_url: webhookUrl || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Company</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Company name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Default currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm uppercase" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Payment SMS webhook</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When a worker checks "Mark this job as done", we POST job details to this URL.
            Configure a HighLevel workflow to receive it and send the Stripe payment link SMS to the client.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">HighLevel webhook URL</label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://services.leadconnectorhq.com/hooks/..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97] disabled:opacity-60">
        {save.isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
