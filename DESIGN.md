# DESIGN — salon

Binding implementation rules. Numbers here are requirements, not suggestions. Sources at the end.

## Interaction budget

The operator flow is measured, not asserted. Current product, typical new walk-in: **8 taps,
~12 keystrokes, 1 page + 2 modals**. Target: **≤4 taps, 0 keystrokes, 1 screen, under 10 s.**

How the taps are won:
- No modal, no navigation. The entry row is permanently on the operator screen.
- Name optional, auto-defaulted. At a measured mean of 36 WPM on mobile (and slower one-handed),
  typing a two-word Arabic name costs 4–7 s — half the budget for the least useful field.
- Services and barbers are always-visible chips, never dropdowns. Exposed options beat select menus
  by a measured **2.5 s per form**. Both sets fit on screen (≈7 services, ≈4 barbers), well under
  the expose-vs-collapse thresholds (USWDS <7, Google 6, IBM 3).
- Payment method defaults to cash instead of starting empty and erroring — saves 2 taps on most
  entries.
- Fields are tappable in **any order**; the row commits itself. No wizard, no required sequence.
- Done is one tap on the card with **no confirmation dialog**. Routine confirmations train
  click-through and measurably *increase* errors; an Undo affordance is the correct substitute.

## Touch targets and controls

| Thing | Rule |
|---|---|
| Absolute floor | 24 × 24 CSS px (WCAG 2.2 AA, SC 2.5.8) |
| Normal controls | 48 × 48 dp, ≥ 8 dp apart (Material; Apple's 44 pt ≈ 7.3 mm, Material's 48 dp ≈ 7.6 mm — build to 48 and satisfy both) |
| Service / barber chips | 56–72 pt tall. Fitts's law makes the extra width free time. |
| Waiting `+` / `−` | **72–96 pt circular, ≥ 24 pt gap**, with the live number between them. 24 px steppers are documented to cause "a lot of mis-taps"; this control is tapped dozens of times a day. |
| Operator list rows | 56–64 px. Staff tap with wet or product-covered hands. |
| Destructive actions | Physically separated from Done. Never adjacent to a benign control. |

Mis-tap guards: debounce each commit, disable the control while in flight, and ignore taps landing
within **0.2 s of a list reflow** (so a row shifting after Done cannot swallow a tap into the wrong
customer).

Placement is device-conditional: on a phone the counter and primary action sit in the **bottom
third** (49% of phone use is one-handed; thumbs drive 75% of interactions). On a tablet they move to
the **side rails / middle-upper third** — a tablet's bottom edge is hostile territory, and 88% of
tablet use is seated with the device flat or in a stand.

## Feedback

Order matters: **instant visual state change first**, `.success` haptic second, optional short tone
third. A salon is loud, so audio can never be the primary channel. If the repaint lands under 100 ms
the state change *is* the confirmation and nothing else is required.

Undo snackbar: **8 s**, persisting until acted on. Material's guidance is 4–10 s without an action,
and "until dismissed" with one.

Perceived-speed contract (Nielsen): **0.1 s** feels instantaneous, **1 s** preserves flow of
thought, **10 s** is the limit of attention. Every tap must repaint under 100 ms.

## Public page

- **One hero number** (people waiting) and **one range** beneath it. No progress bar — a queue has
  no known total and people get added, so a bar visibly runs backwards.
- Hero numeral: `clamp(104px, 40vw, 260px)`, weight 700, `line-height: 1`, `tabular-nums`.
  Eyebrow label 18–20 px. Range line 32–40 px. Timestamp 14–16 px. Hero:timestamp ≈ 6–7:1.
- **Light theme, near-monochrome, ≥ 7:1 contrast on every element.** Dark mode here is a sunlight
  bug: a panel at 300:1 lab contrast falls below 2:1 in direct sun. No thin weights, no low-opacity
  grey, no colour-only encoding — every state colour is paired with a word.
- **Honest estimates.** A 5-minute-rounded **range**, never a point. Upper bound padded **+15–20%**
  (Disney posts waits that run ~71% of the number). Target 85–90% coverage, ≤5% late.
- **No countdown.** Recompute on poll; animate nothing. Redraw the band only when the midpoint moves
  **>1 min or >10%** — a number that twitches while you stare at it reads as a guess.
- Always show freshness (`آخر تحديث: …`) and an explicit **stale state at 90 s**. Uncertainty is the
  largest perceived-wait multiplier Maister identified; a timestamp is the cheapest antidote.
- Cap the display at **8 waiting**, then switch to "more than 8".
- Update transition 150–200 ms cross-fade on the block; 0 ms under `prefers-reduced-motion`.
  Wrap the number in `aria-live="polite"`.

### Performance budget (hard)

HTML ≤ 10 KB with critical CSS inlined · JS ≤ 10 KB gzip · webfont ≤ 25 KB subset · **zero images**
· first load ≤ 50 KB · poll payload ≤ 500 B. LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75.

That is 3× under Osmani's ~170 KB ceiling for TTI < 5 s on an average Android over 3G. Egypt's
median Android mobile download is ~8 Mbps at ~98 ms latency. **The public page must not load
three.js** — today it pulls a 575 KB chunk to render a 3D couch.

### Live updating

