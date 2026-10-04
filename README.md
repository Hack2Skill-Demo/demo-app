# demo-app

A small shop on Firebase: browse products, check out with an optional coupon, see your
recent orders, download an invoice. It is the application [Starfish](https://github.com/Hack2Skill-Demo/starfish)
watches in its public demo: Starfish reads this app's error logs and opens pull requests
against this repository.

The design is in the Starfish repo, `docs/design/demo-app.md`.

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

## Stack and layout

TypeScript, pnpm, React 19 + Vite, Firebase gen2 Functions on Node 22, Firestore. The same
stack as Starfish's operator UI. `pnpm run verify` (lint, typecheck, test, build) is the
gate every change, including Starfish's, has to pass; CI runs it on every pull request.

| Path | What it is |
| --- | --- |
| `web/` | The shop (React + Vite), deployed to its own Hosting site |
| `functions/` | Callable functions as grouped exports, deployed as `orders-createOrder` and so on |
| `shared/` | Pure code used by both: pricing, access-code rules, feature health |
| `firestore.rules`, `firestore.indexes.json` | Rules and indexes for the `(default)` database |

## Running it

```sh
pnpm install
cp web/.env.example web/.env.local          # fill in the Firebase web config
cp functions/.env.example functions/.env.<project-id>   # DEMO_CONTROLLER_URL
pnpm run verify
```

Set `VITE_USE_EMULATORS=true` to run against the Firebase emulators. `firebase.json` uses
the Hosting site `demo-app-shop` and project `demo-app-shop`; change both in `firebase.json`
and `.firebaserc` to match the real project.

## Access

- **Visitors** enter an access code once. The browser signs in anonymously and
  `access-redeemCode` trades the code for a grant that lasts until the code expires. Codes
  are random, expire, can be revoked, are rate-limited (5 wrong tries per 10 minutes) and
  only their SHA-256 hash is stored.
- **Team members** sign in with Firebase Auth email and password. Give an account the
  custom claim `team: true` (Admin SDK `setCustomUserClaims`) to let it create and revoke
  codes with `access-createCode` and `access-revokeCode`, and call `catalog-seed` once to
  load sample products and a `WELCOME10` coupon.

## The Lab page

Scenarios are loaded at runtime from the demo controller, whose base URL is the
`DEMO_CONTROLLER_URL` parameter. The controller serves `GET /scenarios` and
`POST /scenarios/run`; a press sends only `{ "scenarioId": "…" }`. The health strip has one
dot per shop feature, coloured from the success rate of its last 20 calls (visitor
mistakes such as a wrong code or an expired coupon don't count).
