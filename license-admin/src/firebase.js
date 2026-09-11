import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// These values are public by design - the same values that ship inside the Unity
// build. Access control is the Firestore/Auth security rules, not the secrecy of
// these strings. They live in .env only so they aren't hardcoded into source
// control and so different environments (staging/prod) can point at different
// Firebase projects without editing code. See README.md.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "Firebase config is missing. Copy .env.example to .env and fill in the VITE_FIREBASE_* values."
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const firebaseProjectId = firebaseConfig.projectId;

export const CODES = "licenseCodes";
export const LICENSES = "licenses";
// Matches FirebaseSettings.devicesCollection in the Unity project. One document per
// account, keyed by Firebase UID.
export const DEVICES = "authorizedDevices";
