import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    documentId,
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
    View,
    ViewToken
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
  
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<any[]>([]);

  const [lastPost, setLastPost] = useState<DocumentSnapshot | null>(null);
  const [lastRepost, setLastRepost] = useState<DocumentSnapshot | null>(null);
  const [lastLike, setLastLike] = useState<DocumentSnapshot | null>(null);
  
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreReposts, setHasMoreReposts] = useState(true);
  const [hasMoreLikes, setHasMoreLikes] = useState(true);

  const loadingPostsRef = useRef(false);
  const loadingRepostsRef = useRef(false);
  const loadingLikesRef = useRef(false);

  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreReposts, setLoadingMoreReposts] = useState(false);
  const [loadingMoreLikes, setLoadingMoreLikes] = useState(false);

  const [activeTab, setActiveTab] = useState('Posts'); 
  const [isFollowing, setIsFollowing] = useState(false); 

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [playingPostId, setPlayingPostId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
          setPlayingPostId(viewableItems[0].item.id);
      } else {
          setPlayingPostId(null);
      }
  }).current;

  // Main User Data Fetcher
  useEffect(() => {
    if (!targetUserId) return;

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

    // Only load the default 'Posts' tab unconditionally on mount
    loadPosts(true);

    return () => { unsubUser(); };
  }, [targetUserId]);

  // Lazy load other tabs ONLY when the user clicks them
  useEffect(() => {
      if (activeTab === 'Reposts' && repostedPosts.length === 0 && hasMoreReposts) {
          loadReposts(true);
      }
      if (activeTab === 'Likes' && likedPosts.length === 0 && hasMoreLikes) {
          loadLikes(true);
      }
  }, [activeTab]);

  const loadPosts = async (initial = false) => {
      if (!initial && (loadingPostsRef.current || !hasMorePosts)) return;
      loadingPostsRef.current = true;
      if (!initial) setLoadingMorePosts(true); 

      try {
          // ✅ PERFECT MATCH FOR YOUR NEW INDEX
          let q = query(
              collection(db, 'posts'), 
              where('userId', '==', targetUserId), 
              where('isRepost', '==', false), 
              orderBy('createdAt', 'desc'),
              limit(15)
          );

          if (!initial && lastPost) {
              q = query(q, startAfter(lastPost));
          }

          const snapshot = await getDocs(q);

          const newPosts = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((p: any) => !p.isRepost);

          if (initial) {
              setMyPosts(newPosts);
          } else {
              setMyPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          if (snapshot.docs.length > 0) {
              setLastPost(snapshot.docs[snapshot.docs.length - 1]);
          }
          if (snapshot.docs.length < 15) setHasMorePosts(false);

      } catch (e) { 
          console.error("Error loading posts", e); 
          setHasMorePosts(false);
      } finally { 
          loadingPostsRef.current = false;
          setLoadingMorePosts(false); 
      }
  };

  const loadReposts = async (initial = false) => {
      if (!initial && (loadingRepostsRef.current || !hasMoreReposts)) return;
      loadingRepostsRef.current = true;
      if (!initial) setLoadingMoreReposts(true); 

      try {
          let q = query(
              collection(db, 'posts'), 
              where('repostedByUid', '==', targetUserId), 
              where('isRepost', '==', true),
              orderBy('createdAt', 'desc'),
              limit(15)
          );

          if (!initial && lastRepost) {
              q = query(q, startAfter(lastRepost));
          }

          const snapshot = await getDocs(q);
          
          let newPosts: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const originalIds = [...new Set(newPosts.map(p => p.originalPostId))];
          if (originalIds.length > 0) {
              try {
                  const chunks = [];
                  for (let i = 0; i < originalIds.length; i += 10) {
                      chunks.push(originalIds.slice(i, i + 10));
                  }

                  const snapPromises = chunks.map(chunk => 
                      getDocs(query(collection(db, 'posts'), where(documentId(), 'in', chunk)))
                  );
                  const snapResults = await Promise.all(snapPromises);

                  const origMap = new Map();
                  snapResults.forEach(snap => {
                      snap.docs.forEach(d => origMap.set(d.id, d.data()));
                  });

                  newPosts = newPosts.map(p => {
                      if (p.isRepost) {
                          if (origMap.has(p.originalPostId)) {
                              const master = origMap.get(p.originalPostId);
                              return {
                                  ...p,
                                  likes: master.likes || [],
                                  likeCount: master.likeCount || 0,
                                  reposts: master.reposts || [],
                                  repostCount: master.repostCount || 0,
                                  commentCount: master.commentCount || 0,
                                  views: master.views || 0,
                                  text: master.text || p.text,
                                  mediaUrl: master.mediaUrl || p.mediaUrl
                              };
                          } else {
                              return null; 
                          }
                      }
                      return p;
                  }).filter(Boolean) as any[]; 
              } catch (syncErr) { console.log("Failed to sync profile master posts", syncErr); }
          }

          if (initial) {
              setRepostedPosts(newPosts);
          } else {
              setRepostedPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          if (snapshot.docs.length > 0) {
              setLastRepost(snapshot.docs[snapshot.docs.length - 1]);
          }
          if (snapshot.docs.length < 15) setHasMoreReposts(false);

      } catch (e) { 
          console.error("Error loading reposts", e); 
          setHasMoreReposts(false);
      } finally { 
          loadingRepostsRef.current = false;
          setLoadingMoreReposts(false); 
      }
  };

  const loadLikes = async (initial = false) => {
      if (!initial && (loadingLikesRef.current || !hasMoreLikes)) return;
      loadingLikesRef.current = true;
      if (!initial) setLoadingMoreLikes(true); 

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
              setLikedPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = newPosts.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

          if (snapshot.docs.length > 0) {
              setLastLike(snapshot.docs[snapshot.docs.length - 1]);
          }
          if (snapshot.docs.length < 15) setHasMoreLikes(false);

      } catch (e) { 
          console.error("Error loading likes", e); 
          setHasMoreLikes(false);
      } finally { 
          loadingLikesRef.current = false;
          setLoadingMoreLikes(false); 
      }
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
                  } catch (e) { Alert.alert("Error", "Could not block user."); }
              }
          }
      ]);
  };

  const submitReportUser = async (reason: string) => {
    if (!currentUser || !targetUserId) return;
    setReportLoading(true);
    try {
      await addDoc(collection(db, 'reports'), { 
          type: 'user', 
          targetId: targetUserId, 
          userId: targetUserId, 
          targetName: userData?.username || 'Unknown', 
          reportedBy: currentUser.uid, 
          reason, 
          createdAt: serverTimestamp(), 
          status: 'pending' 
      });
      Alert.alert("Report Submitted", "We will review this profile.");
      setReportModalVisible(false);
    } catch { Alert.alert("Error", "Could not submit."); } finally { setReportLoading(false); }
  };

  const renderList = (data: any[], emptyMsg: string, loadMoreFunc: () => void, tabName: string) => (
      <FlatList
          data={data}
          keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
          contentContainerStyle={{ paddingBottom: 50, width: SCREEN_WIDTH }}
          showsVerticalScrollIndicator={false}
          
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          
          renderItem={({ item }: { item: any }) => (
              <PostCard 
                  post={item as any} 
                  isVisible={playingPostId === item.id && activeTab === tabName} 
                  isProfilePinnedView={tabName === 'Posts'}
                  onDelete={(deletedId) => {
                      if (tabName === 'Posts') setMyPosts(prev => prev.filter(p => p.id !== deletedId));
                      if (tabName === 'Reposts') setRepostedPosts(prev => prev.filter(p => p.id !== deletedId));
                      if (tabName === 'Likes') setLikedPosts(prev => prev.filter(p => p.id !== deletedId));
                  }}
                  onBlock={(blockedId) => {
                      if (tabName === 'Posts') setMyPosts(prev => prev.filter(p => p.userId !== blockedId && p.originalUserId !== blockedId));
                      if (tabName === 'Reposts') setRepostedPosts(prev => prev.filter(p => p.userId !== blockedId && p.originalUserId !== blockedId));
                      if (tabName === 'Likes') setLikedPosts(prev => prev.filter(p => p.userId !== blockedId && p.originalUserId !== blockedId));
                  }}
              />
          )}
          
          onEndReached={loadMoreFunc}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
              (tabName === 'Posts' && loadingMorePosts) || 
              (tabName === 'Reposts' && loadingMoreReposts) || 
              (tabName === 'Likes' && loadingMoreLikes) 
              ? <ActivityIndicator size="small" color={theme.tint} style={{marginVertical: 10}} /> 
              : null
          }

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
              <View style={styles.nameRow}>
                  <Text style={[styles.displayName, { color: theme.text }]}>{userData?.displayName || "Anonymous"}</Text>
                  
                  {userData?.role === 'creator' && (
                      <View style={styles.goldenBadge}>
                          <Text style={styles.goldenBadgeText}>C</Text>
                      </View>
                  )}

                  {userData?.role === 'moderator' && (
                      <View style={styles.goldenBadge}>
                          <Text style={styles.goldenBadgeText}>M</Text>
                      </View>
                  )}
              </View>
              
              <Text style={[styles.username, { color: theme.subText }]}>@{userData?.username || "username"}</Text>
              
              {userData?.bio ? (
                  <Text style={[styles.bio, { color: theme.text }]}>{userData.bio}</Text>
              ) : null}
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
              <TouchableOpacity onPress={() => setActiveTab('Posts')} style={[styles.tab, activeTab === 'Posts' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Posts' ? theme.text : theme.subText }]}>Posts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('Reposts')} style={[styles.tab, activeTab === 'Reposts' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Reposts' ? theme.text : theme.subText }]}>Reposts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('Likes')} style={[styles.tab, activeTab === 'Likes' && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}>
                  <Text style={[styles.tabText, { color: activeTab === 'Likes' ? theme.text : theme.subText }]}>Likes</Text>
              </TouchableOpacity>
          </View>
      </View>

      <View style={{ flex: 1 }}>
          {activeTab === 'Posts' && renderList(sortedMyPosts, "No posts yet.", () => loadPosts(false), 'Posts')}
          {activeTab === 'Reposts' && renderList(repostedPosts, "No reposts yet.", () => loadReposts(false), 'Reposts')}
          {activeTab === 'Likes' && renderList(likedPosts, "No liked posts yet.", () => loadLikes(false), 'Likes')}
      </View>

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
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  displayName: { fontSize: 20, fontWeight: 'bold' },
  goldenBadge: { backgroundColor: '#FFD700', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  goldenBadgeText: { color: '#000', fontSize: 12, fontWeight: '900' },

  username: { fontSize: 14 },
  bio: { marginTop: 8, fontSize: 14, lineHeight: 20 },
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