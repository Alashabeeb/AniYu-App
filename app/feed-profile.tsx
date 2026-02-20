import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    DocumentSnapshot,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    startAfter,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../components/PostCard';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { sendSocialNotification } from '../services/notificationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const REPORT_REASONS = [
    "Pretending to be someone else",
    "Fake account",
    "Inappropriate profile info",
    "Harassment or bullying",
    "Spam",
    "Other"
];

export default function FeedProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { userId } = useLocalSearchParams(); 
  const currentUser = auth.currentUser;

  const targetUserId = (userId as string) || currentUser?.uid; 
  const isOwnProfile = targetUserId === currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  
  // ✅ DATA STATE
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<any[]>([]);

  // ✅ PAGINATION STATE (Track last visible doc for each tab)
  const [lastPost, setLastPost] = useState<DocumentSnapshot | null>(null);
  const [lastRepost, setLastRepost] = useState<DocumentSnapshot | null>(null);
  const [lastLike, setLastLike] = useState<DocumentSnapshot | null>(null);
  
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreReposts, setHasMoreReposts] = useState(true);
  const [hasMoreLikes, setHasMoreLikes] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);

  const [activeTab, setActiveTab] = useState('Posts'); 
  const flatListRef = useRef<FlatList>(null);
  const [isFollowing, setIsFollowing] = useState(false); 

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!targetUserId) return;

    // 1. Get User Data (Keep Realtime for Follow button status)
    const userRef = doc(db, "users", targetUserId);
    const unsubUser = onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            if (currentUser && data.followers?.includes(currentUser.uid)) {
                setIsFollowing(true);
            }
            setLoading(false);
        } else if (isOwnProfile && currentUser) {
             const newProfile = {
                username: currentUser.email?.split('@')[0] || "user",
                displayName: currentUser.displayName || "New User",
                email: currentUser.email,
                avatar: currentUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime',
                followers: [],
                following: [],
                watchedCount: 0,
                createdAt: new Date(),
                rank: "GENIN" 
            };
            await setDoc(userRef, newProfile);
            setLoading(false);
        }
    });

    // ✅ LOAD INITIAL DATA (Limited to 15)
    loadPosts(true);
    loadReposts(true);
    loadLikes(true);

    return () => { unsubUser(); };
  }, [targetUserId]);

  // --- ⬇️ OPTIMIZED FETCH FUNCTIONS ⬇️ ---

  const loadPosts = async (initial = false) => {
      if (!initial && (loadingMore || !hasMorePosts)) return;
      if (!initial) setLoadingMore(true);

      try {
          let q = query(
              collection(db, 'posts'), 
              where('userId', '==', targetUserId), 
              orderBy('createdAt', 'desc'),
              limit(15)
          );

          if (!initial && lastPost) {
              q = query(q, startAfter(lastPost));
          }

          const snapshot = await getDocs(q);
          const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          if (initial) {
              setMyPosts(newPosts);
          } else {
              // ✅ Deduplicate state to prevent key errors
              setMyPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          setLastPost(snapshot.docs[snapshot.docs.length - 1]);
          if (snapshot.docs.length < 15) setHasMorePosts(false);

      } catch (e) { console.error("Error loading posts", e); }
      finally { setLoadingMore(false); }
  };

  const loadReposts = async (initial = false) => {
      if (!initial && (loadingMore || !hasMoreReposts)) return;
      if (!initial) setLoadingMore(true);

      try {
          let q = query(
              collection(db, 'posts'), 
              where('reposts', 'array-contains', targetUserId), 
              orderBy('createdAt', 'desc'),
              limit(15)
          );

          if (!initial && lastRepost) {
              q = query(q, startAfter(lastRepost));
          }

          const snapshot = await getDocs(q);
          const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          if (initial) {
              setRepostedPosts(newPosts);
          } else {
              // ✅ Deduplicate state
              setRepostedPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          setLastRepost(snapshot.docs[snapshot.docs.length - 1]);
          if (snapshot.docs.length < 15) setHasMoreReposts(false);

      } catch (e) { console.error("Error loading reposts", e); }
      finally { setLoadingMore(false); }
  };

  const loadLikes = async (initial = false) => {
      if (!initial && (loadingMore || !hasMoreLikes)) return;
      if (!initial) setLoadingMore(true);

      try {
          let q = query(
              collection(db, 'posts'), 
              where('likes', 'array-contains', targetUserId), 
              orderBy('createdAt', 'desc'),
              limit(15)
          );

          if (!initial && lastLike) {
              q = query(q, startAfter(lastLike));
          }

          const snapshot = await getDocs(q);
          const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          if (initial) {
              setLikedPosts(newPosts);
          } else {
              // ✅ Deduplicate state
              setLikedPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          setLastLike(snapshot.docs[snapshot.docs.length - 1]);
          if (snapshot.docs.length < 15) setHasMoreLikes(false);

      } catch (e) { console.error("Error loading likes", e); }
      finally { setLoadingMore(false); }
  };

  const sortedMyPosts = useMemo(() => {
      return [...myPosts].sort((a, b) => {
          return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      });
  }, [myPosts]);

  const handleFollow = async () => {
      if (!currentUser || isOwnProfile || !targetUserId) return;
      const myRef = doc(db, "users", currentUser.uid);
      const targetRef = doc(db, "users", targetUserId);

      if (isFollowing) {
          await setDoc(myRef, { following: arrayRemove(targetUserId) }, { merge: true });
          await setDoc(targetRef, { followers: arrayRemove(currentUser.uid) }, { merge: true });
      } else {
          await setDoc(myRef, { following: arrayUnion(targetUserId) }, { merge: true });
          await setDoc(targetRef, { followers: arrayUnion(currentUser.uid) }, { merge: true });

          sendSocialNotification(
            targetUserId, 
            'follow', 
            { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }
          );
      }
  };

  const handleBlockUser = async () => {
      if (!currentUser || isOwnProfile || !targetUserId) return;
      setMenuVisible(false);
      Alert.alert("Block User", "Are you sure you want to block this user?", [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Block", 
              style: "destructive",
              onPress: async () => {
                  try {
                      const myRef = doc(db, 'users', currentUser.uid);
                      await updateDoc(myRef, {
                          blockedUsers: arrayUnion(targetUserId)
                      });
                      Alert.alert("Blocked", "User blocked successfully.");
                      router.back(); 
                  } catch (e) {
                      Alert.alert("Error", "Could not block user.");
                  }
              }
          }
      ]);
  };

  const submitReportUser = async (reason: string) => {
    if (!currentUser || !targetUserId) return;
    setReportLoading(true);
    try {
      await addDoc(collection(db, 'reports'), { type: 'user', targetId: targetUserId, targetName: userData?.username || 'Unknown', reportedBy: currentUser.uid, reason, createdAt: serverTimestamp(), status: 'pending' });
      Alert.alert("Report Submitted", "We will review this profile.");
      setReportModalVisible(false);
    } catch { Alert.alert("Error", "Could not submit."); } finally { setReportLoading(false); }
  };

  const handleTabPress = (tab: string, index: number) => {
      setActiveTab(tab);
      flatListRef.current?.scrollToOffset({ offset: index * SCREEN_WIDTH, animated: true });
  };

  const handleMomentumScrollEnd = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      if (index === 0) setActiveTab('Posts');
      else if (index === 1) setActiveTab('Reposts');
      else if (index === 2) setActiveTab('Likes');
  };

  // ✅ UPDATED LIST RENDERER WITH PAGINATION AND UNIQUE KEYS
  const renderList = (data: any[], emptyMsg: string, loadMoreFunc: () => void) => (
      <FlatList
          data={data}
          // Fix 1: Combine ID with Index to guarantee 100% unique keys
          keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
          contentContainerStyle={{ paddingBottom: 50, width: SCREEN_WIDTH }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <PostCard post={item} />}
          
          // Pagination Props
          onEndReached={loadMoreFunc}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={theme.tint} style={{marginVertical: 10}} /> : null}

          ListEmptyComponent={
              <View style={{ marginTop: 50, alignItems: 'center', width: SCREEN_WIDTH }}>
                  <Text style={{ color: theme.subText }}>{emptyMsg}</Text>
              </View>
          }
      />
  );

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={theme.tint} /></View>;

  const followingCount = userData?.following?.length || 0;
  const followersCount = userData?.followers?.length || 0;
  const userRank = userData?.rank || "GENIN"; 

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: 'white' }]}>{userData?.displayName || "User"}</Text>
        
        {!isOwnProfile && (
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={[styles.backBtn, { marginLeft: 'auto', backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <Ionicons name="ellipsis-horizontal" size={24} color="white" />
            </TouchableOpacity>
        )}
      </View>

      <View>
          {userData?.banner ? (
              <Image source={{ uri: userData.banner }} style={styles.banner} contentFit="cover" />
          ) : (
              <View style={[styles.banner, { backgroundColor: '#333' }]} />
          )}

          <View style={styles.profileInfo}>
              <View>
                  <Image source={{ uri: userData?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime' }} style={[styles.avatar, { borderColor: theme.background }]} />
                  <View style={[styles.rankBadge, { borderColor: theme.background, backgroundColor: '#FFD700' }]}>
                        <Text style={styles.rankText}>{userRank}</Text>
                  </View>
              </View>
              
              {isOwnProfile ? (
                  <TouchableOpacity style={[styles.editBtn, { borderColor: theme.border }]} onPress={() => router.push('/edit-profile')}>
                      <Text style={{ color: theme.text, fontWeight: 'bold' }}>Edit Profile</Text>
                  </TouchableOpacity>
              ) : (
                  <TouchableOpacity style={[styles.editBtn, { backgroundColor: isFollowing ? 'transparent' : theme.tint, borderColor: isFollowing ? theme.border : theme.tint, borderWidth: 1 }]} onPress={handleFollow}>
                      <Text style={{ color: isFollowing ? theme.text : 'white', fontWeight: 'bold' }}>{isFollowing ? "Following" : "Follow"}</Text>
                  </TouchableOpacity>
              )}
          </View>

          <View style={styles.nameSection}>
              <Text style={[styles.displayName, { color: theme.text }]}>{userData?.displayName || "Anonymous"}</Text>
              <Text style={[styles.username, { color: theme.subText }]}>@{userData?.username || "username"}</Text>
          </View>

          <View style={styles.statsRow}>
              <TouchableOpacity onPress={() => router.push({ pathname: '/user-list', params: { type: 'following', userId: targetUserId } })}>
                  <Text style={[styles.statNum, { color: theme.text }]}>{followingCount} <Text style={[styles.statLabel, { color: theme.subText }]}>Following</Text></Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push({ pathname: '/user-list', params: { type: 'followers', userId: targetUserId } })} style={{ marginLeft: 20 }}>
                  <Text style={[styles.statNum, { color: theme.text }]}>{followersCount} <Text style={[styles.statLabel, { color: theme.subText }]}>Followers</Text></Text>
              </TouchableOpacity>
          </View>

          <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => handleTabPress('Posts', 0)} style={[styles.tab, activeTab === 'Posts' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Posts' ? theme.text : theme.subText }]}>Posts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTabPress('Reposts', 1)} style={[styles.tab, activeTab === 'Reposts' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Reposts' ? theme.text : theme.subText }]}>Reposts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTabPress('Likes', 2)} style={[styles.tab, activeTab === 'Likes' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Likes' ? theme.text : theme.subText }]}>Likes</Text>
              </TouchableOpacity>
          </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={[1, 2, 3]} 
        keyExtractor={item => item.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({ index }) => {
            if (index === 0) return renderList(sortedMyPosts, "No posts yet.", () => loadPosts(false));
            if (index === 1) return renderList(repostedPosts, "No reposts yet.", () => loadReposts(false));
            if (index === 2) return renderList(likedPosts, "No liked posts yet.", () => loadLikes(false));
            return null;
        }}
      />

       <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setReportModalVisible(true); }}>
                        <Ionicons name="flag-outline" size={20} color="red" />
                        <Text style={[styles.menuText, { color: 'red' }]}>Report Profile</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                         <Ionicons name="ban-outline" size={20} color="#FF6B6B" />
                         <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Block User</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                         <Ionicons name="close" size={20} color={theme.text} />
                         <Text style={[styles.menuText, { color: theme.text }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={[styles.reportContainer, { backgroundColor: theme.background }]}>
                <Text style={[styles.reportTitle, { color: theme.text }]}>Report User</Text>
                <Text style={{ color: theme.subText, marginBottom: 15, textAlign: 'center' }}>Why?</Text>
                {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity key={reason} style={[styles.reasonBtn, { borderColor: theme.border }]} onPress={() => submitReportUser(reason)} disabled={reportLoading}>
                        <Text style={{ color: theme.text }}>{reason}</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.subText} />
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={{ marginTop: 10, padding: 10 }} onPress={() => setReportModalVisible(false)}>
                    <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, position: 'absolute', top: 30, left: 0, zIndex: 10, width: '100%' },
  backBtn: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 5, marginRight: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', textShadowColor: 'black', textShadowRadius: 5, marginLeft: 10 },
  banner: { height: 120, backgroundColor: '#333' },
  profileInfo: { paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -35 },
  avatar: { width: 70, height: 70, borderRadius: 35, borderWidth: 3 },
  rankBadge: { position: 'absolute', bottom: 0, right: -5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 2, zIndex: 5 },
  rankText: { fontSize: 9, fontWeight: 'bold', color: 'black' },
  editBtn: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 5 },
  nameSection: { paddingHorizontal: 15, marginTop: 5 },
  displayName: { fontSize: 20, fontWeight: 'bold' },
  username: { fontSize: 14 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 15, marginTop: 15, marginBottom: 15 },
  statNum: { fontWeight: 'bold', fontSize: 15 },
  statLabel: { fontWeight: 'normal', fontSize: 14 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 250, borderRadius: 12, padding: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
  reportContainer: { width: '90%', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 10 },
  reportTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  reasonBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 15, borderBottomWidth: 0.5 }
});