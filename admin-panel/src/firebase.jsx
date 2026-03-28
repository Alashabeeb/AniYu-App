import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ SURGICAL FIX: Import App Check for the Web Admin Panel
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// ✅ SURGICAL UPDATE: Removed 'firebase/storage' completely. 
// We rely 100% on Cloudflare R2 for all media.

// ✅ CONFIG: Reads from the secure .env file
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// =========================================================================
// 🔐 SECURITY FIX: Firebase App Check for Admin Panel
// =========================================================================

// Allow local testing without being blocked by App Check (Vite syntax)
if (import.meta.env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// ✅ SURGICAL FIX: Initialize and export the App Check instance
export const appCheck = initializeAppCheck(app, {
    // Uses the exact same Site Key as the mobile app
    provider: new ReCaptchaV3Provider('6LdWBJwsAAAAAOuFuF2UGd_47rxd2GUFLq8XFHjY'),
    isTokenAutoRefreshEnabled: true
});

// =========================================================================

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
// ✅ SURGICAL UPDATE: Removed 'export const storage = getStorage(app);'