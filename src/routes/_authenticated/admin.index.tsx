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

  const contactUrl = data ? origin + data.contactUrl : "";
  const appointmentUrl = data ? origin + data.appointmentUrl : "";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">HighLevel sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Point your HighLevel automation/webhook at the URL below. Send one JSON object per request — arrays are not supported.
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs font-semibold text-brand-green">Contact webhook</div>
            <p className="text-xs text-muted-foreground">Creates or updates a contact.</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{contactUrl}</code>
              <button onClick={() => copy(contactUrl)} className="rounded-lg p-2 hover:bg-secondary" aria-label="Copy contact webhook URL">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary/70 p-3 text-xs">{`{
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

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs font-semibold text-brand-green">Appointment / Job webhook</div>
            <p className="text-xs text-muted-foreground">Creates or updates a job from one appointment.</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{appointmentUrl}</code>
              <button onClick={() => copy(appointmentUrl)} className="rounded-lg p-2 hover:bg-secondary" aria-label="Copy appointment webhook URL">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary/70 p-3 text-xs">{`{
  "highlevel_appointment_id": "appt_123",
  "highlevel_contact_id": "abc123",
  "job_type_slug": "gutter-cleaning",
  "scheduled_for": "2026-07-09T09:00:00Z",
  "price": 249,
  "currency": "AUD",
  "assignee_email": "worker@rgs.com",
  "notes": "Two-storey house, ladder access from side"
}`}</pre>
            <p className="mt-2 text-xs text-muted-foreground">
              <code className="rounded bg-secondary px-1">price</code> is whole dollars (e.g. 249). <code className="rounded bg-secondary px-1">due_date</code> is auto-set from the appointment start date if not provided.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              You can also send HighLevel&apos;s native shape with <code className="rounded bg-secondary px-1">appointment</code> and{" "}
              <code className="rounded bg-secondary px-1">contact</code> objects. Only one appointment per request.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
