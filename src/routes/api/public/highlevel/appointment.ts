import { createFileRoute } from "@tanstack/react-router";

function pick(...vals: any[]) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return v;
  }
  return null;
}

function cleanText(v: any): string | null {
  if (v === undefined || v === null) return null;
  const text = String(v).trim();
  if (!text) return null;
  if (["none", "null", "n/a", "na", "nil", "-"].includes(text.toLowerCase())) return null;
  return text;
}

function pickText(...vals: any[]): string | null {
  for (const v of vals) {
    const text = cleanText(v);
    if (text) return text;
  }
  return null;
}

// Price arrives in whole dollars (e.g. 249). Store as cents.
function toCents(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const cleaned = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(cleaned) || cleaned === 0) return cleaned === 0 ? 0 : null;
  return Math.round(cleaned * 100);
}

function toDateOnly(v: any, tz?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += 2000;
    return `${year}-${String(+dmy[2]).padStart(2, "0")}-${String(+dmy[1]).padStart(2, "0")}`;
  }
  const wall = parseWallClockString(s);
  if (wall) return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  const zone = tz || "Australia/Sydney";
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(d); // YYYY-MM-DD in tz
}

function parseWallClockString(s: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (iso) {
    return { year: +iso[1], month: +iso[2], day: +iso[3], hour: +iso[4], minute: +iso[5], second: +(iso[6] ?? 0) };
  }
  const long = s.match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (long) {
    const month = new Date(`${long[1]} 1, 2000`).getMonth() + 1;
    if (!month) return null;
    let hour = +long[4];
    const ampm = long[6].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return { year: +long[3], month, day: +long[2], hour, minute: +long[5], second: 0 };
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?$/i);
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += 2000;
    let hour = +(dmy[4] ?? 0);
    const ampm = dmy[6]?.toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return { year, month: +dmy[2], day: +dmy[1], hour, minute: +(dmy[5] ?? 0), second: 0 };
  }
  return null;
}


function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: any = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const hour = +p.hour === 24 ? 0 : +p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return (asUTC - at.getTime()) / 60000;
}

