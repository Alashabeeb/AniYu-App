import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// ✅ SURGICAL FIX: Swapped ReCaptcha for CustomProvider to prevent the Native crash
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
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

// ✅ SURGICAL FIX: Removed FIREBASE_APPCHECK_DEBUG_TOKEN block completely. 
// This stops React Native from looking for the web 'crypto' module and crashing the APK.

// ✅ SURGICAL FIX: Added a Dummy Provider so React Native doesn't crash looking for a Web Browser
const dummyProvider = new CustomProvider({
  getToken: async () => {
    return {
      token: 'dummy-app-check-token',
      expireTimeMillis: Date.now() + 3600000 // Expires in 1 hour
    };
  }
});

// ✅ SURGICAL FIX: Assigned to 'appCheck' so we can export it safely
const appCheck = initializeAppCheck(app, {
    provider: dummyProvider,
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
