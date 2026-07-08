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
          payload.id;
        if (!highlevel_contact_id) return new Response("Missing highlevel_contact_id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("contacts").upsert({
          highlevel_contact_id: String(highlevel_contact_id),
          first_name: contact.first_name ?? contact.firstName ?? null,
          last_name: contact.last_name ?? contact.lastName ?? null,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          address: contact.address ?? contact.address1 ?? null,
          city: contact.city ?? null,
          state: contact.state ?? null,
          postal_code: contact.postal_code ?? contact.postalCode ?? contact.zip ?? null,
          notes: contact.notes ?? null,
        }, { onConflict: "highlevel_contact_id" });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
