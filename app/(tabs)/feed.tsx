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
  
  // PAGINATION STATE
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
          limit(10)
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

  const loadMorePosts = async () => {
    if (loadingMore || !hasMore || !lastVisible) return;
    setLoadingMore(true);

    try {
      const q = query(
          collection(db, 'posts'), 
          where('parentId', '==', null), 
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible), 
          limit(10)
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

  const handleTabPress = (tab: string) => {
      setActiveTab(tab);
      if (tab === 'All') flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      else flatListRef.current?.scrollToOffset({ offset: SCREEN_WIDTH, animated: true });
  };

  const handleMomentumScrollEnd = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      if (index === 0) setActiveTab('All');
      else setActiveTab('Chat'); // ✅ Updated to Chat
  };

  const onRefresh = useCallback(() => {
    loadPosts(true); 
  }, []);

  const viewabilityConfig = useRef({
      itemVisiblePercentThreshold: 50 
  }).current;

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

  // ✅ NEW: PREMIUM CHAT PLACEHOLDER
  const renderChatPlaceholder = () => (
      <View style={[styles.chatPlaceholderContainer, { width: SCREEN_WIDTH }]}>
          <View style={[styles.chatIconWrapper, { backgroundColor: theme.tint + '15' }]}>
              <Ionicons name="chatbubbles" size={60} color={theme.tint} />
          </View>
          
          <Text style={[styles.chatTitle, { color: theme.text }]}>
              Private Messaging
          </Text>
          
          <Text style={[styles.chatSubtitle, { color: theme.subText }]}>
              Connect, share, and discuss your favorite anime & manga directly with friends and creators.
          </Text>

          <View style={[styles.premiumBadge, { borderColor: theme.tint, backgroundColor: theme.card }]}>
              <Ionicons name="sparkles" size={16} color={theme.tint} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.tint, fontWeight: 'bold', fontSize: 14 }}>
                  Coming Soon For Premium Users Only
              </Text>
          </View>
      </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {!showSearch ? (
            <>
                <TouchableOpacity onPress={() => router.push('/feed-profile')}>
                    <Image source={{ uri: currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' }} style={styles.headerAvatar} />
                </TouchableOpacity>

                {/* ✅ PILL-STYLE TAB SWITCHER */}
                <View style={[styles.switchContainer, { backgroundColor: theme.border }]}>
                    <TouchableOpacity 
                        style={[styles.switchBtn, activeTab === 'All' && { backgroundColor: theme.tint }]}
                        onPress={() => handleTabPress('All')}
                    >
                        <Text style={[styles.switchText, { color: activeTab === 'All' ? 'white' : theme.subText }]}>All</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.switchBtn, activeTab === 'Chat' && { backgroundColor: theme.tint }]}
                        onPress={() => handleTabPress('Chat')}
                    >
                        <Text style={[styles.switchText, { color: activeTab === 'Chat' ? 'white' : theme.subText }]}>Chat</Text>
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
                if (index === 1) return renderChatPlaceholder(); // ✅ Replaced Trending
                return null;
            }}
          />
      )}

      {/* Hide FAB if on Chat tab or Search */}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 0.5, alignItems: 'center', height: 60 },
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
  
  // SWITCHER STYLES
  switchContainer: { flex: 1, flexDirection: 'row', borderRadius: 10, padding: 4, marginHorizontal: 20 },
  switchBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 8 },
  switchText: { fontWeight: '600', fontSize: 14 },
  
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 40, borderRadius: 20 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  userAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userHandle: { fontSize: 14 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4.65 },

  // ✅ CHAT PLACEHOLDER STYLES
  chatPlaceholderContainer: { 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center', 
      paddingHorizontal: 30, 
      paddingBottom: 80 
  },
  chatIconWrapper: { 
      width: 120, 
      height: 120, 
      borderRadius: 60, 
      justifyContent: 'center', 
      alignItems: 'center', 
      marginBottom: 24 
  },
  chatTitle: { 
      fontSize: 24, 
      fontWeight: 'bold', 
      marginBottom: 12,
      textAlign: 'center'
  },
  chatSubtitle: { 
      fontSize: 15, 
      textAlign: 'center', 
      lineHeight: 22,
      marginBottom: 30 
  },
  premiumBadge: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      paddingVertical: 12, 
      paddingHorizontal: 20, 
      borderRadius: 20, 
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3
  }
});