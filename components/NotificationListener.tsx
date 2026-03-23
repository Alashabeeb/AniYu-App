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

  // ✅ BUG 7 FIX: Ref to store previous role and prevent spam toasts
  const previousRoleRef = useRef<string | null>(null);

  // ==========================================
  // 1. WATCH ACCOUNT STATUS (Ban/Unban)
  // ==========================================
  useEffect(() => {
    if (!user) return;

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
  }, [user]);

  // ==========================================
  // 2. WATCH NOTIFICATIONS (Social & Admin DMs)
  // ==========================================
  // This listens to the subcollection where your Admin Panel writes to.
  useEffect(() => {
    if (!user) return;

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
  }, [user]);

  // ==========================================
  // 3. WATCH NEW CONTENT (Anime Uploads)
  // ==========================================
  useEffect(() => {
    // ✅ BUG 5 FIX: Added auth guard so guests do not open persistent Firestore connections
    if (!user) return;

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
  }, [user]); // ✅ BUG 5 FIX: Added 'user' to the dependency array

  return null; // Invisible Component
}