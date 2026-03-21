import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { auth, db } from '../config/firebaseConfig';

interface AuthProps {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthProps>({ user: null, loading: true });

// 🔐 SECURITY: Session expiry constants
const SESSION_KEY = 'aniyu_session_start';
const MAX_SESSION_DAYS = 30;

// --- HELPER: GET PUSH TOKEN ---
async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      if (projectId) {
          token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } else {
          token = (await Notifications.getExpoPushTokenAsync()).data;
      }
    } catch (e) {
        console.error("Error fetching push token:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications (Simulators do not support it)');
  }

  return token;
}

export const AuthProvider = ({ children }: any) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userUnsub: () => void; 

    // Notice this is NO LONGER an async function blocking the main thread
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (userUnsub) userUnsub();

      if (currentUser) {
        // ✅ BUG FIX 1: Set the user instantly so the router doesn't flash the Login screen!
        setUser(currentUser as any);
        
        const userRef = doc(db, 'users', currentUser.uid);

        // 🔐 SECURITY: Session expiry check — runs in background, won't block UI
        (async () => {
            try {
                const sessionStart = await AsyncStorage.getItem(SESSION_KEY);
                if (!sessionStart) {
                    // First login — store session start timestamp
                    await AsyncStorage.setItem(SESSION_KEY, Date.now().toString());
                } else {
                    const elapsed = Date.now() - parseInt(sessionStart, 10);
                    const elapsedDays = elapsed / (1000 * 60 * 60 * 24);
                    if (elapsedDays > MAX_SESSION_DAYS) {
                        // Session expired — force sign out
                        await AsyncStorage.removeItem(SESSION_KEY);
                        await updateDoc(userRef, { isOnline: false, lastActiveAt: serverTimestamp() });
                        await signOut(auth);
                        return;
                    }
                }
            } catch (e) {
                console.warn("Session check failed:", e);
            }
        })();
        
        // ✅ BUG FIX 2: Run the heavy IP/Push Token fetching in the background asynchronously
        (async () => {
            try {
                let ipAddress = "Unknown IP";
                try {
                    // 🔐 SECURITY: 5s timeout on IP fetch
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
                    clearTimeout(timeoutId);
                    const ipData = await ipResponse.json();
                    ipAddress = ipData.ip;
                } catch (e) {
                    console.warn("Could not fetch IP Address");
                }

                const deviceModel = Device.modelName || Device.deviceName || 'Unknown Device';
                const osVersion = `${Device.osName || Platform.OS} ${Device.osVersion || ''}`.trim();
                const appVersion = Application.nativeApplicationVersion || '1.0.0';

                const pushToken = await registerForPushNotificationsAsync();

                const updateData: any = {
                    isOnline: true,
                    lastActiveAt: serverTimestamp(),
                    deviceModel: deviceModel,
                    osVersion: osVersion,
                    appVersion: appVersion,
                    ipAddress: ipAddress
                };

                if (pushToken) {
                    updateData.expoPushToken = pushToken;
                }

                await updateDoc(userRef, updateData);
            } catch (error) {
                console.error("Failed to update user device tracking:", error);
            }
        })();

        // REAL-TIME LISTENER FOR BANS & LIVE PROFILE UPDATES
        userUnsub = onSnapshot(userRef, async (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                
                // Merge Firebase Auth data with Firestore Profile data
                setUser({ ...currentUser, ...userData } as any);
                
                if (userData.isBanned) {
                    const banExpiresAt = userData.banExpiresAt?.toDate();
                    const now = new Date();

                    if (banExpiresAt && now < banExpiresAt) {
                        const timeLeft = Math.ceil((banExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)); 
                        Alert.alert(
                            "Account Banned", 
                            `You are temporarily banned.\n\nExpires in: ~${timeLeft} hours`,
                            [{ text: "OK", onPress: () => signOut(auth) }]
                        );
                        
                        await updateDoc(userRef, { isOnline: false, lastActiveAt: serverTimestamp() });
                        await signOut(auth);
                        setUser(null);
                    } else {
                        await updateDoc(userRef, { isBanned: false, banExpiresAt: null });
                    }
                }
            }
        });
      } else {
        // User is fully logged out
        // 🔐 SECURITY: Clear session timestamp on logout
        AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
        setUser(null);
      }
      
      // ✅ BUG FIX 3: End loading state immediately so Splash Screen can hide smoothly
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userUnsub) userUnsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {/* ✅ BUG FIX 4: Render children unconditionally so the Splash Screen controller in _layout actually mounts! */}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);