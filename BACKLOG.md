# BACKLOG — salon

Everything cut from `SPEC.md`. Nothing here blocks the rebuild.

## Cut from v1 deliberately

- **Offline write queue.** The research case for local-first is strong (every tap repainting in
  <16 ms regardless of wifi), but it is a rewrite of the data layer. v1 keeps the existing
  optimistic-dispatch-then-reload model, which already repaints instantly and reverts on failure.
  Revisit if the shop's wifi actually drops entries.
- **Idempotency keys on mutations.** Needed properly alongside the offline queue. Until then the
  `+`/`−` counter is append-only (`waiting_events`), which is naturally replay-tolerant, and Done
  is guarded by debounce + in-flight disable.
- **Voice name entry.** Measured 3× faster than typing, but Egyptian-Arabic ASR in a loud salon is
  a coin flip. The name is optional in v1, which removes the keyboard from the critical path anyway.
- **Hold-to-repeat on the waiting counter.** Only matters above ~5 taps in a row; add if the
  operator complains.
- **Ambidextrous left/right-hand toggle** for the counter placement.
- **Wait-time estimate from real history.** v1 derives the range from a configurable
  minutes-per-customer value × people waiting ÷ active barbers. A p20–p80 band from the shop's own
  completed-visit durations is better and needs a few weeks of data first.
- **"Come back at X o'clock" suggestion** when the queue is long (research says a bare large number
  loses the customer; a time suggestion keeps them).
- **Public page reason codes** (`ضغط شديد الآن`, `حلّاق واحد فقط حاليًا`) — unexplained waits feel
  longer, but this needs an admin control to set them.
- **QR print assets.** Sizes are specified in `DESIGN.md`; generating the actual print files is a
  separate task.

## Known defects inherited from the existing product

- **No linter.** The project ships no ESLint and no Prettier, so the factory `lint` gate skips.
  Adding them will surface a backlog of its own.
- **Six WebGL contexts on the admin dashboard** (`Floor3D` + five `Bars3D`), each with its own
  renderer, PMREM generator and `RoomEnvironment`.
- **Full 3D scene teardown and rebuild on every data reload.** `useStage` depends on `state.seats`,
  which is a fresh array of fresh objects after every `loadData()`, and `reload()` fires after every
  dispatch and on every Postgres change in any table. One barber saving an expense disposes and
  recreates ~96 geometries on every connected device.
- **No geometry reuse or instancing** despite the four barber chairs being identical.
- **`i18n.t()` throws on an unknown key** — no runtime fallback. Nine call sites build keys from
  dynamic values with an `as Key` cast; `App.tsx:400` casts a *stored* notification key, so a
  persisted notice with a stale key crashes the notification panel.
- **Arabic plural agreement is wrong** in every interpolated count: `'{n} دقيقة'` renders
  `٥ دقيقة` (needs `دقائق` for 3–10, accusative `دقيقةً` for 11+), same for `'من {n} مقاعد'`.
  `t()` has no plural-category support.
- **`tabular-nums` does nothing for Arabic-Indic digits** in most faces, so the right-aligned
  numeric columns do not actually align in Arabic.
- **CSV exports mix Latin numbers with Arabic-Indic date strings** in the same row; Excel cannot
  parse those dates.
- **Terminology drift in Arabic:** `مصروفات` vs `مصاريف` used interchangeably for expenses, and
  `ex.shop` / `ex.shopTotal` are *both* `مصاريف المحل`, so a single expense row is badged with the
  plural KPI label. Cancelled-state gender drifts (`ملغاة` / `ملغى`).
- **`'em.locked'` mentions a "demo user"** in production owner-facing copy, in both languages.
- **`'em.dailyWage'` hardcodes `(جنيه)`** even though the currency is configurable.
- **`'err.name'` is reused for the customer's own name** during sign-up, telling a new customer to
  "enter the customer's name". Moot once customer sign-up is deleted.
- **`staff_login_email` is granted to `anon`**, so an unauthenticated caller can turn a phone number
  into a staff sign-in email. Passwords are still checked, but it is a free enumeration oracle.
- **Phone numbers are never OTP-verified** — a deliberate shortcut noted in the original migration.
- **Four decorative CSS animations do not mirror in RTL** (`.beam.left/.right`, `beam-x`,
  `.auth-submit::after` shine). Cosmetic only.
- **Eight dead i18n keys**: `auth.email`, `auth.customer`, `c.add`, `c.view`, `c.total`, `cu.title`,
  `em.joined`, `floor.details`.

## Later product ideas

- Public page: tap-to-call and directions (occupied pre-process time measurably shortens the
  perceived wait).
- Per-barber service durations, so the estimate is per-barber rather than shop-wide.
- Admin view of the waiting-counter history (the `waiting_events` table already records it).
- Server-side report totals. The browser currently loads ~13 months of visit history for the
  dashboard; the original author left a `shortcut:` comment in `src/lib/api.ts` about this.
- Seat count configurable from Settings (today only labels are editable; the 7 seats are fixed data).
