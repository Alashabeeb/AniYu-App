import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// ✅ Web SDK Imports
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';

// ✅ Native SDK Imports (For APK)
import nativeFirebase from '@react-native-firebase/app';
import nativeAppCheck from '@react-native-firebase/app-check';
import firebasePerf from '@react-native-firebase/perf';

// ✅ Read from Environment Variables
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

// 1. Initialize the Native Firebase bridge
if (!nativeFirebase.apps.length) {
  nativeFirebase.initializeApp(firebaseConfig as any);
}

// ✅ SURGICAL FIX 1: We MUST install the provider on the Native Android OS first!
// This tells Android to use Google Play Integrity to generate the token.
const rnfbProvider = nativeAppCheck().newReactNativeFirebaseAppCheckProvider();
rnfbProvider.configure({
  android: {
    provider: __DEV__ ? 'debug' : 'playIntegrity',
  },
  apple: {
    provider: __DEV__ ? 'debug' : 'appAttest',
  }
});

// Install the configured provider natively
nativeAppCheck().initializeAppCheck({
  provider: rnfbProvider,
  isTokenAutoRefreshEnabled: true
});

// ✅ SURGICAL FIX 2: Now the CustomProvider can safely ask the Native OS for the token
const nativeProvider = new CustomProvider({
  getToken: async () => {
    try {
      // Android will no longer crash here because Play Integrity is properly installed
      const { token } = await nativeAppCheck().getToken(false);
      return { 
        token, 
        expireTimeMillis: Date.now() + 3600000 // Expires in 1 hour
      };
    } catch (error) {
      console.error("Native App Check Error:", error);
      throw error; 
    }
  }
});

// Initialize the Web SDK with our Native Bridge
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

// Native Performance Monitoring
const perf = firebasePerf();

export { appCheck, auth, db, perf };
