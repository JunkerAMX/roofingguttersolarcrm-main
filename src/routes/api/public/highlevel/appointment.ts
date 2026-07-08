import { createFileRoute } from "@tanstack/react-router";

function pick(...vals: any[]) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return v;
  }
  return null;
}

// Price arrives in whole dollars (e.g. 249). Store as cents.
function toCents(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const cleaned = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(cleaned) || cleaned === 0) return cleaned === 0 ? 0 : null;
  return Math.round(cleaned * 100);
}

function toDateOnly(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/highlevel/appointment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

        if (Array.isArray(payload)) {
          return new Response("Send a single appointment object, not an array.", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const appt = payload.appointment ?? {};
        const contactSrc = payload.contact ?? {};
        const custom = payload.customData ?? payload.custom_data ?? {};
        const loc = payload.location ?? contactSrc.location ?? {};

        const highlevel_appointment_id = pick(
          custom.highlevel_appointment_id,
          payload.highlevel_appointment_id,
          appt.id, appt.appointment_id, appt.appointmentId,
          payload.appointment_id, payload.appointmentId,
        ) ?? `hl-${payload.contact_id ?? payload.id ?? Date.now()}`;

        const highlevel_contact_id = pick(
          custom.highlevel_contact_id,
          payload.highlevel_contact_id,
          appt.contact_id, appt.contactId,
          contactSrc.id, contactSrc.contact_id, contactSrc.contactId,
          payload.contact_id, payload.contactId,
        );

        // Upsert contact
        let contact_id: string | null = null;
        if (highlevel_contact_id) {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .upsert({
              highlevel_contact_id: String(highlevel_contact_id),
              first_name: pick(contactSrc.first_name, contactSrc.firstName, payload.first_name, payload.firstName),
              last_name: pick(contactSrc.last_name, contactSrc.lastName, payload.last_name, payload.lastName),
              email: pick(contactSrc.email, payload.email),
              phone: pick(contactSrc.phone, payload.phone),
              address: pick(contactSrc.address, contactSrc.address1, payload.address, payload.address1, payload.full_address, loc.address, loc.fullAddress),
              city: pick(contactSrc.city, payload.city, loc.city),
              state: pick(contactSrc.state, payload.state, loc.state),
              postal_code: pick(contactSrc.postal_code, contactSrc.postalCode, contactSrc.zip, payload.postal_code, payload.postalCode, payload.zip, loc.postalCode, loc.postal_code),
            }, { onConflict: "highlevel_contact_id" })
            .select("id")
            .maybeSingle();
          contact_id = c?.id ?? null;
        }

        // Job type
        const jobTypeHint = pick(
          custom.job_type_slug, custom.jobType,
          payload.job_type_slug, payload.jobType,
          appt.job_type, appt.calendar_name, appt.calendarName,
          Array.isArray(payload.Service) ? payload.Service[0] : payload.Service,
        );
        let job_type_id: string | null = null;
        if (jobTypeHint) {
          const hint = String(jobTypeHint).toLowerCase().trim();
          const { data: jt } = await supabaseAdmin
            .from("job_types")
            .select("id")
            .or(`slug.eq.${hint},name.ilike.${jobTypeHint}`)
            .maybeSingle();
          job_type_id = jt?.id ?? null;
        }
        if (!job_type_id) {
          const { data: def } = await supabaseAdmin
            .from("job_types").select("id").eq("active", true)
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          job_type_id = def?.id ?? null;
        }
        if (!job_type_id) return new Response("No job_types configured", { status: 500 });

        // Status
        const rawStatus = String(pick(custom.status, payload.status, appt.status) ?? "scheduled").toLowerCase();
        type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
        const status: JobStatus =
          rawStatus === "in_progress" ? "in_progress"
          : rawStatus === "completed" || rawStatus === "done" ? "completed"
          : rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled"
          : "scheduled";

        // Assignee
        let assigned_to: string | null = null;
        const assigneeEmail = pick(custom.assignee_email, payload.assignee_email, appt.assignee_email);
        if (assigneeEmail) {
          const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", assigneeEmail).maybeSingle();
          assigned_to = prof?.id ?? null;
        }

        const scheduled_for = pick(
          custom.scheduled_for,
          appt.start_time, appt.startTime, appt.scheduled_for,
          payload.start_time, payload.startTime, payload.scheduled_for,
          payload.appointment_start_time, payload.appointmentStartTime,
        );
        // Due date = HL appointment start date (YYYY-MM-DD), or explicit override.
        const due_date = toDateOnly(pick(custom.due_date, appt.due_date, payload.due_date)) ?? toDateOnly(scheduled_for);
        // Price sent in whole dollars (e.g. 249) → converted to cents for storage.
        const price_cents = toCents(pick(custom.price, payload.price, appt.price, custom.price_cents, payload.price_cents, appt.price_cents));
        const notes = pick(custom.notes, appt.notes, payload.notes, payload.Message);

        const { data: job, error: jerr } = await supabaseAdmin
          .from("jobs")
          .upsert({
            highlevel_appointment_id: String(highlevel_appointment_id),
            contact_id,
            job_type_id,
            assigned_to,
            status,
            price_cents,
            currency: pick(custom.currency, payload.currency, appt.currency) ?? "AUD",
            scheduled_for,
            due_date,
            notes,
            highlevel_payload: payload,
          }, { onConflict: "highlevel_appointment_id" })
          .select("id")
          .maybeSingle();
        if (jerr || !job) return new Response(jerr?.message ?? "Insert failed", { status: 500 });

        // Seed checklist
        const { data: tpl } = await supabaseAdmin
          .from("checklist_templates").select("id")
          .eq("job_type_id", job_type_id).eq("active", true).limit(1).maybeSingle();
        if (tpl) {
          const { data: items } = await supabaseAdmin
            .from("checklist_items").select("*").eq("template_id", tpl.id).order("position");
          if (items && items.length) {
            const rows = items.map((it) => ({
              job_id: job.id,
              checklist_item_id: it.id,
              position: it.position,
              title: it.title,
              input_type: it.input_type,
            }));
            await supabaseAdmin.from("job_checklist_progress").upsert(rows, { onConflict: "job_id,checklist_item_id" });
          }
        }

        return Response.json({ ok: true, job_id: job.id, contact_matched: !!contact_id });
      },
    },
  },
});
