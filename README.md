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
- **Firestore:** the shop uses the `(default)` database, plus a second one, `analytics`, for
  reporting. Starfish keeps its own data in the
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
| `pdf-renderer/` | Cloud Run service that draws invoice PDFs (self-contained, own Dockerfile) |
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

## Access and the demo controller

The shop works with [`demo-control`](https://github.com/Hack2Skill-Demo/demo-control), the private repo behind the Lab
buttons. They meet at these points:

- **Claims.** A visitor enters an access code once; the browser signs in anonymously and `access-redeemCode` trades the
  code for a grant and the custom claim `demoAccessCodeId` (the code's id, never the code). A team member carries
  `demoTeam: true`, set by hand with the Admin SDK (`setCustomUserClaims`). The controller refuses any other account.
  Revoking a code (`access-revokeCode`) ends its grants and revokes the refresh tokens of every account it opened.
  Codes are random, expire, are rate-limited (5 wrong tries per 10 minutes) and only their SHA-256 hash is stored.
- **The Lab page** calls `control-getScenarios`, `control-getState`, `control-getHealth` and
  `control-triggerFault({ scenarioId })`, deployed from `demo-control`, and nothing else. The health strip is drawn from
  `control-getHealth`.
- **Seed data.** A team member calls `catalog-seed({ confirm: true })` once: SKUs (`sku-mug`, `sku-tote`, `sku-poster`,
  `sku-sticker-pack`, `sku-cable-3m`, and `sku-sample-free`, which has no price on purpose), coupons `WELCOME10` and
  `THANKS5`, and gift card `GIFT-DEMO-0001`. `sku-does-not-exist` stays unknown.
- **Order shape.** `orders-createOrder` takes `{ items: [{ sku, qty }], couponCode?, giftWrap?, giftNote?, giftCardCode?,
  tags?, pickup? | shippingAddress? }` and returns `{ orderId }`. Orders carry `customerId`, which the
  `(customerId, createdAt desc)` index serves.
- **Indexes** in `firestore.indexes.json` match demo-control's targets: `(customerId, createdAt desc)` for recent orders,
  `(tags array-contains, createdAt desc)` for tag search, and `(status, createdAt desc)` for the digest and rollup.
- **Runtime account.** Functions run as `demo-functions@<project>`; invoices are also written to the bucket
  `<project>-demo-invoices`.
- **Lint.** `ignoreUndefinedProperties` is banned (`eslint.config.js`). It is part of the baseline, not a fault.

## Invoices and the nightly export

- **Invoices:** "Download invoice" on an order calls `invoices-renderPdf`, which translates the
  labels and line items into the browser's language with the Cloud Translation API (English
  skips the call), draws the PDF and returns it. If anything fails the order shows
  "Invoice unavailable". The Cloud Translation API must be enabled in the project.
- **Nightly export:** `reports-nightlyExport` runs at 02:00 UTC (`reports-runNightlyExport` starts one now, through its Cloud Scheduler job), POSTs yesterday's orders as
  JSON to `EXPORT_UPSTREAM_URL` with a 10-second deadline and writes the outcome to
  `exports/last`. The Reports page shows it as ready or failed.

## Deploy on merge

`.github/workflows/deploy.yml` runs on every push to `main`: `pnpm run verify`, then
`firebase deploy --only functions:demo,hosting:<site>` (unchanged functions are skipped).
It never deploys Firestore rules or indexes. Set up once:

- repository variable `FIREBASE_PROJECT_ID`;
- repository secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`, a service
  account allowed to deploy Functions and Hosting and to write Firestore.

The deploy job runs under the GitHub environment `production`, so GitHub records a Deployment for the merge commit with
status `success` when it finishes (the controller's reset script waits for it). Set repository variables
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_APP_ID` too: the web app is built during the
Hosting predeploy. After a successful deploy `functions/scripts/record-deploy.mjs` writes the commit, the Cloud Run
revision of each function, the Hosting version and the completion time to the `(default)`
database: `deployments/<commit>` for history and `deployments/current` for the live one. Starfish can read the same document.

## The rest of the shop

| Function | What it does |
| --- | --- |
| `orders-searchOrders` | Orders by tag, newest first |
| `orders-getOrder` | Order details, delivery or pickup |
| `orders-cancelOrder` | Cancel an unpaid order; a gift card amount is given back |
| `orders-applyGiftCard` | Check a gift card; checkout spends it. Gift wrap adds $5 |
| `billing-createCheckoutSession` | Card payment through `PAYMENT_PROVIDER_URL` |
| `payments-webhook` | Provider callback; HMAC-SHA256 signature in `x-signature`, secret `PAYMENT_WEBHOOK_SECRET` |
| `accounts-onUserCreate` | Profile for email or phone sign-ups (first-generation: Auth's onCreate has no v2 form) |
| `notifications-sendReceiptEmail` | Receipt through `MAIL_PROVIDER_URL`, key in secret `MAIL_PROVIDER_KEY` |
| `reports-importCsv` | Team-only product import (`id,name,price`); one bad row rejects the file |
| `reports-weeklyDigest` | Mondays 08:00 UTC (first-generation: scheduled through Pub/Sub) |
| `reports-dailyRollup` | Daily totals into the `analytics` database |
| `support-submitTicket` | Contact form |
| `admin-backfillTotals` | 03:30 UTC: recompute order totals from their lines |
| `misc-warmCache` | Every 10 minutes: catalog into one document the Shop reads |
| `pdf-renderer` | Cloud Run service behind `invoices-renderPdf` (`PDF_RENDERER_URL`) |

`shared/pricing.ts` is the only place money arithmetic lives; checkout, billing and the
backfill all use it.

### Set up before deploying these

- Secrets: `firebase functions:secrets:set PAYMENT_WEBHOOK_SECRET` and `MAIL_PROVIDER_KEY`
  (a functions deploy fails while a declared secret is missing).
- `functions/.env.<project>`: `PAYMENT_PROVIDER_URL`, `MAIL_PROVIDER_URL`, `PDF_RENDERER_URL`, `EXPORT_UPSTREAM_URL` (the payment, mail and export URLs are demo-control's stubs).
- A service account `demo-functions@<project>` for the shop's functions, with Firestore, Storage, Translation and
  Cloud Scheduler job-runner access (`reports-runNightlyExport` runs the scheduled export's job).
- A bucket `<project>-demo-invoices`.
- The second database: `gcloud firestore databases create --database=analytics --location=<region>`.
  Deploy its rules with `firebase deploy --only firestore:analytics`.
- Let the functions' service account call the renderer:
  `gcloud run services add-iam-policy-binding pdf-renderer --member=serviceAccount:<functions SA> --role=roles/run.invoker`.
  The deploy workflow deploys `pdf-renderer` as a private service; its account also needs Cloud Build
  and Cloud Run deploy roles.
- Deploy indexes by hand (`firebase deploy --only firestore:indexes`, never `--force`): the tag
  search needs the `(uid, tags, createdAt)` index.
