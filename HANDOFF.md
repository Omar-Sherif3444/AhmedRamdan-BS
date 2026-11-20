# HANDOFF — salon rebuild

Branch `fo2sh`. **The build is green again**: `npx tsc --noEmit` → 0 errors, `npm test` → 16/16,
`npm run lint` → 0 errors, `npm run build` passes, `npm audit` → 0 vulnerabilities.

## 0a. Account model (2026-11-20, live)

Only two logins exist: the **owner (admin)**, unchanged, and **one shared shop account (operator)**
for the front-desk computer. Barbers and employees are login-less profiles the owner manages
(, role  or the new ). The barber's old login was deleted;
the profile and its visits stay. The front desk sees all customers and today's visits (in progress or
started today, Cairo time); older history and money stay owner-only. The shop account is not on
payroll or attendance.  refuses a second shop account. PIN sign-in is deferred.
Migrations: , .

## 0. Update — §3 items 1–8, 10 and part of 12 are done

- **Routing.** `main.tsx` now serves two lazy bundles: `#/` → `Public.tsx` alone (no store, no
  supabase-js, no i18n, no admin CSS, no three.js), everything else → `Staff.tsx` (store + `App`).
  Signed out → `SignIn`. An operator gets only the Operator screen; the admin gets the back office,
  whose first route is now `#/op` (replacing `#/floor`).
- `Floor.tsx` deleted. The customer view (`PublicFloor`, "my visits", the footer) is gone with it.
- `i18n.ts`: `role.admin/operator/barber`; every `pub.*` key, the customer sign-up keys and the
  BACKLOG dead keys are removed; the Operator strings moved in as `op.*`. `Public.tsx` keeps its
  local strings on purpose (it must not import i18n.ts). **Western digits everywhere** is now one
  flag: the Arabic locale is `ar-EG-u-nu-latn`. A plural-aware `i18n.minutes(n)` fixes `٥ دقيقة`.
  `em.locked` no longer says "demo user"; `em.dailyWage` no longer hardcodes the currency.
- `Employees.tsx`: two sections. Sign-in accounts (admin + operators, created via `admin-users`)
  and barbers (name/phone/wage only, via `save_barber`, no login).
- `SignIn.tsx`: staff only. Admin → `#/dashboard`, operator → `#/op`.
- Seed, tests, store and `Three3D` fixed. New tests cover multi-service pricing, the waiting
  counter floor, the admin lock and the new `reopen` action.
- Edge function `admin-users`: whitelist is `['operator']`, **and its caller check said
  `role !== 'owner'`, which would have locked every admin out after the enum change.** Fixed.
- **Operator Undo was wrong:** the one snackbar always called `undo_waiting`, so Undo after
  Start or Done decremented the waiting count instead. Each snackbar now carries its own inverse:
  Start → release (cancels the visit), Done → new `reopen_visit` RPC, +/− → `undo_waiting`.
- New migration `20261120200300_reopen_visit.sql` (completed visits only, within 15 min,
  only while the seat is still free).

Still open: §3 item 9 (PIN sign-in with lockout), the ≤50 KB first-load target (the public route
is 2.7 KB of its own JS, but the shared React chunk is ~70 KB gzip), and operator RLS: an operator
reads only visits where `created_by = auth.uid()`, so two front-desk devices on *different* operator
accounts will not see each other's in-progress cards.

The original notes follow.

## 1. Run it locally

Nothing here needs the previous owner's Supabase or Vercel account, and no credentials from them
exist in this repo. A full backend reproduces from the migrations:

```sh
npm install
npx supabase start          # needs Docker running; pulls ~10 images the first time
npx supabase status         # copy ANON_KEY
cp .env.example .env        # set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Create the first admin (the `staff` row is what grants the role, not the auth user):

```sh
# 1. Auth user, via the local service-role key from `npx supabase status`:
curl -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@salon.local","password":"salon12345","email_confirm":true}'

# 2. Staff row + two login-less barbers:
docker exec supabase_db_Ahmed_Ramdan psql -U postgres -c \
  "insert into staff (id,email,name,role,phone) select id,'owner@salon.local','Admin','admin','01000000000' from auth.users where email='owner@salon.local';
   insert into staff (id,name,role,phone,email,active) values (gen_random_uuid(),'Barber A','barber','','',true);"
