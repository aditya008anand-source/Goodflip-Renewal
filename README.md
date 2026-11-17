# Goodflip — Patient Renewal Management Portal

A renewal lead management portal for TatvaCare GoodFlip coaches and admins:
lead tracking, call/follow-up history, payment recording, revenue and coach
incentive reporting, and Google Sheets sync for new leads.

Stack: Next.js 14 (App Router) + Tailwind CSS + Supabase (Postgres, Auth,
Storage), deployed on Vercel.

## 1. What's included / scope decisions made

This build already incorporates the decisions made during the data review:

- **Lead identity / dedup key:** mobile number alone. Two rows sharing a
  phone with the *same* name (just different casing, e.g. a main plan row
  and a Nutra add-on order row) merge into one lead. Two rows sharing a
  phone with genuinely *different* names are kept as two separate leads and
  flagged `needs_review` for manual checking — nothing is ever silently
  dropped.
- **Unassigned leads:** the 126 November rows with no Renewal Coach import
  with `coach_id = NULL`. They're visible to Admin only, who assigns them
  from the lead list or lead detail page. Once a coach with a matching name
  is invited, a later sync auto-links any of their still-unassigned leads.
- **Status mapping:** the sheet's messy "Final Status" free text is
  best-effort mapped onto the fixed status list below; anything that
  doesn't confidently match defaults to `New` and the original text is kept
  in `review_note` so nothing is lost.
- **Extra columns kept:** `clinical_discipline` ("Coaches" column —
  Nutritionist/Psychologist/Physiotherapist) and `team` ("Team" column) are
  stored as read-only reference fields on each lead.
- **Lead statuses** are a fixed list enforced by a database constraint, not
  a free-form admin-editable list (the spec allowed either — a hardcoded,
  consistent list keeps the data model simple): New, Not Contacted,
  Connected, Interested, Follow-up Required, Payment Pending, Renewed, Not
  Interested, Not Reachable, Lost. Ask your developer to add a migration if
  you need to change this set later.

## 2. Supabase setup

1. Create a project at supabase.com.
2. In the SQL editor, run **in this order**:
   1. `supabase/schema.sql`
   2. `supabase/policies.sql`
   3. `supabase/seed-incentive-defaults.sql` (optional starter rule)
3. **Project Settings → API**: copy the Project URL and the `anon` public
   key into `.env.local` (see `.env.example`). Copy the `service_role` key
   too — keep it server-side only, never commit it or expose it to the
   browser.
4. **Authentication → Providers**: email/password is enabled by default,
   which is all this app uses.
5. **Authentication → URL Configuration**: set the Site URL to your Vercel
   production URL once you have one (step 5 below), so invite emails link
   back to the right place.
6. Create the first Admin account yourself: Authentication → Users → Add
   user, enter your email, set a password, then in the SQL editor run:
   ```sql
   update public.users set role = 'admin' where email = 'you@tatvacare.in';
   ```
   (Signing up or being invited always defaults to `role = 'coach'` —
   promoting the first Admin is the one manual step.)

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (keep secret) |
| `GOOGLE_SHEET_CSV_URL` | See section 4 below |
| `SYNC_API_SECRET` | Any long random string you choose |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (e.g. `https://goodflip-renewal.vercel.app`), used by the Settings page to call the sync API |

## 4. Google Sheets integration

The simplest reliable approach — no Google Cloud credentials needed — is
publishing the sheet as CSV, which is what you already shared:

1. In Google Sheets: **File → Share → Publish to web**, choose the sheet
   tab, format **Comma-separated values (.csv)**, click Publish.
2. Copy that link into `GOOGLE_SHEET_CSV_URL`.
3. Whenever you add new rows to the sheet, click **Sync now** on the
   Settings page (or wait for the scheduled sync — see below). The sync:
   - matches rows to existing leads by mobile number,
   - only fills in master fields that are currently empty — it never
     overwrites a comment, call history, or payment record,
   - migrates a new lead's 1st/2nd/3rd attempt columns and Payment Amount
     column into interaction/payment history **once**, on first import only.

