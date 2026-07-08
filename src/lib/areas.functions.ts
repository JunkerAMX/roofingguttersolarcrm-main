import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin only");
}

async function reverseGeocode(lat: number, lng: number) {
  const key = process.env.LOVABLE_API_KEY;
  const gmk = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !gmk) throw new Error("Google Maps not configured");
  const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${lat},${lng}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": gmk },
  });
  if (!res.ok) throw new Error(`Geocode failed [${res.status}]: ${await res.text()}`);
  const j: any = await res.json();
  const first = j.results?.[0];
  if (!first) return { postcode: null as string | null, suburb: null as string | null, formatted: null as string | null };
  const comps: any[] = first.address_components ?? [];
  const find = (t: string) => comps.find((c) => c.types?.includes(t))?.long_name ?? null;
  return {
    postcode: find("postal_code"),
    suburb: find("locality") ?? find("sublocality") ?? find("postal_town"),
    formatted: first.formatted_address ?? null,
  };
}

export const listWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("worker_areas")
      .select("*, worker:profiles!worker_areas_user_id_fkey(id, full_name, email)")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; lat: number; lng: number; label?: string }) =>
    z.object({
      user_id: z.string().uuid(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const geo = await reverseGeocode(data.lat, data.lng);
    const { data: row, error } = await context.supabase
      .from("worker_areas")
      .insert({
        user_id: data.user_id,
        lat: data.lat,
        lng: data.lng,
        postcode: geo.postcode,
        suburb: geo.suburb,
        label: data.label ?? geo.formatted,
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; user_id?: string; postcode?: string; label?: string }) =>
    z.object({
      id: z.string().uuid(),
      user_id: z.string().uuid().optional(),
      postcode: z.string().max(20).optional(),
      label: z.string().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const patch: any = {};
    if (data.user_id) patch.user_id = data.user_id;
    if (data.postcode !== undefined) patch.postcode = data.postcode;
    if (data.label !== undefined) patch.label = data.label;
    const { error } = await context.supabase.from("worker_areas").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("worker_areas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