```

## 2. What is DONE and verified against a real database

Three new migrations, applied cleanly on a fresh `supabase db reset` (12 migrations total):

**`20261120200000_two_account_levels.sql`**
- `staff_role` enum is now `{admin, operator, barber}`. Verified.
- Customer self-service is gone: `claim_customer`, `phone_has_account`, `my_customer_id`,
  `reserve_sofa_seat`, `cancel_my_reservation`, `expire_reservations`, `clear_reserved_by` +
  its trigger, the `expire-sofa-reservations` cron job, `customers.user_id`, and
  `seats.reserved_by` / `reserved_until` / `reserved_name`. Verified: those columns are gone.
  This also closed a live privacy leak — `reserved_name` and `reserved_by` were world-readable.
- The two `select` policies that depended on those objects were rewritten first.
- **`staff.id` is no longer a foreign key to `auth.users`.** That is what lets a barber exist with
  no login. Verified: two barbers created with no auth user, no email.
  `staff.id` still equals `auth.users.id` for admin/operator, so every existing
  `id = auth.uid()` check keeps working untouched — barbers simply never match one.
- `is_owner()` keeps its name and only changes its body to `role = 'admin'`. It is called from
  ~20 functions and policies; renaming it would have touched all of them for no gain.
  `is_admin()` and `is_operator()` are added as the names to use from now on.
- Rebuilt because they contained the literal `'owner'`, now an invalid enum value:
  `update_staff`, `staff_login_email`, `set_staff_pay`, `save_absence`, `add_deduction`,
  `payroll`. New: `save_barber`.

**`20261120200100_visit_services.sql`**
- `visit_services` join table (visit, service, price-at-the-time) + RLS + backfill from history.
- `register_visit` now takes `p_services uuid[]`, **derives the amount from the catalogue prices**,
  and auto-names an unnamed customer `عميل N`. The old single-service signature is dropped so a
  stale client fails loudly instead of writing a visit with no services.
- **`visits.amount` is still one number per visit**, so `revenue_totals()`, `calc.ts`, Reports and
  payroll are untouched. This is much smaller than it first looked.
- Verified end to end: a visit with 2 services, no name and no amount produced
  customer `عميل 1`, `amount = 150.00` (70 + 80), 2 `visit_services` rows, seat `occupied`.

**`20261120200200_waiting_counter.sql`**
- `waiting_events` (append-only, `delta ∈ {-1,1}`, actor, `undone_at`). Append-only on purpose:
  a shared integer with read-modify-write loses increments when two devices tap at once.
  The count is the sum of **today's** events in Cairo time, so it resets itself daily.
- `bump_waiting`, `undo_waiting`, `waiting_count`. Verified: `1, 2, 3, 2`, and a decrement at
  zero is refused rather than logged.
- `public_wait_status()` — the **entire** public surface, granted to `anon`. Returns only
  `waiting, in_progress, barbers_active, minutes_per_customer, at`. No names, no phones, no seat
  identities, no money. Verified callable with just the anon key.
- `settings.minutes_per_customer` (default 20) feeds the estimate.

**Frontend contract (done):** `types.ts` (`Role`, `Visit.serviceIds`, `Data.waiting`, `Seat`
cleaned, `State.customerId` gone), `lib/api.ts` (mappers, `loadData` now groups `visit_services`
and fetches `waiting_count`, `register`/`waitingBump`/`undoLast` actions, customer sign-up and the
customer session fallback deleted), `lib/reducer.ts` (new action union, optimistic waiting count).

**New UI, written but not yet mounted:**
- `src/pages/Operator.tsx` + `src/operator.css` — the one-screen console. **3 taps, 0 keystrokes**
  for a typical entry (2 with a single barber), against a measured baseline of 8 taps + ~12
  keystrokes. Inline-SVG couch, no three.js. Follows `DESIGN.md` sizes.
- `src/pages/Public.tsx` + `src/public.css` — the hero-number wait page. Route cost measured with
  esbuild: **2.5 KB gzip JS + 1.0 KB gzip CSS**, zero images, zero three.js, and it does not import
  `store.tsx`, `api.ts` or `i18n.ts`. Contrast measured 19:1 ink / 8.1–9.0:1 state colours.
  Polls 20 s ±3 s with jitter, backs off to 120 s, goes stale at 90 s, survives the RPC being
  absent without ever stopping the loop.
  - **It calls the RPC with a bare `fetch`, not `supabase-js`**, deliberately: the client library
    is ~40 KB gzip, four times the whole route budget. Same endpoint, same anon key. Reverting is
    two lines inside `load()`.
  - **Open issue you must decide:** React + react-dom is ~45 KB gzip on its own, so while this page
    boots through `main.tsx` the *page* cannot meet `DESIGN.md`'s ≤50 KB first load, even though
    the route itself is tiny. Honouring that number for real needs the public URL served as
    prerendered HTML or through a separate non-React entry point. Unresolved.

## 3. What is LEFT — in the order I would do it

1. **Mount the new pages.** `App.tsx` still has the old 10-route table and no `#/op` or public
   route. `Operator.tsx` and `Public.tsx` are currently imported by nothing. (3 errors in `App.tsx`.)
