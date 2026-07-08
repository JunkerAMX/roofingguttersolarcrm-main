import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/highlevel/job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

        const appt = payload.appointment ?? payload.opportunity ?? payload;
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
          payload.contact_id ??
          payload.contactId ??
          payload.contact?.id ??
          null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up contact
        let contact_id: string | null = null;
        if (highlevel_contact_id) {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("highlevel_contact_id", String(highlevel_contact_id))
            .maybeSingle();
          contact_id = contact?.id ?? null;
        }

        // Resolve job type by slug/name, else default to first active
        const jobTypeHint = payload.job_type ?? payload.jobType ?? appt.job_type ?? appt.calendar_name ?? appt.calendarName ?? null;
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

        const scheduled_for = appt.start_time ?? appt.startTime ?? appt.scheduled_for ?? payload.scheduled_for ?? null;
        const price = payload.price_cents ?? (payload.price ? Math.round(Number(payload.price) * 100) : null);

        const { error } = await supabaseAdmin.from("jobs").upsert({
          highlevel_appointment_id: String(highlevel_appointment_id),
          contact_id,
          job_type_id,
          status,
          scheduled_for,
          due_date: appt.due_date ?? payload.due_date ?? null,
          price_cents: price,
          notes: appt.notes ?? payload.notes ?? null,
          highlevel_payload: payload,
        }, { onConflict: "highlevel_appointment_id" });

        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true, contact_matched: !!contact_id });
      },
    },
  },
});
