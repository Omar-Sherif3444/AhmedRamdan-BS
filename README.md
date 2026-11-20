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

It was set up on **2026-11-20** and nothing has been built yet. `products/` is empty and
`SHIPPED.md` has no rows.

**The salon already has something running, and the customer wants modifications — but none of it
is on this machine.** A search of the whole home folder found no salon, barber or booking project,
no matching repository, and no external volume holding one. So the first job is not to build: it
is to get the existing product here.

## First moves for the agent taking over

1. **Ask the owner where the current product lives** — a git remote to clone into
   `products/<slug>/`, a folder to copy, or another machine. Do not start a rewrite because the
   source is missing; a salon with a running system wants its system changed, not replaced.
2. **Ask what the modifications are.** `ideas/inbox/001-salon-modifications.md` is a stub: it
   records what is known, and every blank in it is a question for the owner. Fill it from their
   answers, do not invent requirements.
3. Only then run the loop in `AGENTS.md`: `node bin/factory.mjs next`, pick a blueprint, and go.

If the existing product turns out not to exist after all, say so plainly and agree a fresh build
with the owner before scaffolding one.

## Run a cycle

```sh
node bin/factory.mjs next            # the highest-priority idea
node bin/factory.mjs new ideas/inbox/001-salon-modifications.md
node bin/factory.mjs check <slug>    # lint, typecheck, test, build, audit
node bin/factory.mjs ship <slug>
```
