# SPEC — salon

Live waiting board and salon console for Ahmed Ramdan Barber Shop. Arabic-first, RTL.
Rebuild of an existing working product (React 19 + Vite + Supabase), not a new build.

## Who uses it

| Surface | Who | Auth | What they get |
|---|---|---|---|
| `#/` public | Anyone with the URL or QR | none | How many people are waiting. Nothing else. |
| `#/op` operator | Front desk | 6-digit PIN | One screen. Add a customer, mark them done, bump the waiting count. |
| `#/…` admin | The owner | email + password | Everything that exists today, minus what is deleted below. |

Exactly two account levels: `admin` and `operator`. The admin creates operators.
**Barbers are not accounts** — they are profiles the admin manages; the operator records what they did.

## The operator screen (the whole product in one page)

One scrolling screen, no modals, no navigation, no wizard.

- **Entry row, always visible.** Name (optional, defaults to `عميل ٧`), service chips (multi-select,
  always visible, no dropdown), barber chips (always visible). Tappable in any order; commits on one
  tap. Target: **≤4 taps, 0 keystrokes, under 10 s.**
- **In-progress cards.** One per active customer: name, services, barber, elapsed minutes, and a
  single **Done** tap — no confirm dialog, an 8-second Undo instead. Done decrements in-progress.
- **Waiting counter.** Big `+` / `−` pair at the bottom of the screen with the live number between
  them, drawn on a couch. `+` when someone walks in, `−` when the operator seats someone.
  Independent of the named customers — a plain counter, because that is how the shop actually works.
- Money is never asked for. The amount is the sum of the chosen services' catalogue prices; the
  operator may tap the amount on a card to correct it.

## The public page

One hero number (people waiting) and one honest range beneath it (`حوالي ٢٠–٣٠ دقيقة`), with a
"last updated" line and a cheap CSS/SVG couch. No login, no booking, no names, no photos, no 3D.
Polls every 20 s. Budget: **≤50 KB first load, ≤10 KB JS, zero images** — it must open on a cheap
Android phone on 3G.

## Deleted

Customer accounts and everything that served them: self sign-up, customer sign-in, customer sofa
reservations, the 1-hour reservation hold and its `pg_cron` job, "my visits", and the three
`seats.reserved_*` columns that leak a customer's first name to anyone with the URL today.
The public page stops loading three.js (575 KB today).

## Data model changes

- `staff.role` enum `owner|barber|receptionist` → `admin|operator`. Barbers move to their own
  `barbers` table with no `auth.users` row, so a barber can exist without a login.
- New `visit_services` join table: a visit holds several services, not one.
- New append-only `waiting_events` (delta, actor, at). The waiting count is the sum of today's
  deltas — atomic, auditable, and Undo comes free. No read-modify-write on a shared integer.
- New `operator_pins` and a PIN sign-in path.
- `visits.amount` keeps `> 0`; it is filled from service prices, never from the operator.

## Gates

`node bin/factory.mjs check salon` → typecheck, test, build, audit. ESLint + Prettier to be added
(the project ships no linter at all today). Every removed feature gets its migration; no migration
is ever edited in place. Runs against a local Supabase stack — no access to the previous owner's
Supabase or Vercel account is required or used.

## Out of scope

See `BACKLOG.md`. Notably: no SMS/OTP, no online booking, no customer-facing wait notifications,
no offline write queue in v1, no new reports.
