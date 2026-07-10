// Display job times in the source (business) timezone so what you see
// matches what the webhook sent, regardless of the viewer's local tz.
export const APP_TZ = "Australia/Sydney";

function parts(iso: string | Date, tz = APP_TZ) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) if (part.type !== "literal") p[part.type] = part.value;
  return p;
}

export function formatJobDateTime(iso: string | Date) {
  const p = parts(iso);
  return `${p.weekday} ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export function formatJobDayMonth(iso: string | Date) {
  const p = parts(iso);
  return `${p.day} ${p.month}`;
}

export function formatJobFullDate(iso: string | Date) {
  const p = parts(iso);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

export function formatJobTime(iso: string | Date) {
  const p = parts(iso);
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

// Get a Date representing midnight of the iso's day in APP_TZ (for grouping)
export function startOfDayInAppTz(iso: string | Date): string {
  const p = parts(iso);
  const monthIdx = new Date(`${p.month} 1, 2000`).getMonth();
  return `${p.year}-${String(monthIdx + 1).padStart(2, "0")}-${p.day}`;
}
