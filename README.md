# demo-app

A small shop on Firebase: browse products, check out with an optional coupon, see your
recent orders, download an invoice. It is the application [Starfish](https://github.com/Hack2Skill-Demo/starfish)
watches in its public demo: Starfish reads this app's error logs and opens pull requests
against this repository.

> **Status: not built yet.** This repository holds no application code so far. The design is
> in the Starfish repo, `docs/design/demo-app.md`.

## How it shares a Firebase project with Starfish

The shop and Starfish deploy into the same Firebase project. These rules keep either one
from breaking the other, and they apply from the first commit:

- **Functions** are their own codebase (`"codebase": "demo"` in `firebase.json`). Without
  it, a functions deploy from either repo would delete the other repo's functions.
- **Hosting** is its own site, named in `firebase.json`, so the two deploys never
  overwrite each other.
- **Firestore:** the shop uses the `(default)` database. Starfish keeps its own data in the
  named database `starfish`. Never deploy rules or indexes from one repo to the other's
  database, and never deploy `firestore.indexes.json` with `--force`, which deletes
  indexes that aren't in the file.

## Planned stack

TypeScript, pnpm, React 19 + Vite, Firebase gen2 Functions on Node 22, Firestore. The same
stack as Starfish's operator UI. `pnpm run verify` (lint, typecheck, test, build) will be
the gate every change, including Starfish's, has to pass.
