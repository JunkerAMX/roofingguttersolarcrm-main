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

export const moveArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; lat: number; lng: number }) =>
    z.object({
      id: z.string().uuid(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const geo = await reverseGeocode(data.lat, data.lng);
    const { error } = await context.supabase
      .from("worker_areas")
      .update({ lat: data.lat, lng: data.lng, postcode: geo.postcode, suburb: geo.suburb, label: geo.formatted })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddFromPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; points: { lat: number; lng: number }[] }) =>
    z.object({
      user_id: z.string().uuid(),
      points: z.array(z.object({ lat: z.number(), lng: z.number() })).min(1).max(60),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    // Reverse geocode all points in parallel, dedupe by postcode.
    const results = await Promise.all(
      data.points.map(async (p) => {
        try {
          const g = await reverseGeocode(p.lat, p.lng);
          return { ...p, ...g };
        } catch {
          return { ...p, postcode: null, suburb: null, formatted: null };
        }
      }),
    );
    // Also skip postcodes this worker already has.
    const { data: existing } = await context.supabase
      .from("worker_areas")
      .select("postcode")
      .eq("user_id", data.user_id);
    const have = new Set((existing ?? []).map((r: any) => r.postcode).filter(Boolean));
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const r of results) {
      if (!r.postcode) continue;
      if (have.has(r.postcode) || seen.has(r.postcode)) continue;
      seen.add(r.postcode);
      rows.push({
        user_id: data.user_id,
        lat: r.lat,
        lng: r.lng,
        postcode: r.postcode,
        suburb: r.suburb,
        label: r.formatted,
      });
    }
    if (rows.length) {
      const { error } = await context.supabase.from("worker_areas").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { added: rows.length, postcodes: rows.map((r) => r.postcode) };
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

export const listPolygons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("worker_polygons").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const savePolygon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; points: { lat: number; lng: number }[] }) =>
    z.object({
      user_id: z.string().uuid(),
      points: z.array(z.object({ lat: z.number(), lng: z.number() })).max(500),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("worker_polygons")
      .upsert({ user_id: data.user_id, points: data.points, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const a = await context.supabase.from("worker_areas").delete().not("id", "is", null);
    if (a.error) throw new Error(a.error.message);
    const p = await context.supabase.from("worker_polygons").delete().not("user_id", "is", null);
    if (p.error) throw new Error(p.error.message);
    return { ok: true };
  });


