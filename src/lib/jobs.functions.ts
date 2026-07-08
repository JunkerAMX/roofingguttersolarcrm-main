import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      userId,
      profile,
      roles: (roles ?? []).map((r) => r.role),
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
    };
  });

export const listMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "today" | "upcoming" | "all" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const isAdmin = (await supabase.rpc("has_role", { _user_id: userId, _role: "admin" })).data;

    let q = supabase
      .from("jobs")
      .select("*, contact:contacts(*), job_type:job_types(*), assignee:profiles!jobs_assigned_to_fkey(id, full_name, email)")
      .order("due_date", { ascending: true })
      .order("scheduled_for", { ascending: true });

    if (!isAdmin) q = q.eq("assigned_to", userId);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const in7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

    if (data.scope === "today") q = q.eq("due_date", todayStr).neq("status", "cancelled");
    else if (data.scope === "upcoming") q = q.gte("due_date", todayStr).lte("due_date", in7).neq("status", "cancelled");

    const { data: jobs, error } = await q;
    if (error) throw new Error(error.message);
    return jobs ?? [];
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: job, error }, { data: progress }, { data: photos }] = await Promise.all([
      supabase
        .from("jobs")
        .select("*, contact:contacts(*), job_type:job_types(*), assignee:profiles!jobs_assigned_to_fkey(id, full_name, email)")
        .eq("id", data.jobId)
        .maybeSingle(),
      supabase.from("job_checklist_progress").select("*").eq("job_id", data.jobId).order("position"),
      supabase.from("job_photos").select("*").eq("job_id", data.jobId).order("created_at"),
    ]);
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");
    return { job, progress: progress ?? [], photos: photos ?? [] };
  });

export const toggleChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { progressId: string; completed: boolean; note?: string }) =>
    z.object({ progressId: z.string().uuid(), completed: z.boolean(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prog, error: pErr } = await supabase
      .from("job_checklist_progress")
      .select("*, job:jobs(*)")
      .eq("id", data.progressId)
      .maybeSingle();
    if (pErr || !prog) throw new Error("Not found");

    // Payment trigger: verify prior items complete + fire HighLevel webhook
    if (data.completed && prog.input_type === "payment_trigger") {
      const { data: prior } = await supabase
        .from("job_checklist_progress")
        .select("completed, position")
        .eq("job_id", prog.job_id)
        .lt("position", prog.position);
      if ((prior ?? []).some((p) => !p.completed)) {
        throw new Error("Complete all prior steps first");
      }
      // Fire webhook to HighLevel
      const { data: settings } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (settings?.highlevel_payment_webhook_url) {
        const { data: full } = await supabase
          .from("jobs")
          .select("*, contact:contacts(*)")
          .eq("id", prog.job_id)
          .maybeSingle();
        try {
          await fetch(settings.highlevel_payment_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "job.payment_ready",
              job_id: prog.job_id,
              highlevel_contact_id: full?.contact?.highlevel_contact_id,
              amount_cents: full?.price_cents,
              currency: full?.currency,
              contact: full?.contact,
            }),
          });
        } catch (e) {
          console.error("HL webhook failed", e);
        }
      }
    }

    const { error } = await supabase
      .from("job_checklist_progress")
      .update({
        completed: data.completed,
        completed_at: data.completed ? new Date().toISOString() : null,
        completed_by: data.completed ? userId : null,
        note: data.note ?? prog.note,
      })
      .eq("id", data.progressId);
    if (error) throw new Error(error.message);

    // If all items done, mark job completed
    const { data: remaining } = await supabase
      .from("job_checklist_progress")
      .select("completed")
      .eq("job_id", prog.job_id);
    if ((remaining ?? []).every((r) => r.completed)) {
      await supabase
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", prog.job_id);
    } else {
      await supabase.from("jobs").update({ status: "in_progress" }).eq("id", prog.job_id);
    }

    return { ok: true };
  });

export const uploadJobPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; progressId: string; kind: "before" | "after"; fileBase64: string; contentType: string; ext: string }) =>
    z.object({
      jobId: z.string().uuid(),
      progressId: z.string().uuid(),
      kind: z.enum(["before", "after"]),
      fileBase64: z.string().min(10),
      contentType: z.string(),
      ext: z.string().max(6),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const path = `${data.jobId}/${data.kind}-${Date.now()}.${data.ext}`;
    const { error: upErr } = await supabase.storage
      .from("job-photos")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    await supabase.from("job_photos").insert({
      job_id: data.jobId,
      checklist_item_id: (await supabase.from("job_checklist_progress").select("checklist_item_id").eq("id", data.progressId).maybeSingle()).data?.checklist_item_id,
      kind: data.kind,
      storage_path: path,
      uploaded_by: userId,
    });
    // Mark checklist item complete
    await supabase
      .from("job_checklist_progress")
      .update({ completed: true, completed_at: new Date().toISOString(), completed_by: userId })
      .eq("id", data.progressId);
    return { path };
  });

export const getPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("job-photos")
      .createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
