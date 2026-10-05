import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Firebase Hosting serves the project's web config at /__/firebase/init.json, so a deployed bundle carries no
 * project settings. Locally (and when no web app is registered) the VITE_FIREBASE_* variables are used instead.
 */
async function loadConfig(): Promise<FirebaseOptions> {
  try {
    const res = await fetch('/__/firebase/init.json');
    if (res.ok) return (await res.json()) as FirebaseOptions;
  } catch {
    // fall through to the variables
  }
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

const app = initializeApp(await loadConfig());

export const auth = getAuth(app);
// The shop's own database. Starfish's data lives in the named `starfish` database; this app never opens it.
export const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

/** Call a deployed function by its grouped name, e.g. `orders-createOrder`. */
export async function call<Req, Res>(name: string, data?: Req): Promise<Res> {
  const result = await httpsCallable<Req, Res>(functions, name)(data);
  return result.data;
}

/** The message to show a person when a call fails. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
