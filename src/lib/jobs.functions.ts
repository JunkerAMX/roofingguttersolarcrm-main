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
      .select("*, contact:contacts(*), job_type:job_types(*), assignee:profiles!jobs_assigned_to_fkey(id, full_name, email), progress:job_checklist_progress(completed)")
      .order("scheduled_for", { ascending: true });

    if (!isAdmin) q = q.eq("assigned_to", userId);

    const now = new Date();
    // Workers see jobs starting within the next 24 hours, plus already-active
    // (started but not completed) jobs from the past few days.
    const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    const windowStart = new Date(now.getTime() - 3 * 86400000).toISOString();
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();

    if (data.scope === "today") {
      q = q.gte("scheduled_for", windowStart).lte("scheduled_for", windowEnd).neq("status", "completed").neq("status", "cancelled");
    } else if (data.scope === "upcoming") {
      q = q.gte("scheduled_for", now.toISOString()).lte("scheduled_for", in7).neq("status", "cancelled");
    }

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
      supabase
        .from("job_checklist_progress")
        .select("*, checklist_item:checklist_items(position)")
        .eq("job_id", data.jobId),
      supabase.from("job_photos").select("*").eq("job_id", data.jobId).order("created_at"),
    ]);
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");
    const orderedProgress = (progress ?? [])
      .map((p: any) => ({ ...p, position: p.checklist_item?.position ?? p.position }))
      .sort((a: any, b: any) => a.position - b.position);
    return { job, progress: orderedProgress, photos: photos ?? [] };
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

    // Gate: job cannot be worked until its scheduled start time has arrived.
    const jobStart = prog.job?.scheduled_for ? new Date(prog.job.scheduled_for).getTime() : null;
    if (data.completed && jobStart && jobStart > Date.now()) {
      throw new Error("Job isn't active yet — you can start ticking tasks once the appointment time arrives.");
    }


    // Payment trigger: verify prior items complete + fire HighLevel webhook
    let paymentTrigger = false;
    let paymentSent = false;
    let webhookConfigured = false;
    if (data.completed && prog.input_type === "payment_trigger") {
      paymentTrigger = true;
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
        webhookConfigured = true;
        const { data: full } = await supabase
          .from("jobs")
          .select("*, contact:contacts(*), assignee:profiles!jobs_assigned_to_fkey(id, full_name, email, phone, stripe_account_id)")
          .eq("id", prog.job_id)
          .maybeSingle();
        let worker = (full as any)?.assignee ?? null;
        if (!worker) {
          const { data: me } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone, stripe_account_id")
            .eq("id", userId)
            .maybeSingle();
          worker = me ?? null;
        }
        try {
          const res = await fetch(settings.highlevel_payment_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "job.payment_ready",
              job_id: prog.job_id,
              highlevel_contact_id: full?.contact?.highlevel_contact_id,
              amount_cents: full?.price_cents,
              currency: full?.currency,
              service_details: (full as any)?.service_details ?? null,
              is_two_storey: (full as any)?.is_two_storey ?? null,
              two_storey_answer: (full as any)?.is_two_storey === true ? "yes" : (full as any)?.is_two_storey === false ? "no" : null,
              contact: full?.contact,
              worker,
              worker_stripe_account_id: worker?.stripe_account_id ?? null,
              worker_id: worker?.id ?? null,
              worker_name: worker?.full_name ?? null,
              worker_email: worker?.email ?? null,
              worker_phone: worker?.phone ?? null,
            }),
          });

          if (res.ok) paymentSent = true;
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

    // Reflect activity on the job status but do NOT auto-complete —
    // the worker must explicitly tap "Mark job as done".
    const { data: remaining } = await supabase
      .from("job_checklist_progress")
      .select("completed")
      .eq("job_id", prog.job_id);
    const anyDone = (remaining ?? []).some((r) => r.completed);
    if (anyDone) {
      await supabase.from("jobs").update({ status: "in_progress" }).eq("id", prog.job_id);
    }

    return { ok: true, paymentTrigger, paymentSent, webhookConfigured };
  });

export const markJobDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: items, error: iErr } = await supabase
      .from("job_checklist_progress")
      .select("completed")
      .eq("job_id", data.jobId);
    if (iErr) throw new Error(iErr.message);
    if (!items || items.length === 0) throw new Error("No checklist to complete");
    if (items.some((i) => !i.completed)) throw new Error("Finish all checklist items first");
    const { error } = await supabase
      .from("jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
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
    const { data: jobRow } = await supabase.from("jobs").select("scheduled_for").eq("id", data.jobId).maybeSingle();
    const jobStart = jobRow?.scheduled_for ? new Date(jobRow.scheduled_for).getTime() : null;
    if (jobStart && jobStart > Date.now()) {
      throw new Error("Job isn't active yet — you can start uploading photos once the appointment time arrives.");
    }
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
