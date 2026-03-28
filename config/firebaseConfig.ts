import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// ✅ SURGICAL FIX: Added App Check and Performance Monitoring imports
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getPerformance } from 'firebase/performance';

// ✅ SURGICAL UPDATE: Removed firebase/storage import

// ✅ UPDATED: Read from Environment Variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// =========================================================================
// 🔐 SECURITY & SCALE FIX: Firebase App Check & Performance
// =========================================================================

// 1. App Check: Blocks unverified connections (Bot/Hacker Protection)
if (__DEV__) {
    // Allows you to test in the Expo Go emulator without being blocked
    (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// ✅ SURGICAL FIX: Assigned to 'appCheck' so we can export it
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdWBJwsAAAAAOuFuF2UGd_47rxd2GUFLq8XFHjY'),
    isTokenAutoRefreshEnabled: true
});

// 2. Performance Monitoring: Tracks slow queries and screen load times for 100k+ scale
const perf = getPerformance(app);

// =========================================================================

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
});

// ✅ SURGICAL UPDATE: Removed 'const storage = getStorage(app);'

// ✅ SURGICAL FIX: Exported 'appCheck' so fetch() calls can grab the VIP token
export { appCheck, auth, db, perf };

// ✅ R2 CONFIGURATION EXPORT
export const R2_CONFIG = {
    accountId: process.env.EXPO_PUBLIC_R2_ACCOUNT_ID!,
    accessKeyId: process.env.EXPO_PUBLIC_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.EXPO_PUBLIC_R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.EXPO_PUBLIC_R2_BUCKET_NAME!,
    publicDomain: process.env.EXPO_PUBLIC_R2_PUBLIC_DOMAIN!
};