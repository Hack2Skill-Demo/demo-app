#!/usr/bin/env bash
# One-time Google Cloud setup for deploying the shop from GitHub Actions without a service-account key.
#
#   scripts/setup-gcp.sh                  # prints every command, changes nothing
#   APPLY=1 scripts/setup-gcp.sh          # does it (needs `gcloud auth login` as someone who can manage IAM, e.g. an Owner)
#
# What it makes, all in PROJECT_ID (default: the shop's project):
#   - the APIs the shop needs
#   - service account `demo-functions`: the identity the shop's functions run as, with only what they use
#   - service account `demo-deployer`: what GitHub Actions deploys as. Only this repository's jobs that run in the
#     `production` environment can use it (Workload Identity Federation: no key exists, nothing to leak)
#   - a Workload Identity provider for this repository, in the pool `github` (created if it does not exist)
#   - the invoices bucket, the `analytics` database and two Secret Manager secrets
#
# It never creates a key, never prints a secret, and grants no Owner or Editor role. Run it again to repair a step.
#
#   PROJECT_ID  REPO  REGION  FIRESTORE_LOCATION (for the analytics database, e.g. nam5)  POOL  PROVIDER
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-hack2skill-demo}"
REPO="${REPO:-Hack2Skill-Demo/demo-app}"
REGION="${REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-github-demo-app}"
APPLY="${APPLY:-0}"

DEPLOYER="demo-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME="demo-functions@${PROJECT_ID}.iam.gserviceaccount.com"
RENDERER="demo-pdf-renderer@${PROJECT_ID}.iam.gserviceaccount.com"
BUCKET="${PROJECT_ID}-demo-invoices"

step() { printf '\n== %s\n' "$*"; }
run() {
  if [ "$APPLY" = "1" ]; then "$@"; else printf '+ %q' "$1"; shift; printf ' %q' "$@"; printf '\n'; fi
}
# True only when applying and the command succeeds: a dry run cannot ask Google, so it prints every creation.
exists() { [ "$APPLY" = "1" ] && "$@" >/dev/null 2>&1; }

if [ "$APPLY" = "1" ]; then
  command -v gcloud >/dev/null || { echo "gcloud is required" >&2; exit 1; }
  [ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ] || { echo "run: gcloud auth login" >&2; exit 1; }
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
else
  PROJECT_NUMBER="<project number>"
  echo "DRY RUN: nothing is changed. Re-run with APPLY=1 to apply."
fi

# Firestore access is limited by condition to the shop's databases. The project also holds Starfish's `starfish` database,
# which nothing here may reach.
DEFAULT_DB="projects/${PROJECT_ID}/databases/(default)"
ANALYTICS_DB="projects/${PROJECT_ID}/databases/analytics"
SHOP_DBS="resource.name == \"${DEFAULT_DB}\" || resource.name.startsWith(\"${DEFAULT_DB}/\") || resource.name == \"${ANALYTICS_DB}\" || resource.name.startsWith(\"${ANALYTICS_DB}/\")"

bind() { # bind <member> <role> [IAM condition expression]
  local cond=(--condition=None)
  [ -z "${3:-}" ] || cond=(--condition="expression=$3,title=shop-databases-only")
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$1" --role="$2" "${cond[@]}" --quiet --format=none
}

step "APIs"
run gcloud services enable --project="$PROJECT_ID" \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  firestore.googleapis.com firebasehosting.googleapis.com identitytoolkit.googleapis.com translate.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com

step "Service accounts"
for sa in demo-functions demo-deployer demo-pdf-renderer; do
  exists gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" ||
    run gcloud iam service-accounts create "$sa" --project="$PROJECT_ID" --display-name="Demo shop: $sa"
done

step "Workload Identity: this repository's production deploys may act as demo-deployer"
exists gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT_ID" --location=global ||
  run gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT_ID" --location=global --display-name="GitHub Actions"
# The attribute condition is not optional: without it any GitHub repository could present a token to this provider.
exists gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL" ||
  run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
    --attribute-condition="assertion.repository == '${REPO}' && assertion.environment == 'production'"
run gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --format=none

step "What the deployer may do (a starting set: the first run names anything missing; add that one role, do not widen to Owner)"
# Be clear about the size of this: several of these roles are project-wide because a Functions or Cloud Run deploy
# cannot be scoped tighter, so the deployer is highly privileged. What guards it is the provider's condition (this
# repository, `production` environment only) plus that environment limited to the `main` branch in GitHub."
for role in roles/firebasehosting.admin roles/cloudfunctions.developer roles/run.admin roles/cloudbuild.builds.editor \
  roles/artifactregistry.admin roles/storage.admin roles/cloudscheduler.admin roles/pubsub.editor roles/eventarc.admin \
  roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  bind "serviceAccount:${DEPLOYER}" "$role"
