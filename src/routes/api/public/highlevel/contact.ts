import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/highlevel/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.HIGHLEVEL_WEBHOOK_SECRET;
        if (!secret) return new Response("Server not configured", { status: 500 });
        const raw = await request.text();
        if (!verifySignature(raw, request.headers.get("x-webhook-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
        if (!payload.highlevel_contact_id) return new Response("Missing highlevel_contact_id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("contacts").upsert({
          highlevel_contact_id: payload.highlevel_contact_id,
          first_name: payload.first_name ?? null,
          last_name: payload.last_name ?? null,
          email: payload.email ?? null,
          phone: payload.phone ?? null,
          address: payload.address ?? null,
          city: payload.city ?? null,
          state: payload.state ?? null,
          postal_code: payload.postal_code ?? null,
          notes: payload.notes ?? null,
        }, { onConflict: "highlevel_contact_id" });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
