import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
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
            
            // ✅ SURGICAL UPDATE: Fetch IP Address AND Location (City/Country)
            let ipAddress = 'Unknown';
            let userLocation = 'Unknown Location';
            
            try {
                // Free GeoIP API (No keys or rate limits)
                const geoResponse = await fetch('https://get.geojs.io/v1/ip/geo.json');
                const geoData = await geoResponse.json();
                ipAddress = geoData.ip || 'Unknown';
                
                if (geoData.city && geoData.country) {
                    userLocation = `${geoData.city}, ${geoData.country}`;
                } else if (geoData.country) {
                    userLocation = geoData.country;
                }
            } catch (e) {
                console.log("Could not fetch location data", e);
            }

            // Gather exact Device & App Info
            const deviceInfo = {
                deviceName: Device.deviceName || 'Unknown Device',
                osName: Device.osName || Platform.OS,
                osVersion: Device.osVersion || String(Platform.Version),
                appVersion: Application.nativeApplicationVersion || 'Unknown',
                buildVersion: Application.nativeBuildVersion || 'Unknown',
                ipAddress: ipAddress,
                location: userLocation // <-- ✅ ADDED TO PAYLOAD
            };

            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              lastActiveAt: serverTimestamp(),
              isOnline: true,
              deviceInfo: deviceInfo // Saving to Firestore
            });
            
            await AsyncStorage.setItem(HEARTBEAT_CACHE_KEY, now.toString());
            console.log("💓 Heartbeat sent with Device & Location Info");
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