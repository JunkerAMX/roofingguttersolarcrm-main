import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWebhookInfo } from "@/lib/admin.functions";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const fn = useServerFn(getWebhookInfo);
  const { data } = useQuery({ queryKey: ["webhookInfo"], queryFn: () => fn() });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function copy(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Copied");
  }

  const urls = data ? [
    { label: "Contact sync", url: origin + data.contactUrl },
    { label: "Appointment → Job", url: origin + data.appointmentUrl },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">HighLevel webhook endpoints</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your HighLevel automations to POST to these URLs. Include an <code className="rounded bg-secondary px-1">x-webhook-signature</code> header
          computed as HMAC-SHA256 of the raw JSON body using your <code className="rounded bg-secondary px-1">HIGHLEVEL_WEBHOOK_SECRET</code>.
        </p>
        <div className="mt-4 space-y-2">
          {urls.map((u) => (
            <div key={u.url} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-brand-green">{u.label}</div>
                <div className="truncate font-mono text-xs">{u.url}</div>
              </div>
              <button onClick={() => copy(u.url)} className="rounded-lg p-2 hover:bg-secondary"><Copy className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Expected payloads</h2>
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <div className="font-medium">Contact:</div>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary/70 p-3 text-xs">{`{
  "highlevel_contact_id": "abc123",
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane@example.com",
  "phone": "+61 400 000 000",
  "address": "1 Example St",
  "city": "Sydney",
  "state": "NSW",
  "postal_code": "2000"
}`}</pre>
          </div>
          <div>
            <div className="font-medium">Appointment (fires 1 day before appointment):</div>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-secondary/70 p-3 text-xs">{`{
  "highlevel_appointment_id": "appt_123",
  "highlevel_contact_id": "abc123",
  "job_type_slug": "gutter-cleaning",
  "scheduled_for": "2026-07-09T09:00:00Z",
  "due_date": "2026-07-09",
  "price_cents": 25000,
  "currency": "AUD",
  "assignee_email": "worker@rgs.com",
  "notes": "Two-storey house, ladder access from side"
}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