done
# After a deploy it records the live commit in the shop's (default) database, and nowhere else.
bind "serviceAccount:${DEPLOYER}" roles/datastore.user \
  "resource.name == \"${DEFAULT_DB}\" || resource.name.startsWith(\"${DEFAULT_DB}/\")"
# It may run things as the shop's runtime account, the PDF renderer's account (which holds no roles at all) and the
# project's default build account, and nothing else; each on that one account, not project-wide. Cloud Run and
# Functions source deploys build as the default build account, so a deploy is denied without the last one.
BUILD_ACT_AS="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# The Firebase CLI also requires it on the App Engine default account, which first-generation functions run as.
APP_ENGINE_SA="${PROJECT_ID}@appspot.gserviceaccount.com"
for target in "$RUNTIME" "$RENDERER" "$BUILD_ACT_AS" "$APP_ENGINE_SA"; do
  run gcloud iam service-accounts add-iam-policy-binding "$target" --project="$PROJECT_ID" \
    --role=roles/iam.serviceAccountUser --member="serviceAccount:${DEPLOYER}" --format=none
done

step "What the shop's functions may do (as demo-functions)"
for role in roles/logging.logWriter roles/artifactregistry.reader roles/firebaseauth.admin roles/cloudtranslate.user \
  roles/cloudscheduler.jobRunner; do
  bind "serviceAccount:${RUNTIME}" "$role"
done
bind "serviceAccount:${RUNTIME}" roles/datastore.user "$SHOP_DBS"
# firebaseauth.admin cannot be narrowed: Authentication is shared by the whole project. The shop's functions only
# ever set claims on, and revoke tokens of, the account that called them.

step "Cloud builds run as the project's default compute account, which newer projects do not let read the source"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
bind "serviceAccount:${BUILD_SA}" roles/run.builder

step "The invoices bucket: the shop's functions may create invoices there, and nothing more"
exists gcloud storage buckets describe "gs://${BUCKET}" --project="$PROJECT_ID" ||
  run gcloud storage buckets create "gs://${BUCKET}" --project="$PROJECT_ID" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
run gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${RUNTIME}" \
  --role=roles/storage.objectCreator --format=none

step "The analytics database (a second database for reports; (default) is the shop's, and Starfish keeps its own)"
if [ -z "$FIRESTORE_LOCATION" ]; then
  echo "skipped: set FIRESTORE_LOCATION (for example nam5) to create it"
else
  exists gcloud firestore databases describe --database=analytics --project="$PROJECT_ID" ||
    run gcloud firestore databases create --database=analytics --location="$FIRESTORE_LOCATION" --project="$PROJECT_ID"
fi

step "Secrets"
# The webhook secret is generated here and goes straight into Secret Manager; it is never printed. Give the same
# value to the payment provider that signs the webhook. The mail key is a placeholder to replace with the real one.
make_secret() { # make_secret <name> <value command...>
  local name="$1"; shift
  exists gcloud secrets describe "$name" --project="$PROJECT_ID" && { echo "$name exists; left as it is"; return; }
  run gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic
  if [ "$APPLY" = "1" ]; then
    "$@" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=- --quiet >/dev/null
  else
    echo "+ (a value from: $*) | gcloud secrets versions add $name --data-file=-"
  fi
}
make_secret PAYMENT_WEBHOOK_SECRET openssl rand -hex 32
make_secret MAIL_PROVIDER_KEY printf '%s' 'replace-me'
# The deployer manages these two secrets and no others in the project (a functions deploy binds them to the runtime account).
for name in PAYMENT_WEBHOOK_SECRET MAIL_PROVIDER_KEY; do
  run gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
    --role=roles/secretmanager.admin --format=none
done

cat <<DONE

== Still to do by hand
GitHub (Settings -> Secrets and variables -> Actions -> Variables):
  FIREBASE_PROJECT_ID               ${PROJECT_ID}
  GCP_WORKLOAD_IDENTITY_PROVIDER    projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  GCP_DEPLOY_SERVICE_ACCOUNT        ${DEPLOYER}
GitHub (Settings -> Environments): create \`production\`, limit deployment branches to \`main\`, add required reviewers if wanted.
Firebase console: Authentication -> turn on Anonymous and Email/Password; register a web app (Hosting serves its config).
The shop's functions also need functions/.env.${PROJECT_ID} (see functions/.env.example).
DONE
