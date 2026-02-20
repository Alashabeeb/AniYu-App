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

      // ✅ COST SAVER 5: Limit heavily ensures your database reads stay cheap
      const qPersonal = query(
          collection(db, 'users', currentUser.uid, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(30) 
      );
      const unsubPersonal = onSnapshot(qPersonal, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isGlobal: false }));
          setSocialNotifs(data);
      });

      const qGlobal = query(
          collection(db, 'announcements'),
          orderBy('createdAt', 'desc'),
          limit(20) 
      );
      const unsubGlobal = onSnapshot(qGlobal, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data(), 
              isGlobal: true, 
              read: true 
          }));
          setGlobalNotifs(data);
      });

      return () => {
          unsubPersonal();
          unsubGlobal();
      };
  }, []);

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

  const combinedNotifications = [...socialNotifs, ...globalNotifs, ...localNotifs].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.date || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.date || 0);
      return timeB - timeA;
  });

  const getIcon = (type: string) => {
      switch(type) {
          case 'like': return { name: 'heart', color: '#FF6B6B' };
          case 'comment': return { name: 'chatbubble', color: '#4ECDC4' };
          case 'repost': return { name: 'repeat', color: '#45B7D1' };
          case 'follow': return { name: 'person-add', color: '#FFD700' };
          
          case 'anime_release': return { name: 'play-circle', color: '#8b5cf6' }; 
          case 'manga_release': return { name: 'book', color: '#ec4899' }; 
          case 'system_broadcast': return { name: 'megaphone', color: '#FF9F1C' }; 
          
          case 'system': return { name: 'megaphone', color: '#FF9F1C' };
          case 'error': return { name: 'warning', color: '#EF4444' };
          case 'success': return { name: 'checkmark-circle', color: '#10B981' };
          
          default: return { name: 'notifications', color: theme.tint };
      }
  };

  const handlePress = async (item: any) => {
      if (!currentUser) return;

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

      if (item.targetId) {
          if (item.type === 'like' || item.type === 'comment' || item.type === 'repost') {
             router.push({ pathname: '/post-details', params: { postId: item.targetId } });
          } 
          else if (item.type === 'anime_release' || item.type === 'anime') {
             router.push({ pathname: '/anime/[id]', params: { id: item.targetId } });
          } 
          else if (item.type === 'manga_release' || item.type === 'manga') {
             router.push({ pathname: '/manga/[id]', params: { id: item.targetId } });
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
            <Ionicons name="notifications-off-outline" size={64} color={theme.subText} />
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
                  { backgroundColor: theme.card, borderLeftColor: item.read ? 'transparent' : iconData.color }
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: `${iconData.color}20` }]}>
                    <Ionicons name={iconData.name as any} size={24} color={iconData.color} />
                </View>
                <View style={styles.info}>
                  <Text style={[styles.title, { color: theme.text, fontWeight: item.read ? 'normal' : '800' }]}>
                      {item.title}
                  </Text>
                  <Text style={[styles.body, { color: theme.subText }]} numberOfLines={3}>
                      {item.body}
                  </Text>
                  <Text style={[styles.date, { color: theme.subText }]}>
                    {item.createdAt?.seconds 
                        ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() 
                        : (item.date ? new Date(item.date).toLocaleDateString() : '')}
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
  emptyText: { marginTop: 10, fontSize: 16 },
  
  card: { flexDirection: 'row', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, alignItems: 'center', elevation: 1 },
  iconBox: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  info: { flex: 1 },
  title: { fontSize: 16, marginBottom: 4 },
  body: { fontSize: 14, marginBottom: 6, lineHeight: 20 },
  date: { fontSize: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10 }
});