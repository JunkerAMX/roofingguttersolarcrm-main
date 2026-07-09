import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { listWorkers, listAreas, addArea, deleteArea, updateArea, moveArea, bulkAddFromPoints, listPolygons, savePolygon, clearAll } from "@/lib/areas.functions";
import { toast } from "sonner";
import { Copy, Trash2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/areas")({
  component: AreasPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

const WORKER_COLORS = [
  "#16a34a", "#2563eb", "#dc2626", "#ea580c", "#9333ea", "#0891b2",
  "#ca8a04", "#db2777", "#4f46e5", "#059669", "#7c3aed", "#e11d48",
];

type PolygonPoint = { lat: number; lng: number };

function stableWorkerColor(workerId: string) {
  let hash = 0;
  for (let i = 0; i < workerId.length; i++) hash = (hash * 31 + workerId.charCodeAt(i)) >>> 0;
  return WORKER_COLORS[hash % WORKER_COLORS.length];
}

declare global {
  interface Window { __initGmap?: () => void; google?: any; }
}

let mapsPromise: Promise<any> | null = null;
function loadMaps(): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (mapsPromise) return mapsPromise;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  mapsPromise = new Promise((resolve, reject) => {
    window.__initGmap = () => resolve(window.google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&loading=async&callback=__initGmap&channel=${channel ?? ""}`;
    s.async = true;
    s.onerror = () => { mapsPromise = null; reject(new Error("Failed to load Google Maps")); };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

function AreasPage() {
  const qc = useQueryClient();
  const workersFn = useServerFn(listWorkers);
  const areasFn = useServerFn(listAreas);
  const addFn = useServerFn(addArea);
  const delFn = useServerFn(deleteArea);
  const updFn = useServerFn(updateArea);
  const moveFn = useServerFn(moveArea);
  const bulkFn = useServerFn(bulkAddFromPoints);
  const polygonsFn = useServerFn(listPolygons);
  const savePolyFn = useServerFn(savePolygon);

  const { data: workers = [], isSuccess: workersLoaded } = useQuery({ queryKey: ["areas", "workers"], queryFn: () => workersFn() });
  const { data: areas = [] } = useQuery({ queryKey: ["areas", "list"], queryFn: () => areasFn() });
  const { data: polygons = [], isSuccess: polygonsLoaded } = useQuery({ queryKey: ["areas", "polygons"], queryFn: () => polygonsFn() });


  const [selectedWorker, setSelectedWorker] = useState<string>("");
  useEffect(() => {
    if (!selectedWorker && workers.length) setSelectedWorker(workers[0].id);
  }, [workers, selectedWorker]);

  const workerColor = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w: any) => map.set(w.id, stableWorkerColor(w.id)));
    return map;
  }, [workers]);

  const add = useMutation({
    mutationFn: (v: { user_id: string; lat: number; lng: number }) => addFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(r?.postcode ? `Added ${r.postcode}` : "Pin added");
      qc.invalidateQueries({ queryKey: ["areas", "list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas", "list"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const upd = useMutation({
    mutationFn: (v: { id: string; postcode?: string; user_id?: string }) => updFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas", "list"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: (v: { id: string; lat: number; lng: number }) => moveFn({ data: v }),
    onSuccess: () => {
      toast.success("Pin moved");
      qc.invalidateQueries({ queryKey: ["areas", "list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (v: { user_id: string; points: { lat: number; lng: number }[] }) => bulkFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(r.added ? `Added ${r.added} postcode${r.added === 1 ? "" : "s"}: ${r.postcodes.join(", ")}` : "No new postcodes in that area");
      qc.invalidateQueries({ queryKey: ["areas", "list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clearAllFn = useServerFn(clearAll);
  const clearAllM = useMutation({
    mutationFn: () => clearAllFn(),
    onSuccess: () => {
      toast.success("Cleared all workers");
      // Reset every on-map polygon to empty (sync effect won't touch existing polys).
      polysRef.current.forEach((poly) => clearPolyPath(poly));
      qc.setQueryData(["areas", "polygons"], []);
      qc.invalidateQueries({ queryKey: ["areas", "list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Map bootstrap
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;
    loadMaps()
      .then((g) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        mapRef.current = new g.maps.Map(mapEl.current, {
          center: { lat: -33.8688, lng: 151.2093 },
          zoom: 10,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        // Force a resize once mounted so tiles paint even if container sized late.
        requestAnimationFrame(() => {
          if (mapRef.current && window.google) {
            window.google.maps.event.trigger(mapRef.current, "resize");
          }
        });
        setMapReady(true);
      })
      .catch((e) => toast.error(e.message));
    return () => { cancelled = true; };
  }, []);

  const selectedRef = useRef(selectedWorker);
  selectedRef.current = selectedWorker;

  // Persistent polygons per worker: keyed by user_id, always rendered.
  const polysRef = useRef<Map<string, any>>(new Map());
  const listenersRef = useRef<any[]>([]);

  const syncPolygonCache = (uid: string, points: PolygonPoint[]) => {
    qc.setQueryData(["areas", "polygons"], (old: any[] = []) => {
      const others = (old ?? []).filter((p: any) => p.user_id !== uid);
      return [...others, { user_id: uid, points, updated_at: new Date().toISOString() }];
    });
  };

  const readPolygonPoints = (poly: any) => {
    const pts: PolygonPoint[] = [];
    const path = poly.getPath?.();
    path?.forEach((p: any) => pts.push({ lat: p.lat(), lng: p.lng() }));
    return pts;
  };

  const clearPolyPath = (poly: any) => {
    const path = poly.getPath?.();
    if (!path) return;
    while (path.getLength()) path.removeAt(path.getLength() - 1);
  };

  const queuedSaves = useRef<Map<string, { points: PolygonPoint[]; allowEmpty: boolean }>>(new Map());
  const activeSaves = useRef<Set<string>>(new Set());

  const flushPolySave = async (uid: string) => {
    if (activeSaves.current.has(uid)) return;
    const next = queuedSaves.current.get(uid);
    if (!next) return;
    queuedSaves.current.delete(uid);
    activeSaves.current.add(uid);
    try {
      await savePolyFn({ data: { user_id: uid, points: next.points, allowEmpty: next.allowEmpty } });
      syncPolygonCache(uid, next.points);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      activeSaves.current.delete(uid);
      if (queuedSaves.current.has(uid)) void flushPolySave(uid);
    }
  };

  // Debounced, serialized save when a polygon path is edited.
  const saveTimers = useRef<Map<string, any>>(new Map());
  const schedulePolySave = (uid: string, poly: any, allowEmpty = false) => {
    const t = saveTimers.current.get(uid);
    if (t) clearTimeout(t);
    saveTimers.current.set(uid, setTimeout(() => {
      const points = readPolygonPoints(poly);
      if (points.length === 0 && !allowEmpty) return;
      queuedSaves.current.set(uid, { points, allowEmpty });
      void flushPolySave(uid);
    }, 250));
  };

  const buildPoly = (uid: string, pts: PolygonPoint[]) => {
    const g = window.google;
    const color = workerColor.get(uid) ?? "#16a34a";
    const poly = new g.maps.Polygon({
      fillColor: color,
      strokeColor: color,
      strokeOpacity: 1,
      draggable: false,
      map: mapRef.current,
    });
    poly.setPath(pts);
    // Non-select click selects the worker.
    listenersRef.current.push(poly.addListener("click", () => {
      if (selectedRef.current !== uid) setSelectedWorker(uid);
    }));
    // Path edit auto-saves for the active worker.
    const path = poly.getPath?.();
    ["set_at", "insert_at", "remove_at"].forEach((ev) => {
      const listener = path?.addListener?.(ev, () => {
        if (selectedRef.current === uid) schedulePolySave(uid, poly);
      });
      if (listener) listenersRef.current.push(listener);
    });
    return poly;
  };

  // Sync polygons to data (create/update, don't wipe on selection change).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google) return;
    if (!workersLoaded || !polygonsLoaded) return;
    const byUser = new Map<string, PolygonPoint[]>();
    for (const w of workers as any[]) byUser.set(w.id, []);
    for (const p of polygons as any[]) {
      const pts = Array.isArray(p.points) ? p.points : [];
      byUser.set(p.user_id, pts);
    }
    // Remove polys for workers that no longer exist.
    polysRef.current.forEach((poly, uid) => {
      if (!byUser.has(uid)) { poly.setMap(null); polysRef.current.delete(uid); }
    });
    // Create or update each worker's polygon.
    byUser.forEach((pts, uid) => {
      if (!polysRef.current.has(uid)) {
        // First time we see this worker — hydrate from data. After this, the on-map
        // polygon is the source of truth; we never overwrite it from cached data,
        // so debounced saves can't clobber in-progress edits.
        polysRef.current.set(uid, buildPoly(uid, pts));
      }
    });
  }, [mapReady, polygons, workers, workersLoaded, polygonsLoaded]);

  // Restyle polygons when selection changes (no rebuild).
  useEffect(() => {
    polysRef.current.forEach((poly, uid) => {
      const isSelected = uid === selectedWorker;
      poly.setOptions({
        fillColor: workerColor.get(uid) ?? "#16a34a",
        strokeColor: workerColor.get(uid) ?? "#16a34a",
        fillOpacity: isSelected ? 0.3 : 0.22,
        strokeWeight: isSelected ? 3 : 2,
        clickable: !isSelected,
        editable: isSelected,
        zIndex: isSelected ? 10 : 1,
      });
    });
  }, [selectedWorker, polygons, workers, workerColor]);


  // Map click always appends a vertex to the selected worker's polygon (auto-saves).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google) return;
    const g = window.google;
    const listener = mapRef.current.addListener("click", (e: any) => {
      const uid = selectedRef.current;
      if (!uid) { toast.error("Select a worker first"); return; }
      let poly = polysRef.current.get(uid);
      if (!poly) {
        poly = buildPoly(uid, []);
        polysRef.current.set(uid, poly);
      }
      const path = poly.getPath?.();
      if (!path) return;
      path.push(e.latLng);
      schedulePolySave(uid, poly);
    });
    return () => g.maps.event.removeListener(listener);
  }, [mapReady]);

  const clearPolygon = () => {
    if (!selectedWorker) return;
    // Reset on-map polygon immediately, then persist.
    const poly = polysRef.current.get(selectedWorker);
    if (poly) clearPolyPath(poly);
    queuedSaves.current.set(selectedWorker, { points: [], allowEmpty: true });
    void flushPolySave(selectedWorker);
    toast.success("Area cleared");
  };

  const finishPolygon = () => {
    const uid = selectedRef.current;
    const g = window.google;
    const poly = polysRef.current.get(uid);
    if (!uid || !poly) return;
    const path = poly.getPath?.();
    if (!path) return;
    if (path.getLength() < 3) { toast.error("Add at least 3 points"); return; }
    const bounds = new g.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
    const steps = 7;
    const points: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const lat = sw.lat() + ((ne.lat() - sw.lat()) * i) / steps;
        const lng = sw.lng() + ((ne.lng() - sw.lng()) * j) / steps;
        const pt = new g.maps.LatLng(lat, lng);
        if (g.maps.geometry.poly.containsLocation(pt, poly)) {
          points.push({ lat, lng });
        }
      }
    }
    
    if (!points.length) { toast.error("Area too small"); return; }
    bulk.mutate({ user_id: uid, points: points.slice(0, 60) });
  };






  // JSON grouped output
  const grouped = useMemo(() => {
    const byWorker: Record<string, { name: string; email: string; postcodes: string[] }> = {};
    for (const w of workers) byWorker[w.id] = { name: w.full_name ?? "", email: w.email ?? "", postcodes: [] };
    for (const a of areas) {
      if (!byWorker[a.user_id]) continue;
      if (a.postcode && !byWorker[a.user_id].postcodes.includes(a.postcode)) {
        byWorker[a.user_id].postcodes.push(a.postcode);
      }
    }
    return Object.values(byWorker)
      .filter((w) => w.postcodes.length)
      .map((w) => ({ ...w, postcodes: w.postcodes.sort() }));
  }, [workers, areas]);

  const json = JSON.stringify(grouped, null, 2);

  // Duplicate postcodes: same postcode assigned to more than one worker.
  const duplicatePostcodes = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of areas as any[]) {
      if (!a.postcode) continue;
      if (!map.has(a.postcode)) map.set(a.postcode, new Set());
      map.get(a.postcode)!.add(a.user_id);
    }
    const dupes: { postcode: string; workers: string[] }[] = [];
    map.forEach((users, pc) => {
      if (users.size > 1) {
        const names = [...users].map((uid) => {
          const w: any = workers.find((x: any) => x.id === uid);
          return w?.full_name || w?.email || "Unknown";
        });
        dupes.push({ postcode: pc, workers: names });
      }
    });
    return dupes.sort((a, b) => a.postcode.localeCompare(b.postcode));
  }, [areas, workers]);
  const dupeSet = useMemo(() => new Set(duplicatePostcodes.map((d) => d.postcode)), [duplicatePostcodes]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Service Areas</h2>
        <p className="text-sm text-muted-foreground">Pick a worker, then <b>click the map</b> to add points around their area. Drag any point to reshape (auto-saves). Hit <b>Finish → postcodes</b> to auto-add every postcode inside.</p>
      </div>

      {duplicatePostcodes.length > 0 && (
        <div className="rounded-2xl border border-amber-400/60 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="font-semibold">⚠ Duplicate postcodes across workers ({duplicatePostcodes.length})</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {duplicatePostcodes.map((d) => (
              <li key={d.postcode}><b>{d.postcode}</b> — {d.workers.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active worker</label>
            <div className="mt-2 space-y-1">
              {workers.map((w: any) => {
                const color = workerColor.get(w.id) ?? "#16a34a";
                const count = areas.filter((a: any) => a.user_id === w.id).length;
                const active = selectedWorker === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWorker(w.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
                      active ? "border-brand-green bg-brand-green/5" : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="flex-1 truncate">{w.full_name || w.email}</span>
                    <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold">{count}</span>
                  </button>
                );
              })}
              {workers.length === 0 && (
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No workers yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="relative h-[520px] overflow-hidden rounded-2xl border border-border bg-secondary">
          <div ref={mapEl} className="h-full w-full" />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>
          )}
          {mapReady && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-2">
              <button
                onClick={finishPolygon}
                className="rounded-full bg-brand-green px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110"
              >
                Finish → postcodes
              </button>
              <button
                onClick={clearPolygon}
                className="rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-destructive shadow hover:bg-background"
              >
                Clear this worker
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete ALL worker areas and pins across every worker? This cannot be undone.")) {
                    clearAllM.mutate();
                  }
                }}
                className="rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110"
              >
                Clear all
              </button>
            </div>
          )}
          {(add.isPending || bulk.isPending || move.isPending) && (
            <div className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs shadow">
              {bulk.isPending ? "Scanning postcodes…" : "Looking up postcode…"}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-display font-semibold">Pins ({areas.length})</h3>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Worker</th>
                <th className="p-2 text-left">Postcode</th>
                <th className="p-2 text-left">Suburb</th>
                <th className="p-2 text-left">Label</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {areas.map((a: any) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-2">
                    <select
                      value={a.user_id}
                      onChange={(e) => upd.mutate({ id: a.id, user_id: e.target.value })}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {workers.map((w: any) => (
                        <option key={w.id} value={w.id}>{w.full_name || w.email}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      defaultValue={a.postcode ?? ""}
                      onBlur={(e) => e.target.value !== (a.postcode ?? "") && upd.mutate({ id: a.id, postcode: e.target.value })}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="p-2 text-muted-foreground">{a.suburb ?? "—"}</td>
                  <td className="p-2 text-muted-foreground truncate max-w-[240px]">{a.label ?? "—"}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => del.mutate(a.id)} className="rounded p-1 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {areas.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                  <MapPin className="mx-auto mb-2 h-6 w-6" /> Click the map to add pins.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-display font-semibold">JSON output</h3>
          <button
            onClick={() => { navigator.clipboard.writeText(json); toast.success("Copied"); }}
            className="flex items-center gap-1 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
        <pre className="max-h-80 overflow-auto p-4 text-xs">{json}</pre>
      </div>
    </div>
  );
}