**Poll. Do not open a socket on the public page.** 20 s interval with **±3 s jitter** (a QR code at
the door creates a thundering herd), pause on `document.hidden`, refetch on `visibilitychange`,
`ETag`/`If-None-Match` so steady state is a 304, exponential backoff to 120 s after 3 failures.

Rationale: below 100 ms latency needs a socket, 100 ms–1 s favours SSE, **above 1 s polling is
sufficient** — and this number changes every few minutes. Supabase `postgres_changes` is
single-threaded and re-checks RLS per subscriber, bills per peak connection (Free tier caps at 200),
and measured only ~100 ms better than polling. Realtime stays on the **staff** screens, where
concurrency is bounded by headcount.

## Arabic / RTL

- `<html lang="ar" dir="rtl">` once. Logical properties only: `margin-inline-*`, `padding-inline-*`,
  `inset-inline-*`, `text-align: start/end`, `inline-size`. All are at 93%+ support. Prefer `gap`
  over directional margins — it removes the whole bug class.
- `[dir="rtl"]` overrides are reserved for what logical properties cannot express: `transform` /
  `translateX`, rotation, gradient angles, `transform-origin`, keyframe paths, `box-shadow`
  x-offsets, `background-position`, SVG path data, icon semantics.
- `dir="auto"` on any element rendering a user-entered string (customer names), or Arabic text
  starting with a Latin character renders as `"(Hello (World`.
- **Never mirror:** the logo, digits, the clock, phone numbers, photographs, chart axes, media
  controls.
- **Numerals: Western 0–9, everywhere, locked explicitly.** `ar-EG` defaults to Arabic-Indic in
  ICU/JS, so `Intl` calls must pass `numberingSystem: 'latn'`. This is a **change from current
  behaviour**, which renders `١٢٣`. Reasons: `٥`/`٦`/`٧` and the `٠` dot differentiate poorly at a
  glance and under glare, which is fatal for a 200 px hero number; every candidate font has tabular
  *Latin* digits but inconsistent Arabic-Indic metrics; and Egyptian phone screens and price tags
  already train Western digits. Both systems are in genuine concurrent use in Egypt — so this is one
  config flag, not a fork. Isolate ranges with `<span dir="ltr">20–30</span>`.
- **Typography:** `letter-spacing: 0` always and declared explicitly — tracking breaks cursive joins.
  Line-height **1.7–1.85 body**, 1.3–1.4 headings, 1.0 hero; never rely on `normal`, which varies
  1.11–2.11 across Arabic families. Size Arabic **+10–15%** over Latin. Minimum 14 px UI, absolute
  floor 12 px. **No faux bold** — real weights only.
- **Font: IBM Plex Sans Arabic**, kept from the current build. Tabular Latin digits by default,
  100–700, matching Latin. **Self-host and subset it** — it is 32.7 KB at weight 400 and currently
  arrives as a render-blocking third-party Google Fonts stylesheet on the critical path. Subsetting
  typically yields 200 KB → 15–25 KB; split by `unicode-range` (Arabic `U+0600–06FF`),
  `font-display: swap`, preload only the file that blocks the hero.
- Add a lint rule banning `margin-left`/`-right`, `padding-left`/`-right`, bare `left`/`right`, and
  `text-align: left`/`right` in app CSS. RTL rots without CI enforcement.

## Visual language

Two themes, deliberately different.

- **Public page:** light, high-contrast, near-monochrome. Off-white ground, near-black ink, one
  accent used *only* for queue state (green "no wait" / amber normal / deep red busy), each paired
  with a word. No photography, no gradients, logo ≤ 24 px. It must survive a sun-washed screen at
  the shop door.
- **Operator and admin:** dark, dense, front-desk style. Suits a shop-floor tablet under warm salon
  lighting, matches the black / white / deep-red barbershop palette, and gives the `+`/`−` counter
  enormous visual priority.

The couch stays as the waiting metaphor on both surfaces, drawn in **CSS/SVG, not three.js**. The
admin keeps the existing 3D floor.

## Sources

Fitts's law and Hick's law · WCAG 2.2 SC 2.5.5/2.5.8 (target size), 1.4.3/1.4.6/1.4.11 (contrast) ·
Material 3 foundations and bidirectionality · Apple HIG right-to-left and playing-haptics ·
Nielsen/NN-g response-time limits, input steppers, user mistakes (confirmation dialogs), proximity
of consequential options · Palin et al., MobileHCI 2019 (37,000-participant typing study) ·
Speero/CXL radio-vs-select experiment (n=354 per condition) · Hoober, "How We Hold Our Gadgets"
(A List Apart) · Maister, "The Psychology of Waiting Lines" (HBS 1985) · Antonides & Verhoef on
duration information · *Management Science* on estimate structure and delay-information frequency ·
web.dev Core Web Vitals · Osmani on performance budgets · Spotify Engineering, "Right to Left: The
Mirror World" · W3C `alreq` and bidi guidance · MDN `Intl.NumberFormat` · Supabase Realtime scaling
and pricing · product teardowns: NextUp Walk-in, Zenoti Queue, Boulevard Front Desk, Squire, Fresha
Quick Sale, Mangomint, MyTime (as the anti-pattern), Qminder, Waitwhile, NextMe, QLess.