// If the string has no timezone, treat its wall-clock as being in `tz`.
function normalizeScheduledFor(v: any, tz: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const hasTz = /Z$|[+\-]\d{2}:?\d{2}$/.test(s);
  const zone = tz || null;
  const wall = zone && !hasTz ? parseWallClockString(s) : null;
  if (wall && zone) {
    const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const offset = tzOffsetMinutes(zone, new Date(guess));
    return new Date(guess - offset * 60000).toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  if (hasTz || !tz) return d.toISOString();
  const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  const offset = tzOffsetMinutes(tz, new Date(guess));
  return new Date(guess - offset * 60000).toISOString();
}

export const Route = createFileRoute("/api/public/highlevel/appointment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }

        if (Array.isArray(payload)) {
          return new Response("Send a single appointment object, not an array.", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const appt = payload.appointment ?? {};
        const calendar = payload.calendar ?? {};
        const contactSrc = payload.contact ?? {};
        const custom = payload.customData ?? payload.custom_data ?? {};
        const loc = payload.location ?? contactSrc.location ?? {};

        const highlevel_appointment_id = pick(
          custom.highlevel_appointment_id,
          payload.highlevel_appointment_id,
          calendar.appointmentId, calendar.appointment_id,
          appt.id, appt.appointment_id, appt.appointmentId,
          payload.appointment_id, payload.appointmentId,
        ) ?? `hl-${payload.contact_id ?? payload.id ?? Date.now()}`;

        const highlevel_contact_id = pick(
          custom.highlevel_contact_id,
          payload.highlevel_contact_id,
          appt.contact_id, appt.contactId,
          contactSrc.id, contactSrc.contact_id, contactSrc.contactId,
          payload.contact_id, payload.contactId,
        );

        // Build contact row from payload. Create the contact if we've never
        // seen it; match by highlevel_contact_id → email → phone so a booking
        // without an HL id still lands as a real contact row.
        const incoming: Record<string, any> = {
          first_name: pick(contactSrc.first_name, contactSrc.firstName, payload.first_name, payload.firstName),
          last_name: pick(contactSrc.last_name, contactSrc.lastName, payload.last_name, payload.lastName),
          email: pick(contactSrc.email, payload.email),
          phone: pick(contactSrc.phone, payload.phone),
          address: pick(contactSrc.address, contactSrc.address1, payload.address, payload.address1, payload.full_address, loc.address, loc.fullAddress),
          city: pick(contactSrc.city, payload.city, loc.city),
          state: pick(contactSrc.state, payload.state, loc.state),
          postal_code: pick(contactSrc.postal_code, contactSrc.postalCode, contactSrc.zip, payload.postal_code, payload.postalCode, payload.zip, loc.postalCode, loc.postal_code),
        };
        if (highlevel_contact_id) incoming.highlevel_contact_id = String(highlevel_contact_id);
        const contactRow = Object.fromEntries(
          Object.entries(incoming).filter(([, v]) => v !== null && v !== undefined && v !== ""),
        );

        let contact_id: string | null = null;
        // Try to find an existing contact
        let existingId: string | null = null;
        if (highlevel_contact_id) {
          const { data } = await supabaseAdmin.from("contacts").select("id")
            .eq("highlevel_contact_id", String(highlevel_contact_id)).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (!existingId && contactRow.email) {
          const { data } = await supabaseAdmin.from("contacts").select("id")
            .eq("email", contactRow.email).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (!existingId && contactRow.phone) {
          const { data } = await supabaseAdmin.from("contacts").select("id")
            .eq("phone", contactRow.phone).maybeSingle();
          existingId = data?.id ?? null;
        }

        if (existingId) {
          const { data: c } = await supabaseAdmin.from("contacts")
            .update(contactRow as any).eq("id", existingId).select("id").maybeSingle();
          contact_id = c?.id ?? existingId;
        } else if (Object.keys(contactRow).length > 0) {
          const { data: c } = await supabaseAdmin.from("contacts")
            .insert(contactRow as any).select("id").maybeSingle();
          contact_id = c?.id ?? null;
        }

        // Job type
        const jobTypeHint = pick(
          custom.job_type_slug, custom.jobType,
          payload.job_type_slug, payload.jobType,
          appt.job_type, appt.calendar_name, appt.calendarName,
          calendar.calendarName, calendar.calendar_name,
          Array.isArray(payload.Service) ? payload.Service[0] : payload.Service,
        );
        let job_type_id: string | null = null;
        if (jobTypeHint) {
          const hint = String(jobTypeHint).toLowerCase().trim();
          const { data: jt } = await supabaseAdmin
            .from("job_types")
            .select("id")
            .or(`slug.eq.${hint},name.ilike.${jobTypeHint}`)
            .maybeSingle();
          job_type_id = jt?.id ?? null;
        }
        if (!job_type_id) {
          const { data: def } = await supabaseAdmin
            .from("job_types").select("id").eq("active", true)
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          job_type_id = def?.id ?? null;
        }
        if (!job_type_id) return new Response("No job_types configured", { status: 500 });

        // Status
        const rawStatus = String(pick(custom.status, payload.status, appt.status) ?? "scheduled").toLowerCase();
        type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
        const status: JobStatus =
          rawStatus === "in_progress" ? "in_progress"
          : rawStatus === "completed" || rawStatus === "done" ? "completed"
          : rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled"
          : "scheduled";

        // Assignee
        let assigned_to: string | null = null;
        const assigneeEmail = pick(custom.assignee_email, payload.assignee_email, appt.assignee_email);
        if (assigneeEmail) {
          const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", assigneeEmail).maybeSingle();
          assigned_to = prof?.id ?? null;
        }

        const rawScheduled = pick(
          custom.scheduled_for,
          calendar.startTime, calendar.start_time,
          appt.start_time, appt.startTime, appt.scheduled_for,
          payload.start_time, payload.startTime, payload.scheduled_for,
          payload.appointment_start_time, payload.appointmentStartTime,
        );
        const tz = pick(custom.timezone, payload.timezone, appt.selectedTimezone, appt.timezone, calendar.selectedTimezone, calendar.timezone);
        const scheduled_for = normalizeScheduledFor(rawScheduled, tz);
        const due_date = toDateOnly(pick(custom.due_date, appt.due_date, payload.due_date), tz) ?? toDateOnly(scheduled_for, tz);
        // Price sent in whole dollars (e.g. 249) → converted to cents for storage.
        const price_cents = toCents(pick(custom.price, payload.price, appt.price, custom.price_cents, payload.price_cents, appt.price_cents));
        const customerMessage = pickText(payload.Message, payload.message, payload.customer_message, payload.customerMessage);
        const existingNotes = pickText(payload.notes, appt.notes, custom.notes);
        const service_details = pick(
          custom.service_details, custom.cleaning_type, custom.what_needs_cleaning,
          payload.service_details, payload.cleaning_type, payload.what_needs_cleaning,
          payload["Service Type"], payload.serviceType, payload.service_type,
          appt.service_details,
        );
        const twoStoreyRaw = pick(
          custom.is_two_storey, custom.two_storey, custom.twoStorey, custom.two_story, custom.storeys, custom.Storeys,
          payload.is_two_storey, payload.two_storey, payload.twoStorey, payload.two_story,
          payload.Storeys, payload.storeys,
        );

        const is_two_storey =
          twoStoreyRaw === null || twoStoreyRaw === undefined
            ? null
            : ["true", "yes", "y", "1", true, 1].includes(
                typeof twoStoreyRaw === "string" ? twoStoreyRaw.toLowerCase().trim() : twoStoreyRaw,
              );

        const jobContextNotes = [customerMessage, existingNotes].filter(Boolean).join("\n") || null;


        const { data: job, error: jerr } = await supabaseAdmin
          .from("jobs")
          .upsert({
            highlevel_appointment_id: String(highlevel_appointment_id),
            contact_id,
            job_type_id,
            assigned_to,
            status,
            price_cents,
            currency: pick(custom.currency, payload.currency, appt.currency) ?? "AUD",
            scheduled_for,
            due_date,
            notes: null,
            service_details,
            is_two_storey,
            highlevel_payload: payload,

          }, { onConflict: "highlevel_appointment_id" })
          .select("id")
          .maybeSingle();
        if (jerr || !job) return new Response(jerr?.message ?? "Insert failed", { status: 500 });

        // Seed checklist
        const { data: tpl } = await supabaseAdmin
          .from("checklist_templates").select("id")
          .eq("job_type_id", job_type_id).eq("active", true).limit(1).maybeSingle();
        if (tpl) {
          const { data: items } = await supabaseAdmin
            .from("checklist_items").select("*").eq("template_id", tpl.id).order("position");
          if (items && items.length) {
            const rows = items.map((it) => ({
              job_id: job.id,
              checklist_item_id: it.id,
              position: it.position,
              title: it.title,
              input_type: it.input_type,
            }));
            await supabaseAdmin.from("job_checklist_progress").upsert(rows, { onConflict: "job_id,checklist_item_id" });
          }
        }

        // Enrich notes from HighLevel conversation history via Lovable AI (best-effort)
        try {
          if (highlevel_contact_id) {
            const aiNotes = await generateWorkerNotesFromHL(String(highlevel_contact_id), {
              appointmentNotes: jobContextNotes,
              serviceDetails: service_details,
              jobTypeHint: jobTypeHint ? String(jobTypeHint) : null,
              isTwoStorey: is_two_storey,
            });
            if (aiNotes) {
              await supabaseAdmin.from("jobs").update({ notes: aiNotes }).eq("id", job.id);
            }
          }
        } catch (e) {
          console.error("HL enrichment failed", (e as Error)?.message);
        }

        return Response.json({ ok: true, job_id: job.id, contact_matched: !!contact_id });
      },
    },
  },
});

async function generateWorkerNotesFromHL(
  contactId: string,
  ctx: { appointmentNotes: string | null; serviceDetails: string | null; jobTypeHint: string | null; isTwoStorey: boolean | null },
): Promise<string | null> {
  const pit = process.env.HIGHLEVEL_PIT;
  const locationId = process.env.HIGHLEVEL_LOCATION_ID;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!pit || !locationId || !lovableKey) return null;

  const hlHeaders = {
    Authorization: `Bearer ${pit}`,
    Version: "2021-04-15",
    Accept: "application/json",
  };

  // 1. Search conversations for this contact
  const convRes = await fetch(
    `https://services.leadconnectorhq.com/conversations/search?locationId=${encodeURIComponent(locationId)}&contactId=${encodeURIComponent(contactId)}`,
    { headers: hlHeaders },
  );
  if (!convRes.ok) {
    console.error("HL conversations/search failed", convRes.status, await convRes.text());
    return null;
  }
  const convData = await convRes.json() as any;
  const conversations: any[] = convData?.conversations ?? [];
  if (!conversations.length) return null;

  // 2. Fetch messages for each conversation (cap for safety). HighLevel defaults
  // to 20 newest messages, which can be only appointment activity; request more
  // so older real SMS/customer history is included.
  const allMessages: { convId: string; body: string; direction: string; type: string; messageType: string; dateAdded: string }[] = [];
  for (const conv of conversations.slice(0, 5)) {
    const msgRes = await fetch(
      `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=100`,
      { headers: hlHeaders },
    );
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json() as any;
    const msgs: any[] = msgData?.messages?.messages ?? msgData?.messages ?? [];
    for (const m of msgs) {
      const body = String(m.body ?? m.message ?? "").trim();
      if (!body) continue;
      const messageType = String(m.messageType ?? "");
      // Skip activity notifications (appointment created/deleted etc.) - not real messages
      if (messageType.startsWith("TYPE_ACTIVITY")) continue;
      // Skip unfilled template placeholders like "Payment link: ((PAYMENT))"
      if (/\(\([A-Z_]+\)\)/.test(body)) continue;
      allMessages.push({
        convId: conv.id,
        body,
        direction: m.direction ?? "",
        type: String(m.type ?? ""),
        messageType,
        dateAdded: m.dateAdded ?? m.createdAt ?? "",
      });
    }
  }

  // Sort oldest → newest, cap the last 60
  allMessages.sort((a, b) => (a.dateAdded > b.dateAdded ? 1 : -1));
  const trimmed = allMessages.slice(-60);
  if (!trimmed.length) return null;

  const transcript = trimmed
    .map((m) => `[${m.direction === "inbound" ? "Customer" : "Us"} • ${m.messageType || m.type}] ${m.body}`)
    .join("\n");

  // 3. Ask Lovable AI to summarize for the worker
  const systemPrompt = `You brief a field service worker before a job. Read the chat/message history between our business and the customer and produce a short briefing.

Focus on:
- Access instructions (gate codes, parking, pets, side access)
- Specific problem areas or requests the customer mentioned
- Special conditions (fragile items, tenants, timing constraints)
- Anything the customer explicitly asked for or complained about
- Confirmed pricing/scope agreements

Rules:
- Short. Bullet points. No preamble.
- Skip greetings, booking logistics, and generic template messages.
- Do not invent details not in the transcript.
- If the transcript has no useful worker notes, reply exactly with: NONE.`;

  const userPrompt = `Job context:
- Service type: ${ctx.jobTypeHint ?? "unknown"}
- Service details: ${ctx.serviceDetails ?? "n/a"}
- Two-storey: ${ctx.isTwoStorey === null ? "unknown" : ctx.isTwoStorey ? "yes" : "no"}
- Appointment form notes/customer request: ${ctx.appointmentNotes ?? "(none)"}

Message history (oldest → newest):
${transcript}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!aiRes.ok) {
    console.error("Lovable AI failed", aiRes.status, await aiRes.text());
    return null;
  }
  const aiData = await aiRes.json() as any;
  const text = String(aiData?.choices?.[0]?.message?.content ?? "").trim();
  if (!text || text.toUpperCase() === "NONE") return null;
  return text;
}
