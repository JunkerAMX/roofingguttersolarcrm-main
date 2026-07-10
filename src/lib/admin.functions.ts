import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin only");
}

export const listJobTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("job_types").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listTemplatesWithItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tpls, error } = await context.supabase
      .from("checklist_templates")
      .select("*, job_type:job_types(*), items:checklist_items(*)")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (tpls ?? []).map((t: any) => ({
      ...t,
      items: (t.items ?? []).sort((a: any, b: any) => a.position - b.position),
    }));
  });

export const saveChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    template_id: string;
    title: string;
    description?: string;
    input_type: "checkbox" | "photo_before" | "photo_after" | "payment_trigger" | "note";
    position: number;
    required?: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.id) {
      const { error } = await context.supabase
        .from("checklist_items")
        .update({
          title: data.title,
          description: data.description,
          input_type: data.input_type,
          position: data.position,
          required: data.required ?? true,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("checklist_items").insert({
        template_id: data.template_id,
        title: data.title,
        description: data.description,
        input_type: data.input_type,
        position: data.position,
        required: data.required ?? true,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("checklist_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: profiles, error } = await context.supabase.from("profiles").select("*").order("full_name");
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
    }));
  });

export const inviteWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role: "admin" | "worker"; redirectTo: string }) =>
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "worker"]),
      redirectTo: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
      data: { invited_role: data.role },
    });
    if (error) throw new Error(error.message);
    if (data.role === "admin" && invited.user) {
      await supabaseAdmin.from("user_roles").insert({ user_id: invited.user.id, role: "admin" });
    }
    return { ok: true, userId: invited.user?.id };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't remove yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const contactSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().max(80).nullable().optional(),
  last_name: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().or(z.literal("")).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  postal_code: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const saveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof contactSchema>) => contactSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    const clean = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, typeof value === "string" && value.trim() === "" ? null : value]),
    );
    const { error } = await context.supabase.from("contacts").update(clean as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("*, contact:contacts(*), assignee:profiles!jobs_assigned_to_fkey(id, full_name)")
      .order("due_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; assignedTo: string | null }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("jobs")
      .update({ assigned_to: data.assignedTo })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateJobSchema = z.object({
  id: z.string().uuid(),
  job_type_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  price_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  scheduled_for: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof updateJobSchema>) => updateJobSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }
    const { error } = await context.supabase.from("jobs").update(clean).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    return data;
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { company_name?: string; default_currency?: string; highlevel_payment_webhook_url?: string | null }) => d)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("app_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    return {
      contactUrl: "/api/public/highlevel/contact",
      appointmentUrl: "/api/public/highlevel/appointment",
    };
  });
