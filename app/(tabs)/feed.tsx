import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
    collection,
    doc,
    documentId,
    DocumentSnapshot,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Platform,
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
// ✅ IMPORT AD BANNER
import AdBanner from '../../components/AdBanner';

import { db } from '../../config/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FEED_CACHE_KEY = 'aniyu_feed_cache_v2';

// 🔐 SECURITY: Max search length
const MAX_SEARCH_CHARS = 15;

export default function FeedScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user: currentUser } = useAuth();

  const [posts, setPosts] = useState<any[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [interestsLoaded, setInterestsLoaded] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  
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

  const sessionShuffleSeed = useRef(Math.random().toString(36).substring(7)).current;

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
      const loadCache = async () => {
          try {
              const cachedPosts = await AsyncStorage.getItem(FEED_CACHE_KEY);
              if (cachedPosts && isMountedRef.current) setPosts(JSON.parse(cachedPosts));
          } catch(e) { console.log("Feed cache error", e); }
      };
      loadCache();
  }, []);

  useEffect(() => {
      const loadUserPreferences = async () => {
          if (!currentUser) return;
          try {
              const cacheKey = `prefs_${currentUser.uid}`;
              const cachedPrefs = await AsyncStorage.getItem(cacheKey);
              if (cachedPrefs && isMountedRef.current) {
                  const data = JSON.parse(cachedPrefs);
                  setBlockedUsers(data.blockedUsers || []);
                  setUserInterests(data.interests || []);
                  setInterestsLoaded(true);
              }

              const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
              if (userSnap.exists() && isMountedRef.current) {
                  const data = userSnap.data();
                  setBlockedUsers(data?.blockedUsers || []);
                  setUserInterests(data?.interests || data?.favoriteGenres || []);
                  setInterestsLoaded(true);
                  
                  await AsyncStorage.setItem(cacheKey, JSON.stringify({
                      blockedUsers: data?.blockedUsers || [],
                      interests: data?.interests || data?.favoriteGenres || []
                  }));
              }
          } catch (error) {
              console.log("Failed to load prefs", error);
          }
      };
      loadUserPreferences();
  }, [currentUser]);

  useEffect(() => {
      if (blockedUsers.length > 0) {
          setPosts(prev => prev.filter(p => {
              if (blockedUsers.includes(p.userId)) return false;
              if (p.isRepost && p.originalUserId && blockedUsers.includes(p.originalUserId)) return false;
              return true;
          }));
      }
  }, [blockedUsers]);

  const calculatePostScore = (post: any, interests: string[], userId: string) => {
      let score = 0;
      
      if (post.tags && Array.isArray(post.tags) && interests.length > 0) {
          const matches = post.tags.filter((tag: string) => interests.includes(tag));
          score += (matches.length * 50); 
      }
      
      const likes = post.likeCount || 0;
      const comments = post.commentCount || 0;
      const reposts = post.repostCount || 0;
      const views = post.views || 0;

      score += likes * 2;
      score += comments * 3;
      score += reposts * 5;

      if (views > 50) {
          const engagementRate = (likes + comments + reposts) / views;
          score *= (1 + Math.min(engagementRate, 0.2)); 
      }
      
      if (post.createdAt?.seconds) {
          const hoursOld = Math.max(0, (Date.now() / 1000 - post.createdAt.seconds) / 3600);
          
          score = score / Math.pow(hoursOld + 2, 1.2);
          
          if (hoursOld < 3) {
              score += (3 - hoursOld) * 10;
          }
      }

      const seedString = userId + post.id + sessionShuffleSeed;
      let hash = 0;
      for (let i = 0; i < Math.min(seedString.length, 20); i++) {
          hash = ((hash << 5) - hash) + seedString.charCodeAt(i);
      }
      const personalizedJitter = (Math.abs(hash) % 31) - 15;
      score += personalizedJitter;

      return score;
  };

  const fetchFeedChunk = async (isRefresh = false) => {
      if (!isMountedRef.current) return;
      if (!hasMore && !isRefresh) return;
      if (loadingMore || refreshing) return;

      if (isRefresh) {
          setRefreshing(true);
          setHasMore(true);
          setGlobalLastVisible(null);
          setInterestLastVisible(null);
      } else {
          setLoadingMore(true);
      }
      
      try {
          const safeInterests = userInterests.slice(0, 10);
          const fetchPromises = [];

          let globalQ = query(collection(db, 'posts'), where('parentId', '==', null), orderBy('createdAt', 'desc'), limit(10));
          if (!isRefresh && globalLastVisible) {
              globalQ = query(collection(db, 'posts'), where('parentId', '==', null), orderBy('createdAt', 'desc'), startAfter(globalLastVisible), limit(10));
          }
          fetchPromises.push(getDocs(globalQ));

          if (safeInterests.length > 0) {
              let intQ = query(collection(db, 'posts'), where('parentId', '==', null), where('tags', 'array-contains-any', safeInterests), orderBy('createdAt', 'desc'), limit(10));
              if (!isRefresh && interestLastVisible) {
                  intQ = query(collection(db, 'posts'), where('parentId', '==', null), where('tags', 'array-contains-any', safeInterests), orderBy('createdAt', 'desc'), startAfter(interestLastVisible), limit(10));
              }
              fetchPromises.push(getDocs(intQ).catch(e => {
                  console.warn("Missing Index for personalized feed.", e);
                  return { docs: [] }; 
              }));
          }

          const results = await Promise.all(fetchPromises);
          if (!isMountedRef.current) return;
          
          const globalSnap = results[0];
          const interestSnap = results[1];

          if (globalSnap.docs.length > 0) setGlobalLastVisible(globalSnap.docs[globalSnap.docs.length - 1]);
          if (interestSnap && interestSnap.docs?.length > 0) setInterestLastVisible(interestSnap.docs[interestSnap.docs.length - 1]);

          if (globalSnap.docs.length === 0 && (!interestSnap || interestSnap.docs?.length === 0)) {
              setHasMore(false);
          }

          const postMap = new Map();
          
          globalSnap.docs.forEach((docSnap: any) => { postMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }); });
          if (interestSnap && interestSnap.docs) {
              interestSnap.docs.forEach((docSnap: any) => { postMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }); });
          }

          const currentUserId = currentUser?.uid || 'guest_user';

          let fetchedChunk = Array.from(postMap.values())
              .filter(p => {
                  if (blockedUsers.includes(p.userId)) return false;
                  if (p.isRepost && p.originalUserId && blockedUsers.includes(p.originalUserId)) return false;
                  return true;
              })
              .map(p => ({ ...p, algoScore: calculatePostScore(p, userInterests, currentUserId) }));

          const reposts = fetchedChunk.filter(p => p.isRepost && p.originalPostId);
          if (reposts.length > 0) {
              const originalIds = [...new Set(reposts.map(p => p.originalPostId))];
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

                      fetchedChunk = fetchedChunk.map(p => {
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
                      }).filter(Boolean); 

                  } catch (syncErr) { console.log("Failed to sync master posts", syncErr); }
              }
          }

          fetchedChunk.sort((a, b) => b.algoScore - a.algoScore);

          if (isRefresh) {
              setPosts(fetchedChunk);
              AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(fetchedChunk)).catch(() => {});
          } else {
              setPosts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const strictlyNew = fetchedChunk.filter(p => !existingIds.has(p.id));
                  return [...prev, ...strictlyNew];
              });
          }

      } catch (error) {
          console.log("Error loading feed:", error);
      } finally {
          if (isMountedRef.current) {
              setRefreshing(false);
              setLoadingMore(false);
          }
      }
  };

  useEffect(() => {
      if (interestsLoaded) {
          fetchFeedChunk(true);
      }
  }, [interestsLoaded]);

  useEffect(() => {
      const runSearch = async () => {
          if (showSearch && searchText.trim().length > 0) {
              // 🔐 SECURITY: Validate search length
              if (searchText.trim().length > MAX_SEARCH_CHARS) return;
              // 🔐 SECURITY: Strip special characters before Firestore range query
              const sanitizedText = searchText.trim().toLowerCase().replace(/[^\w]/gi, '');
              if (!sanitizedText) return;

              if (isMountedRef.current) setSearchingUsers(true);
              try {
                  const q = query(collection(db, 'users'), where('username', '>=', sanitizedText), where('username', '<=', sanitizedText + '\uf8ff'), limit(20));
                  const snapshot = await getDocs(q);
                  if (isMountedRef.current) setUserResults(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
              } catch (error) { console.error(error); } 
              finally { if (isMountedRef.current) setSearchingUsers(false); }
          } else {
              if (isMountedRef.current) setUserResults([]);
          }
      };
      runSearch();
  }, [searchText, showSearch]);

  const onRefresh = useCallback(() => { fetchFeedChunk(true); }, [interestsLoaded]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
          setPlayingPostId(viewableItems[0].item.id);
      } else {
          setPlayingPostId(null);
      }
  }).current;

  const renderUserItem = ({ item }: { item: any }) => (
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

  const renderChatPlaceholder = () => (
      <View style={[styles.chatPlaceholderContainer, { flex: 1 }]}>
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
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {!showSearch ? (
            <View style={styles.headerTop}>
                <TouchableOpacity onPress={() => router.push('/feed-profile')}>
                    <Image 
                        source={{ uri: (currentUser as any)?.avatar || currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' }} 
                        style={styles.headerAvatar} 
                    />
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
                        maxLength={MAX_SEARCH_CHARS}
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
                    onPress={() => setActiveTab('All')}
                >
                    <Text style={[styles.switchText, { color: activeTab === 'All' ? 'white' : theme.subText }]}>For You</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.switchBtn, activeTab === 'Chat' && { backgroundColor: theme.tint }]}
                    onPress={() => setActiveTab('Chat')}
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
        ) : activeTab === 'Chat' ? (
            renderChatPlaceholder()
        ) : (
            <FlatList
                data={posts}
                keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                
                removeClippedSubviews={Platform.OS === 'android'} 
                maxToRenderPerBatch={5} 
                windowSize={10} 
                initialNumToRender={5} 
                
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
                
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                
                onEndReached={() => fetchFeedChunk()}
                onEndReachedThreshold={0.5} 
                
                ListFooterComponent={
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        {loadingMore ? (
                            <ActivityIndicator size="small" color={theme.tint} />
                        ) : !hasMore && posts.length > 0 ? (
                            <Text style={{ color: theme.subText, fontSize: 12 }}>You're all caught up!</Text>
                        ) : null}
                    </View>
                }
                
                ListEmptyComponent={
                    !refreshing && !loadingMore ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: theme.subText }}>No posts yet. Be the first!</Text>
                        </View>
                    ) : null
                }
                
                renderItem={({ item, index }: { item: any, index: number }) => (
                    <React.Fragment>
                        <PostCard 
                            post={item as any} 
                            isVisible={playingPostId === item.id} 
                            onDelete={(deletedId) => {
                                setPosts(prev => prev.filter(p => p.id !== deletedId));
                            }}
                            onBlock={(blockedId) => {
                                setPosts(prev => prev.filter(p => p.userId !== blockedId && p.originalUserId !== blockedId));
                                const newBlocked = [...blockedUsers, blockedId];
                                setBlockedUsers(newBlocked);
                                if (currentUser) {
                                    AsyncStorage.setItem(`prefs_${currentUser.uid}`, JSON.stringify({
                                        blockedUsers: newBlocked,
                                        interests: userInterests
                                    })).catch(()=>{});
                                }
                            }}
                        />
                        {(index + 1) % 3 === 0 && (
                            <View style={{ marginVertical: 8 }}>
                                <AdBanner />
                            </View>
                        )}
                    </React.Fragment>
                )}
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
  chatTitle: { fontSize: 24, fontWeight: 'bold', m