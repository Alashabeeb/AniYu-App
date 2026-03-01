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
    
    // If no permission, ask the user!
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      // Required for EAS builds (Production)
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      if (projectId) {
          token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } else {
          // Fallback for local Expo Go testing
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

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (userUnsub) userUnsub();

      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        
        try {
            // 1. Fetch IP Address
            let ipAddress = "Unknown IP";
            try {
                const ipResponse = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipResponse.json();
                ipAddress = ipData.ip;
            } catch (e) {
                console.warn("Could not fetch IP Address");
            }

            // 2. Get Device & App Info
            const deviceModel = Device.modelName || Device.deviceName || 'Unknown Device';
            const osVersion = `${Device.osName || Platform.OS} ${Device.osVersion || ''}`.trim();
            const appVersion = Application.nativeApplicationVersion || '1.0.0';

            // 3. 🚀 GET PUSH NOTIFICATION TOKEN
            const pushToken = await registerForPushNotificationsAsync();

            // 4. Push fresh tracking data AND Push Token to Firestore
            const updateData: any = {
                isOnline: true,
                lastActiveAt: serverTimestamp(),
                deviceModel: deviceModel,
                osVersion: osVersion,
                appVersion: appVersion,
                ipAddress: ipAddress
            };

            // Only update the token if we successfully generated one
            if (pushToken) {
                updateData.expoPushToken = pushToken;
            }

            await updateDoc(userRef, updateData);
        } catch (error) {
            console.error("Failed to update user device tracking:", error);
        }

        // REAL-TIME LISTENER FOR BANS & UPDATES
        userUnsub = onSnapshot(userRef, async (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
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
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userUnsub) userUnsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);