2. **Delete `src/pages/Floor.tsx`** (26 of the 69 errors). It is the old staff floor plus the
   customer reservation UI; it is wholly replaced by `Operator.tsx`. Keep nothing but `useNow`,
   which `Operator.tsx` already has its own copy of.
3. **`src/i18n.ts`** — 8 errors. `role.owner` / `role.barber` / `role.receptionist` must become
   `role.admin` / `role.operator` / `role.barber`, and the `pub.*` reservation keys and
   customer-signup `auth.*` keys are now dead. Both `Operator.tsx` and `Public.tsx` hold their
   Arabic in a local `L` object marked `// i18n: move to i18n.ts` — migrate those in.
   Note `i18n.t()` **throws** on an unknown key, so a missed dynamic key is a crash, not a blank.
4. **`src/pages/Employees.tsx`** — 10 errors. Needs splitting into two surfaces: operator accounts
   (email/PIN, created through the `admin-users` edge function) and barber profiles (name/phone
   only, through the new `save_barber` RPC, no login).
5. **`src/pages/SignIn.tsx`** — remove the customer sign-up mode entirely.
6. **`src/lib/seed.ts` (6) and `src/lib/logic.test.ts` (7)** — fixtures still use the old roles and
   single-service visits. The tests are the cheapest way to prove the new reducer; fix these early
   rather than last.
7. **`src/store.tsx` (3)** — drops `customerId` from the session dispatch; add `waiting: 0` to the
   initial state.
8. **`src/components/Three3D.tsx` (2)** — reads `seat.reservedName`. Delete those lines; keep the
   3D floor for the admin dashboard only, never the public page.
9. **PIN sign-in for operators is NOT built.** Decision taken, no code written. Supabase enforces
   a 6-character minimum, so a 6-digit PIN is the floor. It is weaker than a password: gate it
   with lockout-on-failed-attempts, and note the blast radius is limited because an operator
   cannot reach payroll, money reports or employee management.
10. **The edge function `supabase/functions/admin-users/index.ts` still whitelists
    `['barber','receptionist']`.** It must become `['operator']`. Not yet changed.
11. **Linting is DONE and the gate is green** — `npm run lint` → 0 errors / 21 warnings,
    `npm run lint:css` → 0 errors / 2 warnings, so `factory.json`'s `lint` step now passes.
    The 21 warnings are pre-existing and deliberately non-blocking; work them off at leisure
    (6 `react-refresh/only-export-components`, 5 `react-hooks/set-state-in-effect`,
    3 `exhaustive-deps`, 3 `react-hooks/refs`, 2 RTL, 1 unused var, 1 purity).
    - **The RTL guard is the valuable part**: ESLint `no-restricted-syntax` blocks physical
      direction properties in JSX `style` props and `el.style.x =` assignments, and stylelint
      blocks `margin-left`, `padding-right`, bare `left`/`right`, `text-align: left/right` and
      `float` in CSS, each with a message naming the logical replacement. `src/styles.css` is
      exempted (it has intentional physical rules and was not modified); `operator.css` and
      `public.css` are fully guarded and pass clean. This is what stops RTL rotting.
    - **One dependency change you must understand.** `typescript-eslint` hard-refuses to run on
      TypeScript 7 (it `throw`s: TS 7 is the native port and no longer ships the JS compiler API).
      The fix applied is Microsoft's documented side-by-side layout:
      `"typescript": "npm:@typescript/typescript6@^6.0.2"` provides the compiler *API* the linter
      needs, and `"@typescript/native": "npm:typescript@^7.0.2"` provides the real TS 7 whose
      `tsc` binary `build` and `typecheck` still use. Verified: `npx tsc --version` → 7.0.2, and
      `npm install` resolves without `--legacy-peer-deps`. **Revert to a plain `typescript`
      dependency once typescript-eslint supports TS ≥ 7.1** (upstream issue 10940). If the build
      ever behaves oddly, this aliasing is the first thing to suspect.
    - `npm run format` is NOT part of the gate: `prettier --check` reports 26 pre-existing files
      as unformatted, and reformatting them is a deliberate decision for whoever owns `src/`.
12. Then: `config.toml:160` `site_url` and `index.html:12-13` OG tags still name the old Vercel
    deployment.

Known defects inherited from the original product are in `BACKLOG.md` — they are real and worth
reading, especially the Arabic plural bugs and the 3D scene being rebuilt on every data reload.

## 4. Ground rules carried over

- Binding UI numbers are in `DESIGN.md`. They are requirements, not suggestions; the operator and
  public screens were built against them.
- Never edit an applied migration — add a new one. (The three above were edited in place *before*
  ever leaving this machine, which is why `register_visit` has no follow-up fix migration.)
- Every write goes through a `security definer` function. There is not one write RLS policy in this
  schema, and it should stay that way.
- The public page must not import `store.tsx` or three.js. Budget: ≤50 KB first load.
