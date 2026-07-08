import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/highlevel/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
        // Accept HighLevel's native field names as well as our normalized ones
        const contact = payload.contact ?? payload;
        const highlevel_contact_id =
          payload.highlevel_contact_id ??
          contact.id ??
          contact.contact_id ??
          contact.contactId ??
          payload.contact_id ??
          payload.contactId ??
          payload.id ??
          `unknown-${Date.now()}`;


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("contacts").upsert({
          highlevel_contact_id: String(highlevel_contact_id),
          first_name: contact.first_name ?? contact.firstName ?? payload.first_name ?? payload.firstName ?? null,
          last_name: contact.last_name ?? contact.lastName ?? payload.last_name ?? payload.lastName ?? null,
          email: contact.email ?? payload.email ?? null,
          phone: contact.phone ?? payload.phone ?? null,
          address: contact.address ?? contact.address1 ?? payload.address ?? payload.address1 ?? null,
          city: contact.city ?? payload.city ?? null,
          state: contact.state ?? payload.state ?? null,
          postal_code: contact.postal_code ?? contact.postalCode ?? contact.zip ?? payload.postal_code ?? payload.postalCode ?? payload.zip ?? null,
          notes: contact.notes ?? payload.notes ?? debugNotes,
        }, { onConflict: "highlevel_contact_id" });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
