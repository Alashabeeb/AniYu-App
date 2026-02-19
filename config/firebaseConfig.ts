import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
});

const storage = getStorage(app);

export { auth, db, storage };

// ✅ R2 CONFIGURATION EXPORT
export const R2_CONFIG = {
    accountId: process.env.EXPO_PUBLIC_R2_ACCOUNT_ID!,
    accessKeyId: process.env.EXPO_PUBLIC_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.EXPO_PUBLIC_R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.EXPO_PUBLIC_R2_BUCKET_NAME!,
    publicDomain: process.env.EXPO_PUBLIC_R2_PUBLIC_DOMAIN!
};