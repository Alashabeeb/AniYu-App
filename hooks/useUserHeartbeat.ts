import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { auth, db } from '../config/firebaseConfig';

const HEARTBEAT_CACHE_KEY = 'last_heartbeat_timestamp';
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000; // 12 hours

export const useUserHeartbeat = () => {
  useEffect(() => {
    const updateHeartbeat = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // ✅ COST SAVER: Check local storage first
        const lastHeartbeat = await AsyncStorage.getItem(HEARTBEAT_CACHE_KEY);
        const now = Date.now();

        if (!lastHeartbeat || now - parseInt(lastHeartbeat) > TWELVE_HOURS_MS) {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              lastActiveAt: serverTimestamp(),
              isOnline: true
            });
            
            await AsyncStorage.setItem(HEARTBEAT_CACHE_KEY, now.toString());
            console.log("💓 Heartbeat sent (Throttled to 12 hrs)");
        }
      } catch (error) {
        console.log("Heartbeat error", error);
      }
    };

    updateHeartbeat();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        updateHeartbeat();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
};