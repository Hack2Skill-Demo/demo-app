// Run by .github/workflows/deploy.yml after a successful deploy. Records which commit is live, the
// revisions that were deployed and when it finished, in the shop's (default) Firestore database:
//   deployments/<commit>   one document per deploy (history)
//   deployments/current    the latest one; the Lab page and Starfish read this
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const REGION = 'us-central1';

/** The group names exported by functions/src/index.ts, which prefix every function id (`orders-createOrder`). */
export function groupsFromIndex(source) {
  return [...source.matchAll(/^export \{ (\w+) \} from /gm)].map((m) => m[1]);
}

/** Cloud Run service ids are the lower-cased function ids. Only this codebase's groups are ours; Starfish's functions share the project. */
export function pickRevisions(services, groups) {
  const out = {};
  for (const svc of services) {
    const id = svc.name.split('/').pop();
    if (groups.some((g) => id.startsWith(`${g.toLowerCase()}-`)) && svc.latestReadyRevision) {
      out[id] = svc.latestReadyRevision.split('/').pop();
    }
  }
  return out;
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function main() {
  const { GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY, FIREBASE_PROJECT_ID, HOSTING_SITE, ACCESS_TOKEN } = process.env;
  for (const [k, v] of Object.entries({ GITHUB_SHA, FIREBASE_PROJECT_ID, HOSTING_SITE, ACCESS_TOKEN })) {
    if (!v) throw new Error(`${k} is required`);
  }
  const groups = groupsFromIndex(readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8'));

  const runUrl = `https://run.googleapis.com/v2/projects/${FIREBASE_PROJECT_ID}/locations/${REGION}/services?pageSize=500`;
  const hostingUrl = `https://firebasehosting.googleapis.com/v1beta1/sites/${HOSTING_SITE}/releases?pageSize=1`;
  const [run, hosting] = await Promise.all([getJson(runUrl, ACCESS_TOKEN), getJson(hostingUrl, ACCESS_TOKEN)]);

  const record = {
    commit: GITHUB_SHA,
    functionRevisions: pickRevisions(run.services ?? [], groups),
    hostingVersion: hosting.releases?.[0]?.version?.name ?? null,
    workflowRun: GITHUB_RUN_ID ? `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null,
    // Taken now, after the deploy finished, so it is the completion time.
    deployedAt: Timestamp.now(),
  };

  initializeApp({ projectId: FIREBASE_PROJECT_ID });
  const db = getFirestore();
  const batch = db.batch();
  batch.set(db.doc(`deployments/${GITHUB_SHA}`), record);
  batch.set(db.doc('deployments/current'), record);
  await batch.commit();
  console.log(`Recorded ${GITHUB_SHA} as live (${Object.keys(record.functionRevisions).length} function revisions)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
