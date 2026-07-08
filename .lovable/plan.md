
# Roofing.Gutter.Solar CRM — Build Plan

## Branding
- Logo: uploaded RGS logo in header/auth screens.
- Palette from logo: deep green `#1F6B2E`, lime `#8DC63F`, sun yellow `#F7D51D`, off-white bg, dark slate text.
- Typography: **Outfit** (display/headings) + **Inter** (body), via @fontsource.
- Style: clean, modern SaaS/app feel — rounded cards, soft shadows, generous whitespace, mobile-first (workers use it in the field).

## Backend (Lovable Cloud)
Enable Cloud. Tables (all with RLS + grants):

- `profiles` — id (=auth.users), full_name, email, phone, avatar_url.
- `user_roles` — user_id, role enum (`admin`,`worker`). `has_role()` security-definer fn.
- `contacts` — id, highlevel_contact_id (unique), first_name, last_name, email, phone, address, city, state, postal_code, notes, created_at, updated_at.
- `job_types` — id, name (e.g. "Gutter Cleaning"), slug, active. Seeded with Gutter Cleaning.
- `checklist_templates` — id, job_type_id, name, active.
- `checklist_items` — id, template_id, position, title, description, input_type enum (`checkbox`,`photo_before`,`photo_after`,`payment_trigger`,`note`), required (bool).
- `jobs` — id, contact_id, job_type_id, assigned_to (uuid→profiles), status enum (`scheduled`,`in_progress`,`completed`,`cancelled`), price_cents, currency, scheduled_for (date), due_date, notes, highlevel_appointment_id (unique), highlevel_payload jsonb, created_at, completed_at.
- `job_checklist_progress` — id, job_id, checklist_item_id, completed (bool), completed_at, completed_by, note.
- `job_photos` — id, job_id, checklist_item_id, kind (`before`/`after`), storage_path, uploaded_by, created_at.
- `settings` — singleton key/value (company name, default currency, HighLevel payment-completion webhook URL).
- Storage bucket `job-photos` (private, RLS: worker sees own job photos, admin all).

## Webhook endpoints (public, HMAC-verified)
`src/routes/api/public/highlevel/*.ts` — verify `x-webhook-signature` HMAC against `HIGHLEVEL_WEBHOOK_SECRET`.

- `POST /api/public/highlevel/contact` — upsert `contacts` by `highlevel_contact_id`.
- `POST /api/public/highlevel/appointment` — creates a `job` 1 day before appt: matches contact, resolves assignee by email in payload, uses default Gutter Cleaning job type + template, seeds `job_checklist_progress` rows from template, stores price from payload.

## Worker app (`/_authenticated`)
- **Today** (home): jobs due today, grouped, big touch-friendly cards (client name, address w/ map link, time, price, progress bar).
- **Upcoming**: jobs for next 7 days.
- **Job detail**: contact info, address (tap → Maps), notes, price, checklist. Checking a `photo_before`/`photo_after` item opens a modal with camera/file upload → stored in `job-photos` bucket → item auto-marks complete. `payment_trigger` item (the second-to-last "Mark job as done") is only enabled once all prior items complete; checking it fires a server fn that POSTs to configured HighLevel webhook with contact id + amount → HL sends SMS with Stripe link. Final "Collect payment" item marks job `completed`.

## Admin area (`/_authenticated/admin`, role=admin only)
- **Checklist templates**: reorder, add/edit/delete items per job type, set input type.
- **Job types**: add roof repair / solar cleaning later (out of scope now).
- **Team**: invite workers (create auth user + assign `worker` role), list workers.
- **Contacts**: browse/search synced contacts.
- **Jobs**: full list with filters, reassign, edit.
- **Settings**: company info, HighLevel completion webhook URL, webhook signing secret display, default price.

## Auth
- Email/password only. `/auth` public route. First signup auto-granted `admin` if no admins exist; subsequent users default `worker`. Admin invite creates user via `supabaseAdmin.auth.admin.createUser` + role row.
- Managed `_authenticated/route.tsx` gate.

## Secrets
- `HIGHLEVEL_WEBHOOK_SECRET` (generate).
- `HIGHLEVEL_COMPLETION_WEBHOOK_URL` (user-provided; stored in `settings` table, not secret).

## Tech notes
- TanStack Start server functions for all app reads/writes; `requireSupabaseAuth` middleware.
- TanStack Query for cache; loaders under `_authenticated` prime queries.
- Route files use flat dot naming; every route has error + notFound components.
- Toast confirmations, optimistic checklist updates.

## Out of scope (v1)
- Roof repair / solar cleaning checklists (schema supports; not seeded).
- Two-way HighLevel push-back of job status (webhook-in only, plus outbound webhook for SMS trigger).
- In-app SMS sending, in-app Stripe integration (HighLevel workflow handles both).

## Deliverable order
1. Enable Cloud + migrations (tables, RLS, grants, roles, storage bucket, seed Gutter Cleaning template with your 10 subtasks).
2. Auth + admin bootstrap.
3. Design system tokens + logo asset + fonts.
4. Worker Today / job detail / photo upload / checklist.
5. Admin: templates, team, contacts, jobs, settings.
6. HighLevel inbound webhooks + outbound SMS-trigger webhook.
7. Polish + mobile pass.
