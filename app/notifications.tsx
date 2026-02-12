import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  collection,
  doc,
  DocumentSnapshot,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { getNotifications, markAllAsRead } from '../services/notificationService'; // Local ones

const CACHE_KEY = 'user_notifications_cache';

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = auth.currentUser;

  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // ✅ PAGINATION STATE
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  // 1. Load from Cache + Fresh Fetch
  const loadInitialData = async () => {
    if (!user) return;
    setLoading(true);

    // A. Show Cached Data First (Instant & Free)
    try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setNotifications(JSON.parse(cached));
    } catch (e) { console.log("Cache error", e); }

    // B. Fetch Fresh Data (Cost: 15 Reads)
    await fetchNotifications(true);
    setLoading(false);
  };

  const fetchNotifications = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) {
        setRefreshing(true);
        setHasMore(true);
    }

    try {
        // 1. Get Local System Notifications (Free)
        const localNotifs = await getNotifications();

        // 2. Get Social Notifications (Firestore - Cost: 15 Reads)
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(15) // ✅ LIMIT 15
        );
        
        const snapshot = await getDocs(q);
        const socialNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isSocial: true }));

        // 3. Merge & Sort
        // ✅ FIX: Added ': any' to a and b to fix the red underline
        const allNotifs = [...localNotifs, ...socialNotifs].sort((a: any, b: any) => {
            const dateA = a.createdAt ? a.createdAt.toMillis() : a.date;
            const dateB = b.createdAt ? b.createdAt.toMillis() : b.date;
            return dateB - dateA;
        });

        setNotifications(allNotifs);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        
        // Save to Cache
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(allNotifs));

    } catch (error) {
        console.error("Error fetching notifications:", error);
    } finally {
        setRefreshing(false);
    }
  };

  // ✅ LOAD MORE (Pagination)
  const loadMore = async () => {
    if (loadingMore || !hasMore || !lastVisible || !user) return;
    setLoadingMore(true);

    try {
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisible),
            limit(15) // ✅ Load NEXT 15
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            setHasMore(false);
        } else {
            const moreNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isSocial: true }));
            setNotifications(prev => [...prev, ...moreNotifs]);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        }
    } catch (error) {
        console.log("Load more error:", error);
    } finally {
        setLoadingMore(false);
    }
  };

  // ✅ MARK SINGLE AS READ
  const handleMarkAsRead = async (item: any) => {
      // 1. Update UI Immediately (Optimistic)
      const updated = notifications.map(n => n.id === item.id ? { ...n, read: true } : n);
      setNotifications(updated);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated)); // Update Cache

      // 2. Update Backend
      if (item.isSocial && user) {
          try {
              const ref = doc(db, 'users', user.uid, 'notifications', item.id);
              await updateDoc(ref, { read: true });
          } catch (e) { console.error(e); }
      }
  };

  // ✅ MARK ALL AS READ (Batch Write - Cheaper)
  const handleMarkAllRead = async () => {
      if (!user) return;
      
      // 1. UI Update
      const updated = notifications.map(n => ({ ...n, read: true }));
      setNotifications(updated);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));

      // 2. Local Service Update
      await markAllAsRead();

      // 3. Firestore Batch Update (Only unread ones to save writes)
      try {
          const batch = writeBatch(db);
          let count = 0;
          
          notifications.forEach(n => {
              if (n.isSocial && !n.read && count < 450) { // Batch limit is 500
                  const ref = doc(db, 'users', user.uid, 'notifications', n.id);
                  batch.update(ref, { read: true });
                  count++;
              }
          });
          
          if (count > 0) await batch.commit();
      } catch (e) { console.error("Batch update failed", e); }
  };

  const handlePress = (item: any) => {
      handleMarkAsRead(item);
      if (item.type === 'anime') router.push(`/anime/${item.targetId || ''}`);
      if (item.type === 'manga') router.push(`/manga/${item.targetId || ''}`);
      if (item.type === 'follow') router.push({ pathname: '/feed-profile', params: { userId: item.actorId } });
      if (item.type === 'like' || item.type === 'comment' || item.type === 'repost') {
          // Navigate to post details (assuming you have a post-details route)
           router.push({ pathname: '/post-details', params: { postId: item.targetId } });
      }
  };

  const renderItem = ({ item }: { item: any }) => (
      <TouchableOpacity 
        style={[styles.item, { backgroundColor: item.read ? theme.background : theme.card, borderColor: theme.border }]}
        onPress={() => handlePress(item)}
      >
          <View style={[styles.iconBox, { backgroundColor: item.read ? 'transparent' : theme.tint }]}>
              <Ionicons 
                name={item.type === 'like' ? 'heart' : item.type === 'comment' ? 'chatbubble' : 'notifications'} 
                size={20} 
                color={item.read ? theme.subText : 'white'} 
              />
          </View>
          <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text, fontWeight: item.read ? 'normal' : 'bold' }]}>{item.title}</Text>
              <Text style={[styles.body, { color: theme.subText }]}>{item.body}</Text>
              <Text style={[styles.date, { color: theme.subText }]}>
                  {new Date(item.createdAt ? item.createdAt.toMillis() : item.date).toLocaleDateString()}
              </Text>
          </View>
          {!item.read && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
      </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={{ color: theme.tint, fontWeight: '600' }}>Read All</Text>
          </TouchableOpacity>
      </View>

      <FlatList 
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotifications(true)} tintColor={theme.tint} />}
          
          // ✅ PAGINATION PROPS
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.tint} style={{ margin: 15 }} /> : null}
          
          ListEmptyComponent={
              !loading ? (
                  <View style={{ marginTop: 50, alignItems: 'center' }}>
                      <Text style={{ color: theme.subText }}>No notifications yet.</Text>
                  </View>
              ) : null
          }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  item: { flexDirection: 'row', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  title: { fontSize: 16, marginBottom: 4 },
  body: { fontSize: 14, marginBottom: 4 },
  date: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10 }
});