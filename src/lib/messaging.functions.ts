import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listJobMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: msgs, error } = await supabase
      .from("job_messages")
      .select("*")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((msgs ?? []).map((m) => m.sender_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (msgs ?? []).map((m) => ({ ...m, sender: map.get(m.sender_id) ?? null }));
  });

export const sendJobMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; body: string }) =>
    z.object({ jobId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: msg, error } = await supabase
      .from("job_messages")
      .insert({ job_id: data.jobId, sender_id: userId, body: data.body })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { data: senderRow } = await supabase.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle();
    const msgWithSender = { ...msg, sender: senderRow ?? null };

    // Notify the other party via service role
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, assigned_to, contact:contacts(first_name, last_name)")
      .eq("id", data.jobId)
      .maybeSingle();

    const { data: senderProfile } = await supabaseAdmin
      .from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    const senderName = senderProfile?.full_name || senderProfile?.email || "Someone";
    const contactName = job?.contact
      ? `${job.contact.first_name ?? ""} ${job.contact.last_name ?? ""}`.trim() || "job"
      : "job";

    const recipients = new Set<string>();
    // Notify admins (except self)
    const { data: admins } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin");
    for (const a of admins ?? []) if (a.user_id !== userId) recipients.add(a.user_id);
    // Notify assignee if different from sender
    if (job?.assigned_to && job.assigned_to !== userId) recipients.add(job.assigned_to);

    if (recipients.size > 0) {
      await supabaseAdmin.from("notifications").insert(
        Array.from(recipients).map((uid) => ({
          user_id: uid,
          kind: "message",
          title: `${senderName} · ${contactName}`,
          body: data.body.slice(0, 140),
          link: `/jobs/${data.jobId}`,
          job_id: data.jobId,
        })),
      );
    }
    return msgWithSender;
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids?: string[]; all?: boolean }) =>
    z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (data.ids && data.ids.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
