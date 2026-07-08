import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/highlevel/appointment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let p: any;
        try { p = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve contact
        let contactId: string | null = null;
        if (p.highlevel_contact_id) {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .upsert({
              highlevel_contact_id: p.highlevel_contact_id,
              first_name: p.first_name ?? null,
              last_name: p.last_name ?? null,
              email: p.email ?? null,
              phone: p.phone ?? null,
              address: p.address ?? null,
              city: p.city ?? null,
              state: p.state ?? null,
              postal_code: p.postal_code ?? null,
            }, { onConflict: "highlevel_contact_id" })
            .select("id")
            .maybeSingle();
          contactId = c?.id ?? null;
        }

        // Resolve job type (default gutter-cleaning)
        const slug = p.job_type_slug || "gutter-cleaning";
        const { data: jt } = await supabaseAdmin.from("job_types").select("id").eq("slug", slug).maybeSingle();
        if (!jt) return new Response("Unknown job_type_slug", { status: 400 });

        // Resolve assignee by email
        let assignee: string | null = null;
        if (p.assignee_email) {
          const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", p.assignee_email).maybeSingle();
          assignee = prof?.id ?? null;
        }

        // Create or update job
        const { data: job, error: jerr } = await supabaseAdmin
          .from("jobs")
          .upsert({
            highlevel_appointment_id: p.highlevel_appointment_id,
            contact_id: contactId,
            job_type_id: jt.id,
            assigned_to: assignee,
            status: "scheduled",
            price_cents: p.price_cents ?? null,
            currency: p.currency ?? "AUD",
            scheduled_for: p.scheduled_for ?? null,
            due_date: p.due_date ?? (p.scheduled_for ? String(p.scheduled_for).slice(0, 10) : null),
            notes: p.notes ?? null,
            highlevel_payload: p,
          }, { onConflict: "highlevel_appointment_id" })
          .select("id")
          .maybeSingle();
        if (jerr || !job) return new Response(jerr?.message ?? "Insert failed", { status: 500 });

        // Seed checklist progress from active template (idempotent via unique constraint)
        const { data: tpl } = await supabaseAdmin
          .from("checklist_templates")
          .select("id")
          .eq("job_type_id", jt.id)
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

        return Response.json({ ok: true, job_id: job.id });
      },
    },
  },
});
