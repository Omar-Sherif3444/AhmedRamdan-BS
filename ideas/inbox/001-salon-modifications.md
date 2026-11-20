---
title: Hair salon — the customer's modifications
slug: salon
type: web-app
one_liner: Two account levels, a one-screen operator console, and a public page that only shows the wait.
priority: 1
status: building
product: products/salon
push: false
---

## Idea

Ahmed Semsem runs a hair salon with an existing, working system (React 19 + Vite + Supabase,
Arabic-first and RTL). The owner wants it culled and rebuilt around how the shop actually runs.
The questions this file used to list have been answered; they are recorded below.

## Answered

- **Where the product lives.** `https://github.com/Omar-Sherif3444/AhmedRamdan-BS`, cloned to
  `products/salon`. Built by Omar Sherif. No credentials for the original Supabase or Vercel
  accounts exist or are needed: the whole backend reproduces from the migrations in the repo.
- **What it is built with.** Vite 8 + React 19 + TypeScript, Supabase (Postgres, Auth, Realtime,
  Edge Functions, pg_cron), three.js for a 3D shop floor, Vercel for hosting. Blueprint `web-app`,
  with a deliberate deviation: it stays Vite + plain CSS rather than being migrated to Next.js +
  Tailwind, because this is maintenance of a working product, not a new build.
- **Who uses it.** Three surfaces, and only two of them have accounts:
  - *Public* — anyone with the URL or a QR code, no login. Sees only how many people are waiting.
  - *Operator* — the front desk. One screen, 6-digit PIN.
  - *Admin* — the owner. Keeps everything the old owner role had.
- **Arabic or English.** Arabic first, RTL, with English available. Arabic is what matters.
- **What the modifications are.** See `products/salon/SPEC.md`. In short: collapse three roles to
  two account levels, delete customer accounts and customer sofa reservations, replace the staff
  floor with a single operator screen whose entry costs under 10 seconds, add a manual waiting
  counter, and reduce the public page to one number.
- **What "done" means.** An operator can record a customer in ≤4 taps with no keyboard, and the
  public page opens on a cheap Android phone on 3G.

## Must have

- Exactly two account levels: `admin` and `operator`. The admin creates operators.
- Barbers are profiles with **no login at all** — the operator records what they did.
- Operator: one screen. Name (optional), several services, one barber, one-tap done, and a
  `+` / `−` waiting counter shown on a couch.
- Public: how many are waiting, and an honest wait range. Nothing else.
- Money is never typed by the operator: the amount comes from the service catalogue.

## Nice to have

- Wait estimates from the shop's own service-duration history rather than a configured average.
- An admin view of the waiting-counter history (`waiting_events` already records it).

## Constraints

- The product's own repository lives under `products/<slug>/`; this factory's repository never
  holds product code.
- It is a live salon: a change that breaks the floor costs the customer real money. Prefer a
  reversible change, and never push a migration straight at their production database — the CLI
  link that made that possible has been removed.
- Security tooling and data handling stay defensive: the public page exposes no personal data.
