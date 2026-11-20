# ahmed-semsem — a software factory for one client

A factory of its own, for **Ahmed Semsem's hair salon**. Same machinery as
`AG/software-factory`, its own history, its own products: nothing here is shared with that one, and
nothing here should reach into it.

- `AGENTS.md` — the operating manual, copied unchanged. Claude Code reads it through `CLAUDE.md`;
  other agents read `AGENTS.md` directly. **Read it before touching anything.**
- `bin/factory.mjs` — `next`, `new`, `check`, `ship`, `status`. Zero dependencies, Node 22+.
  It resolves its own root, so it works from this folder with no configuration.
- `factory/blueprints/` — pick exactly one per product, from `factory/blueprints/README.md`.
- `ideas/inbox/` — one markdown file per piece of work. `products/` — one folder per product,
  each its own git repository (this repository ignores their contents).

## The state this was handed over in

Set up **2026-11-20**. One product is mid-build: `salon`, the existing barbershop system, found
and cloned. `SHIPPED.md` still has no rows — nothing has shipped yet.

### Assembling the layout

This repository and the product are **two separate git repositories**, by design: `products/*` is
ignored here, so product code never enters the factory's history and the factory never enters the
product's. They are pushed as two unrelated branches of the same GitHub repository. To get the
working layout:

```sh
git clone -b factory https://github.com/Omar-Sherif3444/AhmedRamdan-BS.git ahmed-semsem
cd ahmed-semsem
git clone -b fo2sh https://github.com/Omar-Sherif3444/AhmedRamdan-BS.git products/salon
```

Then read **`products/salon/HANDOFF.md`** before anything else. It is the real starting point: it
lists what is done, what is left in the order to do it, and how to stand up a local Supabase
backend from the migrations. No credentials from anyone's hosting account are needed.

### What the agent taking over should know

- **The product's build is deliberately red** — 69 `tsc` errors, 9/12 tests. `lint` is green.
  Every error is a known step in an unfinished refactor and is enumerated in `HANDOFF.md`.
  Do not treat it as a broken checkout.
- `products/salon/SPEC.md` is the agreed scope, `DESIGN.md` holds binding UI numbers (touch
  targets, contrast, performance budget, Arabic/RTL rules), and `BACKLOG.md` lists defects
  inherited from the original product.
- `ideas/inbox/001-salon-modifications.md` was a stub full of questions; the answers are recorded
  in it now. Do not re-ask them.
- The CLI link to the client's **live production** Supabase project was removed, and
  `supabase/.temp/` is no longer tracked. Never point `supabase db push --linked` at the salon's
  running database.

## Run a cycle

```sh
node bin/factory.mjs next            # the highest-priority idea
node bin/factory.mjs new ideas/inbox/001-salon-modifications.md
node bin/factory.mjs check <slug>    # lint, typecheck, test, build, audit
node bin/factory.mjs ship <slug>
```
