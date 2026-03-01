import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

const NOTIFICATIONS_KEY = 'user_notifications';
const PREFERENCE_KEY = 'notifications_enabled';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: any; 
  read: boolean;
  type: 'anime' | 'manga' | 'system' | 'like' | 'comment' | 'repost' | 'follow';
  targetId?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
}

// ✅ HELPER: EXPO PUSH API FOR SOCIAL FEATURES
const sendPushNotification = async (expoPushToken: string, title: string, body: string) => {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
};

// 1. Get Notification History
export const getNotifications = async (): Promise<AppNotification[]> => {
  try {
    const json = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    return [];
  }
};

// 2. Add a New "Drop" (Local System Notification)
export const addNewDropNotification = async (title: string, body: string, type: 'anime' | 'manga' = 'anime') => {
  try {
    const current = await getNotifications();
    const newNotif: AppNotification = {
      id: Date.now().toString(),
      title,
      body,
      date: Date.now(),
      read: false,
      type
    };
    const updated = [newNotif, ...current].slice(0, 50); 
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));

    const isEnabled = await getNotificationPreference();
    if (isEnabled) {
      console.log(`[Notification Alert] ${title}: ${body}`);
    }

    return updated;
  } catch (error) {
    console.error("Error adding notification:", error);
    return [];
  }
};

// 3. Send Social Notification (To Firestore & Push to Device) - ✅ UPGRADED
export const sendSocialNotification = async (
    targetUserId: string, 
    type: 'like' | 'comment' | 'repost' | 'follow', 
    actor: { uid: string, name: string, avatar: string }, 
    contentSnippet?: string,
    targetId?: string
) => {
    // Prevent sending a notification to yourself
    if (targetUserId === actor.uid) return; 

    try {
        let title = "New Interaction";
        let body = "Someone interacted with you.";

        switch(type) {
            case 'like': 
                title = "New Like";
                body = `${actor.name} liked your post.`;
                break;
            case 'comment':
                title = "New Comment";
                body = `${actor.name} commented: "${contentSnippet || '...'}"`;
                break;
            case 'repost':
                title = "New Repost";
                body = `${actor.name} reposted your post.`;
                break;
            case 'follow':
                title = "New Follower";
                body = `${actor.name} started following you.`;
                break;
        }

        // A. Write to the Target User's Firestore Feed
        await addDoc(collection(db, 'users', targetUserId, 'notifications'), {
            title,
            body,
            type,
            actorId: actor.uid,
            actorName: actor.name,
            actorAvatar: actor.avatar,
            targetId: targetId || null,
            read: false,
            createdAt: serverTimestamp()
        });

        // B. 🚀 NEW: Fetch Target User's Push Token and Send Physical Push
        const targetUserSnap = await getDoc(doc(db, 'users', targetUserId));
        if (targetUserSnap.exists()) {
            const targetUserData = targetUserSnap.data();
            if (targetUserData.expoPushToken) {
                await sendPushNotification(targetUserData.expoPushToken, title, body);
            }
        }

    } catch (error) {
        console.error("Error sending social notification:", error);
    }
};

// 4. Mark all as read
export const markAllAsRead = async () => {
    const current = await getNotifications();
    const updated = current.map(n => ({ ...n, read: true }));
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    return updated;
};

// 5. Mark Single Local Notification as Read
export const markLocalNotificationAsRead = async (id: string) => {
    const current = await getNotifications();
    const updated = current.map(n => n.id === id ? { ...n, read: true } : n);
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
    return updated;
};

// 6. Get Unread Local Count
export const getUnreadLocalCount = async () => {
    const current = await getNotifications();
    return current.filter(n => !n.read).length;
};

// 7. Settings: Get Preference
export const getNotificationPreference = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem(PREFERENCE_KEY);
    return val !== null ? JSON.parse(val) : true; 
  } catch {
    return true;
  }
};

// 8. Settings: Save Preference
export const setNotificationPreference = async (enabled: boolean) => {
  await AsyncStorage.setItem(PREFERENCE_KEY, JSON.stringify(enabled));
};