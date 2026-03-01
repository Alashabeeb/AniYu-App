import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
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
import { AppNotification, getNotifications, markAllAsRead, markLocalNotificationAsRead } from '../services/notificationService';

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;

  const [localNotifs, setLocalNotifs] = useState<AppNotification[]>([]);
  const [socialNotifs, setSocialNotifs] = useState<any[]>([]);
  const [globalNotifs, setGlobalNotifs] = useState<any[]>([]); 
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadLocalData();
    }, [])
  );

  const loadLocalData = async () => {
    const data = await getNotifications();
    setLocalNotifs(data);
  };

  useEffect(() => {
      if (!currentUser) return;

      let unsubPersonal: () => void;
      let unsubGlobal: () => void;

      // 1. Fetch Personal Notifications (Likes, Replies, Direct Admin Messages)
      const qPersonal = query(
          collection(db, 'users', currentUser.uid, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(30) 
      );
      unsubPersonal = onSnapshot(qPersonal, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isGlobal: false }));
          setSocialNotifs(data);
      });

      // 2. Fetch Global Announcements (Broadcasts, New Anime/Manga Releases)
      const qGlobal = query(
          collection(db, 'announcements'),
          orderBy('createdAt', 'desc'),
          limit(20) 
      );
      unsubGlobal = onSnapshot(qGlobal, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data(), 
              isGlobal: true, 
              read: true // Global broadcasts are always marked as read
          }));
          setGlobalNotifs(data);
      });

      return () => {
          if (unsubPersonal) unsubPersonal();
          if (unsubGlobal) unsubGlobal();
      };
  }, [currentUser]);

  const handleRefresh = async () => {
      setRefreshing(true);
      await loadLocalData();
      setRefreshing(false);
  };

  const handleMarkRead = async () => {
      socialNotifs.forEach(async (item) => {
        if (!item.read && !item.isGlobal) {
           await updateDoc(doc(db, 'users', currentUser!.uid, 'notifications', item.id), { read: true });
        }
      });
      await markAllAsRead();
      loadLocalData();
  };

  // Merge all 3 arrays and sort them strictly by Date (Newest first)
  const combinedNotifications = [...socialNotifs, ...globalNotifs, ...localNotifs].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.date || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.date || 0);
      return timeB - timeA;
  });

  const getIcon = (type: string) => {
      switch(type) {
          case 'like': return { name: 'heart', color: '#ef4444' };
          case 'comment': return { name: 'chatbubble-ellipses', color: '#3b82f6' };
          case 'repost': return { name: 'repeat', color: '#10b981' };
          case 'follow': return { name: 'person-add', color: '#f59e0b' };
          
          case 'anime_release': return { name: 'film', color: '#8b5cf6' }; 
          case 'manga_release': return { name: 'book', color: '#ec4899' }; 
          
          case 'system_broadcast': return { name: 'megaphone', color: '#d946ef' }; 
          case 'system': return { name: 'information-circle', color: '#3b82f6' };
          
          case 'error': return { name: 'warning', color: '#ef4444' };
          case 'success': return { name: 'checkmark-circle', color: '#10b981' };
          
          default: return { name: 'notifications', color: theme.tint };
      }
  };

  const handlePress = async (item: any) => {
      if (!currentUser) return;

      // 1. Mark as read
      if (!item.read && !item.isGlobal) {
          try {
              if (item.createdAt) {
                  await updateDoc(doc(db, 'users', currentUser.uid, 'notifications', item.id), { read: true });
              } else {
                  await markLocalNotificationAsRead(item.id);
                  loadLocalData();
              }
          } catch (e) {
              console.log("Error marking read:", e);
          }
      }

      // 2. Route to the correct screen
      if (item.type === 'anime_release' && item.targetId) {
          router.push({ pathname: '/anime/[id]', params: { id: item.targetId } });
      } 
      else if (item.type === 'manga_release' && item.targetId) {
          router.push({ pathname: '/manga/[id]', params: { id: item.targetId } });
      }
      else if (item.targetId) {
          if (item.type === 'like' || item.type === 'comment' || item.type === 'repost') {
             router.push({ pathname: '/post-details', params: { postId: item.targetId } });
          } 
      }
      else if (item.actorId && item.type === 'follow') {
          router.push({ pathname: '/feed-profile', params: { userId: item.actorId } });
      }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
        
        <TouchableOpacity onPress={handleMarkRead} style={{ marginLeft: 'auto', padding: 5 }}>
            <Ionicons name="checkmark-done-outline" size={26} color={theme.tint} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={combinedNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.tint} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.subText} style={{ opacity: 0.5 }} />
            <Text style={[styles.emptyText, { color: theme.subText }]}>No notifications yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
            const iconData = getIcon(item.type);
            return (
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => handlePress(item)}
                style={[
                  styles.card, 
                  { 
                      backgroundColor: theme.card, 
                      borderLeftColor: item.read ? 'transparent' : iconData.color,
                      opacity: item.read ? 0.8 : 1
                  }
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: `${iconData.color}15` }]}>
                    <Ionicons name={iconData.name as any} size={22} color={iconData.color} />
                </View>
                <View style={styles.info}>
                  <Text style={[styles.title, { color: theme.text, fontWeight: item.read ? '600' : '800' }]}>
                      {item.title}
                  </Text>
                  <Text style={[styles.body, { color: theme.subText }]} numberOfLines={3}>
                      {item.body}
                  </Text>
                  <Text style={[styles.date, { color: theme.subText, marginTop: 4 }]}>
                    {item.createdAt?.seconds 
                        ? new Date(item.createdAt.seconds * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) 
                        : (item.date ? new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : '')}
                  </Text>
                </View>
                {!item.read && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
              </TouchableOpacity>
            );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 10, fontSize: 16, fontWeight: '600' },
  
  card: { flexDirection: 'row', padding: 15, borderRadius: 16, marginBottom: 10, borderLeftWidth: 4, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 3 },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  info: { flex: 1 },
  title: { fontSize: 15, marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 18 },
  date: { fontSize: 11, fontWeight: '500' },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 10, marginTop: 2 }
});