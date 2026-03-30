import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// ✅ SURGICAL FIX: Swapped ReCaptcha for CustomProvider to prevent the Native crash
import firebasePerf from '@react-native-firebase/perf';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
// ✅ REAL NATIVE APP CHECK IMPORTS FOR APK
import nativeFirebase from '@react-native-firebase/app';
import nativeAppCheck from '@react-native-firebase/app-check';

// ✅ SURGICAL UPDATE: Removed firebase/storage import

// ✅ UPDATED: Read from Environment Variables and cast as string to satisfy TypeScript
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID as string
};

const app = initializeApp(firebaseConfig);

// =========================================================================
// 🔐 SECURITY & SCALE FIX: Firebase App Check & Performance
// =========================================================================

// ✅ SURGICAL FIX: Removed FIREBASE_APPCHECK_DEBUG_TOKEN block completely. 
// This stops React Native from looking for the web 'crypto' module and crashing the APK.

// ✅ SURGICAL FIX: Initialize the Native Firebase bridge for real App Check
if (!nativeFirebase.apps.length) {
  // Cast as any to remove the red underline caused by strict typing
  nativeFirebase.initializeApp(firebaseConfig as any);
}

// ✅ SURGICAL FIX: Replaced Dummy Provider with REAL Native Token Provider
const nativeProvider = new CustomProvider({
  getToken: async () => {
    try {
      // 🔧 FIX: React Native Firebase only returns the 'token'. 
      // We extract it, and manually append the 1-hour expiration time to satisfy the provider.
      const { token } = await nativeAppCheck().getToken(false);
      return { 
        token, 
        expireTimeMillis: Date.now() + 3600000 // Expires in 1 hour
      };
    } catch (error) {
      console.error("Native App Check Error:", error);
      throw error; // Will be caught and handled securely
    }
  }
});

// ✅ SURGICAL FIX: Assigned to 'appCheck' so we can export it safely
const appCheck = initializeAppCheck(app, {
    provider: nativeProvider,
    isTokenAutoRefreshEnabled: true
});

// =========================================================================

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
});

// 2. Performance Monitoring: Tracks slow queries and screen load times natively for 100k+ scale
const perf = firebasePerf();

// ✅ SURGICAL UPDATE: Removed 'const storage = getStorage(app);'

// ✅ SURGICAL FIX: Exported 'appCheck' so fetch() calls can grab the VIP token
export { appCheck, auth, db, perf };
