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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const FEED_CACHE_KEY = 'aniyu_feed_cache_v1';
const viewedFeedSession = new Set<string>();

export default function FeedScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;

  const [posts, setPosts] = useState<any[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // ✅ PAGINATION STATE
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  
  const [playingPostId, setPlayingPostId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('All'); 
  const flatListRef = useRef<FlatList>(null); 
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  useEffect(() => {
      const loadCache = async () => {
          try {
              const cachedPosts = await AsyncStorage.getItem(FEED_CACHE_KEY);
              if (cachedPosts) {
                  setPosts(JSON.parse(cachedPosts));
              }
          } catch(e) { console.log("Feed cache error", e); }
      };
      loadCache();

      return () => {
          viewedFeedSession.clear();
      };
  }, []);

  useEffect(() => {
      if (!currentUser) return;
      const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
          const data = doc.data();
          setBlockedUsers(data?.blockedUsers || []);
          setUserInterests(data?.interests || data?.favoriteGenres || []);
      });
      return unsub;
  }, []);

  // ✅ 1. INITIAL LOAD (Strict limit 10 for Task #4)
  const loadPosts = async (isRefresh = false) => {
    if (isRefresh) {
        setRefreshing(true);
        setHasMore(true); 
    }
    
    try {
      const q = query(
          collection(db, 'posts'), 
          where('parentId', '==', null), 
          orderBy('createdAt', 'desc'),
          limit(10) // ✅ Optimized for cost
      );
      
      const snapshot = await getDocs(q);
      const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setPosts(newPosts);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      
      AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(newPosts)).catch(err => console.log("Cache save failed", err));
    } catch (error) {
      console.log("Error loading feed:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // ✅ 2. LOAD MORE (Strict limit 10)
  const loadMorePosts = async () => {
    if (loadingMore || !hasMore || !lastVisible) return;
    setLoadingMore(true);

    try {
      const q = query(
          collection(db, 'posts'), 
          where('parentId', '==', null), 
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible), 
          limit(10) // ✅ Optimized for cost
      );

      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
      } else {
        const morePosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPosts(prev => [...prev, ...morePosts]);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      }
    } catch (error) {
      console.log("Error loading more:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPosts(); 
  }, []);

  useEffect(() => {
      let isActive = true;
      const runSearch = async () => {
          if (showSearch && searchText.trim().length > 0) {
              if(isActive) setSearchingUsers(true);
              try {
                  const lowerText = searchText.toLowerCase();
                  const usersRef = collection(db, 'users');
                  const q = query(
                      usersRef, 
                      where('username', '>=', lowerText), 
                      where('username', '<=', lowerText + '\uf8ff'),
                      limit(20)
                  );
                  const snapshot = await getDocs(q);
                  if (isActive) {
                      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                      setUserResults(results);
                  }
              } catch (error) { 
                  console.error("Search Error:", error); 
              } finally { 
                  if (isActive) setSearchingUsers(false); 
              }
          } else {
              if (isActive) setUserResults([]);
          }
      };

      runSearch();
      return () => { isActive = false; };
  }, [searchText, showSearch]);

  const allPosts = useMemo(() => {
    const cleanPosts = posts.filter(p => !blockedUsers.includes(p.userId));

    if (userInterests.length > 0) {
        return [...cleanPosts].sort((a, b) => {
            const aMatches = userInterests.some(interest => a.text?.toLowerCase().includes(interest.toLowerCase()) || a.tags?.includes(interest));
            const bMatches = userInterests.some(interest => b.text?.toLowerCase().includes(interest.toLowerCase()) || b.tags?.includes(interest));
            if (aMatches && !bMatches) return -1;
            if (!aMatches && bMatches) return 1;
            return 0; 
        });
    }
    return cleanPosts; 
  }, [posts, userInterests, blockedUsers]);

  const trendingGroups = useMemo(() => {
    const groups: Record<string, { name: string, posts: any[], stats: { likes: number, comments: number, reposts: number } }> = {};
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    posts.filter(p => !blockedUsers.includes(p.userId)).forEach(post => {
        let postDate = new Date(); 
        if (post.createdAt?.seconds) postDate = new Date(post.createdAt.seconds * 1000);
        if (postDate < yesterday) return;

        const postTags = (post.tags && post.tags.length > 0) ? post.tags : ['General'];
        postTags.forEach((tag: string) => {
            const normalizedTag = tag.trim().toUpperCase();
            if (!groups[normalizedTag]) {
                groups[normalizedTag] = { name: normalizedTag, posts: [], stats: { likes: 0, comments: 0, reposts: 0 } };
            }
            groups[normalizedTag].posts.push(post);
            
            // ✅ Task #4: Use Aggregated Counters for performance
            groups[normalizedTag].stats.likes += (post.likeCount || post.likes?.length || 0);
            groups[normalizedTag].stats.comments += (post.commentCount || 0);
            groups[normalizedTag].stats.reposts += (post.repostCount || post.reposts?.length || 0);
        });
    });
    return Object.values(groups).sort((a, b) => {
        const scoreA = a.stats.likes + a.stats.comments + a.stats.reposts;
        const scoreB = b.stats.likes + b.stats.comments + b.stats.reposts;
        return scoreB - scoreA;
    });
  }, [posts, blockedUsers]);

  const handleTabPress = (tab: string) => {
      setActiveTab(tab);
      if (tab === 'All') flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      else flatListRef.current?.scrollToOffset({ offset: SCREEN_WIDTH, animated: true });
  };

  const handleMomentumScrollEnd = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      if (index === 0) setActiveTab('All');
      else setActiveTab('Trending');
  };

  const onRefresh = useCallback(() => {
    loadPosts(true); 
  }, []);

  // ✅ FIX: Stable Viewability Config using useRef.current to avoid "red underline" issue
  const viewabilityConfig = useRef({
      itemVisiblePercentThreshold: 50 
  }).current;

  // ✅ FIX: Stable Callback for item views
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
          const firstVisible = viewableItems[0];
          setPlayingPostId(firstVisible.item.id);
      } else {
          setPlayingPostId(null);
      }

      viewableItems.forEach((viewToken) => {
          if (viewToken.isViewable && viewToken.item?.id) {
              const postId = viewToken.item.id;
              if (!viewedFeedSession.has(postId)) {
                  viewedFeedSession.add(postId);
                  try {
                      updateDoc(doc(db, 'posts', postId), { views: increment(1) });
                  } catch (error) { console.log("Error incrementing view:", error); }
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
        
        // ✅ PROPS ARE NOW STABLE
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        
        onEndReached={loadMorePosts}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={theme.tint} style={{ marginVertical: 20 }} /> : null}
        
        ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center', width: SCREEN_WIDTH }}>
                <Text style={{ color: theme.subText }}>{emptyMessage}</Text>
            </View>
        }
        renderItem={({ item }) => (
            <PostCard 
                post={item} 
                isVisible={playingPostId === item.id} 
            />
        )}
        extraData={playingPostId}
    />
  );

  const renderTrendingTab = () => {
      if (selectedGenre) {
          const genreGroup = trendingGroups.find(g => g.name === selectedGenre);
          const genrePosts = genreGroup ? genreGroup.posts : [];
          return (
              <View style={{ flex: 1, width: SCREEN_WIDTH }}>
                  <View style={[styles.genreHeader, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
                      <TouchableOpacity onPress={() => setSelectedGenre(null)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="arrow-back" size={24} color={theme.text} />
                          <Text style={[styles.genreTitle, { color: theme.text }]}>{selectedGenre}</Text>
                      </TouchableOpacity>
                  </View>
                  {renderFeedList(genrePosts, "No posts in this genre from the last 24h.")}
              </View>
          );
      }
      return (
          <FlatList 
              data={trendingGroups}
              keyExtractor={item => item.name}
              contentContainerStyle={{ padding: 15, width: SCREEN_WIDTH, paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
              ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center', width: SCREEN_WIDTH }}>
                      <Text style={{ color: theme.subText }}>No trending topics.</Text>
                  </View>
              }
              renderItem={({ item }) => (
                  <TouchableOpacity 
                      style={[styles.groupCard, { backgroundColor: theme.card }]}
                      onPress={() => setSelectedGenre(item.name)}
                  >
                      <View style={styles.groupInfo}>
                          <Text style={[styles.groupName, { color: theme.text }]}>#{item.name}</Text>
                          <Text style={[styles.groupCount, { color: theme.subText }]}>{item.posts.length} Posts</Text>
                      </View>
                      <View style={styles.groupStats}>
                          <View style={styles.statPill}>
                              <Ionicons name="heart" size={12} color="#FF6B6B" />
                              <Text style={[styles.statText, { color: theme.text }]}>{item.stats.likes}</Text>
                          </View>
                          <View style={styles.statPill}>
                              <Ionicons name="chatbubble" size={12} color="#4ECDC4" />
                              <Text style={[styles.statText, { color: theme.text }]}>{item.stats.comments}</Text>
                          </View>
                      </View>
                  </TouchableOpacity>
              )}
          />
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {!showSearch ? (
            <>
                <TouchableOpacity onPress={() => router.push('/feed-profile')}>
                    <Image source={{ uri: currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' }} style={styles.headerAvatar} />
                </TouchableOpacity>
                <View style={styles.tabContainer}>
                    <TouchableOpacity onPress={() => handleTabPress('All')} style={styles.tabButton}>
                        <Text style={[styles.tabText, { color: activeTab === 'All' ? theme.text : theme.subText, fontWeight: activeTab === 'All' ? 'bold' : 'normal' }]}>All</Text>
                        {activeTab === 'All' && <View style={[styles.activeIndicator, { backgroundColor: theme.tint }]} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleTabPress('Trending')} style={styles.tabButton}>
                        <Text style={[styles.tabText, { color: activeTab === 'Trending' ? theme.text : theme.subText, fontWeight: activeTab === 'Trending' ? 'bold' : 'normal' }]}>Trending</Text>
                        {activeTab === 'Trending' && <View style={[styles.activeIndicator, { backgroundColor: theme.tint }]} />}
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShowSearch(true)} style={{ padding: 5 }}>
                    <Ionicons name="search" size={24} color={theme.text} />
                </TouchableOpacity>
            </>
        ) : (
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
        )}
        {showSearch && (
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchText(''); }}>
                <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
        )}
      </View>

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
                if (index === 0) return renderFeedList(allPosts, "No posts yet.");
                if (index === 1) return renderTrendingTab(); 
                return null;
            }}
          />
      )}

      {!showSearch && (
         <TouchableOpacity style={[styles.fab, { backgroundColor: theme.tint }]} onPress={() => router.push('/create-post')}>
            <Ionicons name="add" size={30} color="white" />
         </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 0.5, alignItems: 'center', height: 60 },
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
  tabContainer: { flexDirection: 'row', gap: 20 },
  tabButton: { alignItems: 'center', paddingVertical: 5 },
  tabText: { fontSize: 16 },
  activeIndicator: { height: 3, width: '100%', borderRadius: 2, marginTop: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 40, borderRadius: 20 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  userAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userHandle: { fontSize: 14 },
  groupCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 10 },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  groupCount: { fontSize: 12 },
  groupStats: { flexDirection: 'row', gap: 8 },
  statPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statText: { fontSize: 12, fontWeight: '600' },
  genreHeader: { padding: 15, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center' },
  genreTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
});