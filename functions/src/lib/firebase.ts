import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

/** The shop's `(default)` database. Starfish keeps its data in the named `starfish` database; never open that one here. */
export const db = getFirestore();

/** The shop's second database, for reporting. It must exist: `gcloud firestore databases create --database=analytics`. */
export const analyticsDb = getFirestore(getApp(), 'analytics');
