---
title: Hair salon — the customer's modifications
slug: salon
type: UNKNOWN — ask the owner, then pick one from factory/blueprints/README.md
one_liner: Changes the salon's existing system needs; the system itself is not on this machine yet.
priority: 1
status: inbox
push: false
---

## Idea

Ahmed Semsem runs a hair salon and already has something built. The customer has asked for
**modifications**. This file is a stub written when the factory was set up on 2026-11-20 — it
holds what is known and marks what is not, so the next agent asks instead of assuming.

## Known

- The client is a hair salon.
- Something already exists and is in use: this is maintenance, not a first build.
- The owner wants the work run out of this factory, which is why it exists.

## Unknown — ask the owner before any code is written

- **Where the current product is.** Nothing on this machine: no salon/barber/booking folder
  anywhere under the home folder, no such repository, no external volume. A remote to clone, a
  folder to copy, or another machine?
- **What the modifications are.** Not one of them is recorded anywhere.
- **What it is built with**, which decides the blueprint and every gate in `factory.json`.
- **Who uses it** — the salon's staff, its customers, or both. Booking, payments and customer
  details each pull in `factory/checklists/security-review.md`.
- **What "done" means to the customer**, and whether there is a deadline.
- **Arabic or English**, or both — and if Arabic, whether the interface is right-to-left.

## Must have

- (fill from the owner's answers — leave nothing here invented)

## Nice to have

- 

## Constraints

- The product's own repository lives under `products/<slug>/`; this factory's repository never
  holds product code.
- It is a live salon: a change that breaks booking costs the customer real money. Prefer a
  reversible change and a way to try it before it reaches their customers.
