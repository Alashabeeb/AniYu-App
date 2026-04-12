import { useRouter } from 'expo-router';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function NotificationListener() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  
  // Refs to prevent "Notification Spam" on first load
  // We only want to show toasts for NEW events that happen while the app is open
  const isFirstLoadUser = useRef(true);
  const isFirstLoadSocial = useRef(true);
  const isFirstLoadAnime = useRef(true);
  const isFirstLoadBroadcast = useRef(true); // ✅ Added for Admin Broadcasts

  // ✅ BUG 7 FIX: Ref to store previous role and prevent spam toasts
  const previousRoleRef = useRef<string | null>(null);

  // ==========================================
  // 1. WATCH ACCOUNT STATUS (Ban/Unban)
  // ==========================================
  useEffect(() => {
    if (!user?.uid) return; // ✅ FIXED: Now safely checks UID to ignore heartbeat noise

    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const currentRole = data.role || 'user';

        // Skip the very first sync
        if (isFirstLoadUser.current) {
          isFirstLoadUser.current = false;
          previousRoleRef.current = currentRole; // ✅ BUG 7 FIX: Initialize the role memory
          return;
        }
        
        // Check if "isBanned" became true
        if (data.isBanned === true) {
           showToast('Account Suspended', 'You have been banned. Contact support.', 'error');
           // The GlobalGatekeeper will handle the redirect, but this explains WHY.
        } 
        
        // Optional: Check if role changed (e.g. promoted to Admin)
        // ✅ BUG 7 FIX: Only toast if the role actually changed from the previous state
        if (currentRole !== previousRoleRef.current && currentRole !== 'user') {
            showToast('Role Updated', `You are now a ${currentRole}`, 'info');
        }

        previousRoleRef.current = currentRole; // ✅ BUG 7 FIX: Update the memory
      }
    });

    return () => unsubUser();
  }, [user?.uid]); // ✅ FIXED: Only restarts if the UID changes

  // ==========================================
  // 2. WATCH NOTIFICATIONS (Social & Admin DMs)
  // ==========================================
  // This listens to the subcollection where your Admin Panel writes to.
  useEffect(() => {
    if (!user?.uid) return; // ✅ FIXED

    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubSocial = onSnapshot(q, (snapshot) => {
      if (isFirstLoadSocial.current) {
        isFirstLoadSocial.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notif = change.doc.data();
          
          // Don't toast if I triggered it myself (e.g. I liked my own post)
          if (notif.actorId === user.uid) return;

          let title = 'New Notification';
          let type: 'info' | 'success' | 'warning' | 'error' = 'info';

          // Handle Social Types
          if (notif.type === 'like') { title = '❤️ New Like'; type='success'; }
          if (notif.type === 'comment') { title = '💬 New Comment'; type='info'; }
          if (notif.type === 'repost') { title = '🔁 New Repost'; type='info'; }
          if (notif.type === 'follow') { title = '👤 New Follower'; type='success'; }
          
          // Handle Admin System Messages
          if (notif.type === 'system') { 
              title = notif.title || '📢 System Message'; 
              type = 'warning'; 
          }

          showToast(title, notif.body || 'You have a new interaction.', type);
        }
      });
    });

    return () => unsubSocial();
  }, [user?.uid]); // ✅ FIXED

  // ==========================================
  // 3. WATCH NEW CONTENT (Anime Uploads)
  // ==========================================
  useEffect(() => {
    // ✅ BUG 5 FIX: Added auth guard so guests do not open persistent Firestore connections
    if (!user?.uid) return; // ✅ FIXED

    const q = query(
      collection(db, 'anime'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubContent = onSnapshot(q, (snapshot) => {
      if (isFirstLoadAnime.current) {
        isFirstLoadAnime.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // "New Release: One Piece"
          showToast('🎬 New Release', `${data.title} is now available!`, 'success');
        }
      });
    });

    return () => unsubContent();
  }, [user?.uid]); // ✅ BUG 5 FIX: Safely dependent on user ID now

  // ==========================================
  // 4. WATCH GLOBAL ANNOUNCEMENTS (NEW)
  // ==========================================
  // ✅ BUG FIX: Memory ref to prevent cache-to-server double firing spam
  const lastSeenBroadcastId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return; 

    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubBroadcast = onSnapshot(q, (snapshot) => {
      // 1. If snapshot is totally empty (e.g., empty local cache), ignore it.
      if (snapshot.empty) return;

      const latestDoc = snapshot.docs[0];

      // 2. On the true first load, just memorize the ID and stay silent.
      if (isFirstLoadBroadcast.current) {
        isFirstLoadBroadcast.current = false;
        lastSeenBroadcastId.current = latestDoc.id;
        return;
      }

      // 3. For all future updates, only toast if the ID is genuinely NEW
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          // Compare the new ID against our memory
          if (change.doc.id !== lastSeenBroadcastId.current) {
            const data = change.doc.data();
            showToast('📣 Admin Broadcast', data.title || 'New Announcement', 'warning');
            
            // Update our memory so we don't show this specific one again
            lastSeenBroadcastId.current = change.doc.id; 
          }
        }
      });
    });

    return () => unsubBroadcast();
  }, [user?.uid]); 

  return null; // Invisible Component
}