**Automatic polling (optional):** add a `vercel.json` cron entry so new
sheet rows appear without anyone clicking Sync:
```json
{
  "crons": [{ "path": "/api/sync-sheet", "schedule": "0 */6 * * *" }]
}
```
Vercel Cron calls your route without custom headers, so either relax the
route's secret check for Vercel's cron requests (Vercel signs these with a
different mechanism — see Vercel's cron docs for verifying `x-vercel-cron`
style requests) or trigger it from an external scheduler that can send the
`x-sync-secret` header instead.

If you'd rather use the real Google Sheets API (live data without
publishing to the web), that needs a Google Cloud service account with the
Sheets API enabled and the sheet shared with that service account's email —
ask your developer to swap the CSV fetch in `src/app/api/sync-sheet/route.ts`
for a `googleapis` call if you want this later; the rest of the sync logic
(dedup, never-overwrite-history) stays the same either way.

**Manual backup import:** Admin can also always re-run the one-off script
below against a freshly exported CSV — it's idempotent (safe to re-run; see
section 5).

## 5. Importing the initial November data

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values first
npm run import:november -- --month=2026-11 --url="<your published CSV link>"
```

This prints a summary (rows added/updated/flagged) and a list of anything
flagged for manual review — check that list before trusting the numbers on
the Overview and Revenue pages. Re-running it is safe; matched leads only
get empty fields filled in, and attempt/payment history is never
re-inserted for a lead that already exists.

For a later month (December, etc.), export that month's sheet and run the
same command with `--month=2026-12`. Past months are never touched.

## 6. Local development

```bash
npm install
npm run dev
```

Visit http://localhost:3000 — you'll be redirected to `/login`. Sign in
with the Admin account you created in step 2.6.

## 7. Push to GitHub

```bash
git init
git add .
git commit -m "Initial Goodflip renewal portal"
gh repo create goodflip-renewal-portal --private --source=. --push
# or, without the gh CLI:
# git remote add origin https://github.com/<you>/goodflip-renewal-portal.git
# git branch -M main
# git push -u origin main
```

`.env.local` is already gitignored — never commit real Supabase keys.

## 8. Deploy to Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. In the project's **Environment Variables** settings, add every variable
   from `.env.local` (all of them — including the service-role key, which
   stays server-side even on Vercel; Next.js never ships a variable without
   the `NEXT_PUBLIC_` prefix to the browser).
3. Deploy. Once you have the production URL, set `NEXT_PUBLIC_SITE_URL` to
   it and redeploy (or add it before the first deploy if you already know
   your domain), and update Supabase's Auth **Site URL** to match (step 2.5).
4. Invite your real coaches from **Settings → Coaches** once the production
   app is live — each gets an email with a link to set their password.

## 9. Project structure

```
src/
  app/
    login/                    sign-in page
    (dashboard)/               authenticated shell (nav, role gate)
      overview/                role-scoped KPI dashboard
      leads/                   list with filters/search + [id] detail page
      revenue/                 admin-only revenue & incentive report
      settings/                admin-only: coaches, incentive rules, sync
    api/sync-sheet/            Google Sheet → DB sync endpoint
  components/                  shared UI (nav, filters, badges, forms)
  lib/                         Supabase clients, types, status mapping,
                                incentive calculation, sheet parsing/sync
supabase/
  schema.sql                   tables, indexes, triggers, the lead_overview view
  policies.sql                 Row Level Security — the real access control
  seed-incentive-defaults.sql  optional starter incentive rule
scripts/
  import-sheet-csv.ts          one-off initial-month import (also reusable monthly)
```

## 10. Known limitations / intentionally out of scope for v1

- Lead status list is fixed (see section 1), not admin-editable from the UI.
- Google Sheets sync uses the published-CSV link, not the authenticated
  Sheets API — simpler to set up, slightly less "live" (publish-to-web can
  lag a minute or two after an edit).
- No automated test suite. Given the scope, manual verification against
  your real data was done during the build (see the import dry-run results
  shared in chat); add tests incrementally as you extend this.
