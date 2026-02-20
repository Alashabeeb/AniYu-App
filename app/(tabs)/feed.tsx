import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
    collection,
    doc,
    DocumentSnapshot,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    startAfter,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ViewToken
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PostCard from '../../components/PostCard';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEED_CACHE_KEY = 'aniyu_feed_cache_v2';
const viewedFeedSession = new Set<string>();

export default function FeedScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;

  const [posts, setPosts] = useState<any[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [interestsLoaded, setInterestsLoaded] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  
  // ✅ DUAL-PAGINATION STATE FOR THE ALGORITHM
  const [globalLastVisible, setGlobalLastVisible] = useState<DocumentSnapshot | null>(null);
  const [interestLastVisible, setInterestLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [playingPostId, setPlayingPostId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('All'); 
  const flatListRef = useRef<FlatList>(null); 

  useEffect(() => {
      const loadCache = async () => {
          try {
              const cachedPosts = await AsyncStorage.getItem(FEED_CACHE_KEY);
              if (cachedPosts) setPosts(JSON.parse(cachedPosts));
          } catch(e) { console.log("Feed cache error", e); }
      };
      loadCache();
      return () => viewedFeedSession.clear();
  }, []);

  // 1. FETCH USER PROFILE FIRST
  useEffect(() => {
      if (!currentUser) return;
      const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
          const data = doc.data();
          setBlockedUsers(data?.blockedUsers || []);
          setUserInterests(data?.interests || data?.favoriteGenres || []);
          setInterestsLoaded(true); // Signal algorithm to start
      });
      return unsub;
  }, [currentUser]);

  // 2. SCORING ALGORITHM (The "For You" Logic)
  const calculatePostScore = (post: any, interests: string[]) => {
      let score = 0;

      // A. Interest Matching (Strongest Signal)
      if (post.tags && Array.isArray(post.tags) && interests.length > 0) {
          const matches = post.tags.filter((tag: string) => interests.includes(tag));
          score += (matches.length * 50); // Heavy weight for relevant content
      }

      // B. Engagement Metrics (Social Proof)
      score += (post.likeCount || 0) * 2;
      score += (post.commentCount || 0) * 3;
      score += (post.repostCount || 0) * 5;

      // C. Time Decay (Freshness Penalty)
      if (post.createdAt?.seconds) {
          const hoursOld = (Date.now() / 1000 - post.createdAt.seconds) / 3600;
          score -= (hoursOld * 1.5); // Lose 1.5 points every hour it ages
      }

      return score;
  };

  // 3. CORE FETCH ENGINE
  const fetchFeedChunk = async (isRefresh = false) => {
      if (!hasMore && !isRefresh) return;
      if (isRefresh) {
          setRefreshing(true);
          setHasMore(true);
      } else {
          setLoadingMore(true);
      }
      
      try {
          // Prepare to fetch up to 10 of the users interests (Firestore limit for array-contains-any)
          const safeInterests = userInterests.slice(0, 10);
          const fetchPromises = [];

          // QUERY 1: Global Fresh Posts (Discovery)
          let globalQ = query(collection(db, 'posts'), where('parentId', '==', null), orderBy('createdAt', 'desc'), limit(10));
          if (!isRefresh && globalLastVisible) {
              globalQ = query(collection(db, 'posts'), where('parentId', '==', null), orderBy('createdAt', 'desc'), startAfter(globalLastVisible), limit(10));
          }
          fetchPromises.push(getDocs(globalQ));

          // QUERY 2: Interest-Specific Posts (Relevance)
          if (safeInterests.length > 0) {
              let intQ = query(collection(db, 'posts'), where('parentId', '==', null), where('tags', 'array-contains-any', safeInterests), orderBy('createdAt', 'desc'), limit(10));
              if (!isRefresh && interestLastVisible) {
                  intQ = query(collection(db, 'posts'), where('parentId', '==', null), where('tags', 'array-contains-any', safeInterests), orderBy('createdAt', 'desc'), startAfter(interestLastVisible), limit(10));
              }
              // 🔥 NOTE: If this fails in the console, Firestore will provide a link to generate a Composite Index. Click it!
              fetchPromises.push(getDocs(intQ).catch(e => {
                  console.warn("Missing Index for personalized feed. Check Firebase console to build it.", e);
                  return { docs: [] }; // Fallback gracefully if index is building
              }));
          }

          const results = await Promise.all(fetchPromises);
          
          const globalSnap = results[0];
          const interestSnap = results[1];

          // Update Pagination Cursors
          if (globalSnap.docs.length > 0) setGlobalLastVisible(globalSnap.docs[globalSnap.docs.length - 1]);
          if (interestSnap && interestSnap.docs?.length > 0) setInterestLastVisible(interestSnap.docs[interestSnap.docs.length - 1]);
          // Stop pagination if both queries run dry
          if (globalSnap.docs.length === 0 && (!interestSnap || interestSnap.docs?.length === 0)) {
                setHasMore(false);
            }

          // Merge & Deduplicate
          const postMap = new Map();
          
          globalSnap.docs.forEach((doc: any) => { postMap.set(doc.id, { id: doc.id, ...doc.data() }); });
          if (interestSnap && interestSnap.docs) {
              interestSnap.docs.forEach((doc: any) => { postMap.set(doc.id, { id: doc.id, ...doc.data() }); });
          }

          // Convert back to Array, Filter blocked users, Apply Scoring
          let fetchedChunk = Array.from(postMap.values())
              .filter(p => !blockedUsers.includes(p.userId))
              .map(p => ({ ...p, algoScore: calculatePostScore(p, userInterests) }));

          // Sort this specific chunk by highest score first
          fetchedChunk.sort((a, b) => b.algoScore - a.algoScore);

          if (isRefresh) {
              setPosts(fetchedChunk);
              AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(fetchedChunk)).catch(() => {});
          } else {
              setPosts(prev => {
                  // Prevent edge-case duplicates when appending
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = fetchedChunk.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

      } catch (error) {
          console.log("Error loading feed:", error);
      } finally {
          setRefreshing(false);
          setLoadingMore(false);
      }
  };

  // Trigger initial fetch ONLY after interests are loaded
  useEffect(() => {
      if (interestsLoaded) {
          fetchFeedChunk(true);
      }
  }, [interestsLoaded]);

  useEffect(() => {
      let isActive = true;
      const runSearch = async () => {
          if (showSearch && searchText.trim().length > 0) {
              if(isActive) setSearchingUsers(true);
              try {
                  const lowerText = searchText.toLowerCase();
                  const q = query(collection(db, 'users'), where('username', '>=', lowerText), where('username', '<=', lowerText + '\uf8ff'), limit(20));
                  const snapshot = await getDocs(q);
                  if (isActive) setUserResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
              } catch (error) { console.error(error); } 
              finally { if (isActive) setSearchingUsers(false); }
          } else {
              if (isActive) setUserResults([]);
          }
      };

      runSearch();
      return () => { isActive = false; };
  }, [searchText, showSearch]);

  const handleTabPress = (tab: string) => {
      setActiveTab(tab);
      if (tab === 'All') flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      else flatListRef.current?.scrollToOffset({ offset: SCREEN_WIDTH, animated: true });
  };

  const handleMomentumScrollEnd = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      if (index === 0) setActiveTab('All');
      else setActiveTab('Chat');
  };

  const onRefresh = useCallback(() => { fetchFeedChunk(true); }, [interestsLoaded]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
          setPlayingPostId(viewableItems[0].item.id);
      } else {
          setPlayingPostId(null);
      }

      viewableItems.forEach((viewToken) => {
          if (viewToken.isViewable && viewToken.item?.id) {
              const postId = viewToken.item.id;
              if (!viewedFeedSession.has(postId)) {
                  viewedFeedSession.add(postId);
                  try { updateDoc(doc(db, 'posts', postId), { views: increment(1) }); } catch (error) {}
              }
          }
      });
  }).current;

  const renderUserItem = ({ item }: any) => (
      <TouchableOpacity 
          style={[styles.userCard, { backgroundColor: theme.card }]}
          onPress={() => router.push({ pathname: '/feed-profile', params: { userId: item.id } })}
      >
          <Image source={{ uri: item.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime' }} style={styles.userAvatar} />
          <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]}>{item.displayName}</Text>
              <Text style={[styles.userHandle, { color: theme.subText }]}>@{item.username}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.subText} />
      </TouchableOpacity>
  );

  const renderFeedList = (data: any[], emptyMessage: string) => (
    <FlatList
        data={data}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 100, width: SCREEN_WIDTH }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        
        onEndReached={() => fetchFeedChunk()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={theme.tint} style={{ marginVertical: 20 }} /> : null}
        
        ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center', width: SCREEN_WIDTH }}>
                <Text style={{ color: theme.subText }}>{emptyMessage}</Text>
            </View>
        }
        renderItem={({ item }) => (
            <PostCard post={item} isVisible={playingPostId === item.id} />
        )}
        extraData={playingPostId}
    />
  );

  const renderChatPlaceholder = () => (
      <View style={[styles.chatPlaceholderContainer, { width: SCREEN_WIDTH }]}>
          <View style={[styles.chatIconWrapper, { backgroundColor: theme.tint + '15' }]}>
              <Ionicons name="chatbubbles" size={60} color={theme.tint} />
          </View>
          <Text style={[styles.chatTitle, { color: theme.text }]}>Private Messaging</Text>
          <Text style={[styles.chatSubtitle, { color: theme.subText }]}>
              Connect, share, and discuss your favorite anime & manga directly with friends and creators.
          </Text>
          <View style={[styles.premiumBadge, { borderColor: theme.tint, backgroundColor: theme.card }]}>
              <Ionicons name="sparkles" size={16} color={theme.tint} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.tint, fontWeight: 'bold', fontSize: 14 }}>Coming Soon For Premium Users</Text>
          </View>
      </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      
      {/* HEADER SECTION */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {!showSearch ? (
            <View style={styles.headerTop}>
                <TouchableOpacity onPress={() => router.push('/feed-profile')}>
                    <Image source={{ uri: currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' }} style={styles.headerAvatar} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Community</Text>
                <TouchableOpacity onPress={() => setShowSearch(true)} style={{ padding: 5 }}>
                    <Ionicons name="search" size={24} color={theme.text} />
                </TouchableOpacity>
            </View>
        ) : (
            <View style={styles.searchBarContainer}>
                <View style={[styles.searchBar, { backgroundColor: theme.card, flex: 1, marginRight: 10 }]}>
                    <Ionicons name="search" size={20} color={theme.subText} />
                    <TextInput 
                        style={[styles.searchInput, { color: theme.text }]}
                        placeholder="Search people..."
                        placeholderTextColor={theme.subText}
                        value={searchText}
                        onChangeText={setSearchText}
                        autoFocus
                        autoCapitalize="none"
                    />
                </View>
                <TouchableOpacity onPress={() => { setShowSearch(false); setSearchText(''); }}>
                    <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
            </View>
        )}

        {!showSearch && (
            <View style={[styles.switchContainer, { backgroundColor: theme.border }]}>
                <TouchableOpacity 
                    style={[styles.switchBtn, activeTab === 'All' && { backgroundColor: theme.tint }]}
                    onPress={() => handleTabPress('All')}
                >
                    <Text style={[styles.switchText, { color: activeTab === 'All' ? 'white' : theme.subText }]}>For You</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.switchBtn, activeTab === 'Chat' && { backgroundColor: theme.tint }]}
                    onPress={() => handleTabPress('Chat')}
                >
                    <Text style={[styles.switchText, { color: activeTab === 'Chat' ? 'white' : theme.subText }]}>Chat</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>

      <View style={styles.content}>
        {showSearch ? (
            <View style={{ flex: 1 }}>
                {searchingUsers ? (
                    <ActivityIndicator style={{ marginTop: 20 }} color={theme.tint} />
                ) : (
                    <FlatList 
                        data={userResults}
                        keyExtractor={item => item.id}
                        renderItem={renderUserItem}
                        contentContainerStyle={{ padding: 15 }}
                        ListEmptyComponent={
                            <Text style={{ textAlign: 'center', color: theme.subText, marginTop: 20 }}>
                                {searchText ? "No users found." : "Search for people."}
                            </Text>
                        }
                    />
                )}
            </View>
        ) : (
            <FlatList
                ref={flatListRef}
                data={[1, 2]} 
                keyExtractor={item => item.toString()}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                scrollEventThrottle={16}
                initialNumToRender={1}
                renderItem={({ index }) => {
                    if (index === 0) return renderFeedList(posts, "No posts yet. Be the first!");
                    if (index === 1) return renderChatPlaceholder(); 
                    return null;
                }}
            />
        )}
      </View>

      {!showSearch && activeTab === 'All' && (
         <TouchableOpacity style={[styles.fab, { backgroundColor: theme.tint }]} onPress={() => router.push('/create-post')}>
            <Ionicons name="add" size={30} color="white" />
         </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 15, paddingBottom: 10, borderBottomWidth: 0.5 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  headerAvatar: { width: 35, height: 35, borderRadius: 17.5 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 40, borderRadius: 20 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  switchContainer: { flexDirection: 'row', borderRadius: 10, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  switchText: { fontWeight: '600', fontSize: 14 },
  content: { flex: 1 },
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  userAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userHandle: { fontSize: 14 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
  chatPlaceholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingBottom: 80 },
  chatIconWrapper: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  chatTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  chatSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 }
});