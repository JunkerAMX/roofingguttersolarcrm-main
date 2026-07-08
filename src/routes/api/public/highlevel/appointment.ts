import { createFileRoute } from "@tanstack/react-router";

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

        // HighLevel usually wraps the appointment under an `appointment` key and the contact under `contact`.
        const appt = payload.appointment ?? payload;
        const contactSrc = payload.contact ?? (appt.contact ?? appt);

        // Resolve the HighLevel IDs
        const highlevel_appointment_id =
          payload.highlevel_appointment_id ??
          appt.id ??
          appt.appointment_id ??
          appt.appointmentId ??
          payload.appointment_id ??
          payload.appointmentId ??
          payload.id ??
          `unknown-${Date.now()}`;

        const highlevel_contact_id =
          payload.highlevel_contact_id ??
          appt.contact_id ??
          appt.contactId ??
          contactSrc.id ??
          contactSrc.contact_id ??
          contactSrc.contactId ??
          payload.contact_id ??
          payload.contactId ??
          null;

        // Upsert the linked contact if we have a HighLevel contact ID
        let contact_id: string | null = null;
        if (highlevel_contact_id) {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .upsert({
              highlevel_contact_id: String(highlevel_contact_id),
              first_name: contactSrc.first_name ?? contactSrc.firstName ?? payload.first_name ?? payload.firstName ?? null,
              last_name: contactSrc.last_name ?? contactSrc.lastName ?? payload.last_name ?? payload.lastName ?? null,
              email: contactSrc.email ?? payload.email ?? null,
              phone: contactSrc.phone ?? payload.phone ?? null,
              address: contactSrc.address ?? contactSrc.address1 ?? payload.address ?? payload.address1 ?? null,
              city: contactSrc.city ?? payload.city ?? null,
              state: contactSrc.state ?? payload.state ?? null,
              postal_code: contactSrc.postal_code ?? contactSrc.postalCode ?? contactSrc.zip ?? payload.postal_code ?? payload.postalCode ?? payload.zip ?? null,
            }, { onConflict: "highlevel_contact_id" })
            .select("id")
            .maybeSingle();
          contact_id = c?.id ?? null;
        }

        // Resolve job type from calendar/job type hint, fallback to first active type
        const jobTypeHint =
          payload.job_type_slug ??
          payload.jobType ??
          appt.job_type ??
          appt.calendar_name ??
          appt.calendarName ??
          null;

        let job_type_id: string | null = null;
        if (jobTypeHint) {
          const { data: jt } = await supabaseAdmin
            .from("job_types")
            .select("id")
            .or(`slug.eq.${String(jobTypeHint).toLowerCase()},name.ilike.${jobTypeHint}`)
            .maybeSingle();
          job_type_id = jt?.id ?? null;
        }
        if (!job_type_id) {
          const { data: def } = await supabaseAdmin
            .from("job_types")
            .select("id")
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          job_type_id = def?.id ?? null;
        }
        if (!job_type_id) return new Response("No job_types configured", { status: 500 });

        // Map status
        const rawStatus = String(payload.status ?? appt.status ?? "scheduled").toLowerCase();
        type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
        const status: JobStatus =
          rawStatus === "in_progress" ? "in_progress"
          : rawStatus === "completed" || rawStatus === "done" ? "completed"
          : rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled"
          : "scheduled";

        // Resolve assignee by email
        let assigned_to: string | null = null;
        const assigneeEmail = payload.assignee_email ?? appt.assignee_email ?? null;
        if (assigneeEmail) {
          const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", assigneeEmail).maybeSingle();
          assigned_to = prof?.id ?? null;
        }

        const scheduled_for = appt.start_time ?? appt.startTime ?? appt.scheduled_for ?? payload.scheduled_for ?? null;
        const due_date = appt.due_date ?? payload.due_date ?? (scheduled_for ? String(scheduled_for).slice(0, 10) : null);
        const price_cents =
          payload.price_cents ??
          appt.price_cents ??
          (payload.price ? Math.round(Number(payload.price) * 100) : null) ??
          (appt.price ? Math.round(Number(appt.price) * 100) : null) ??
          null;

        // Create or update job
        const { data: job, error: jerr } = await supabaseAdmin
          .from("jobs")
          .upsert({
            highlevel_appointment_id: String(highlevel_appointment_id),
            contact_id,
            job_type_id,
            assigned_to,
            status,
            price_cents,
            currency: payload.currency ?? appt.currency ?? "AUD",
            scheduled_for,
            due_date,
            notes: appt.notes ?? payload.notes ?? null,
            highlevel_payload: payload,
          }, { onConflict: "highlevel_appointment_id" })
          .select("id")
          .maybeSingle();
        if (jerr || !job) return new Response(jerr?.message ?? "Insert failed", { status: 500 });

        // Seed checklist progress from active template (idempotent via unique constraint)
        const { data: tpl } = await supabaseAdmin
          .from("checklist_templates")
          .select("id")
          .eq("job_type_id", job_type_id)
          .eq("active", true)
          .limit(1)
          .maybeSingle();
        if (tpl) {
          const { data: items } = await supabaseAdmin
            .from("checklist_items")
            .select("*")
            .eq("template_id", tpl.id)
            .order("position");
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
