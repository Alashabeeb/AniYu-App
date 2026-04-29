import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated, // ✅ UI: Scroll-animated header
  FlatList,
  Keyboard,
  RefreshControl,
  StatusBar, StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
// ✅ ADDED: useSafeAreaInsets to protect the floating header from the notch
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../context/ThemeContext';

import AdBanner from '../../components/AdBanner';
import HeroCarousel from '../../components/HeroCarousel';
import TrendingRail from '../../components/TrendingRail';

import { db } from '../../config/firebaseConfig';
import { useAuth } from '../../context/AuthContext'; // ✅ BUG 1 & 3 FIX: Import useAuth to make currentUser reactive
import { getRecommendedAnime, getTopAnime, getUpcomingAnime, searchAnime } from '../../services/animeService';
import { getFavorites, toggleFavorite } from '../../services/favoritesService';
import { getContinueWatching } from '../../services/historyService';
import { getUnreadLocalCount } from '../../services/notificationService';

const HOME_DATA_CACHE_KEY = 'aniyu_home_screen_cache_v1';

// ✅ BUG 2 FIX: 6 Hour Time-To-Live for the Home Screen Cache
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; 

// 🔐 SECURITY: Max search length
const MAX_SEARCH_CHARS = 15;

// ✅ UI: Scroll threshold at which header finishes transitioning to glass
const HEADER_SCROLL_THRESHOLD = 80;

export default function HomeScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets(); // ✅ ADDED: Get device notch heights

  // ✅ UI: Tracks scroll position for the header animation
  const scrollY = useRef(new Animated.Value(0)).current;

  // ✅ UI: Header background — solid black at rest, transitions to glass on scroll
  const headerBgColor = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_THRESHOLD],
    outputRange: ['rgba(0,0,0,1)', 'rgba(0,0,0,0.42)'],
    extrapolate: 'clamp',
  });

  // ✅ UI: Bottom border fades in as glass effect activates
  const headerBorderOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  
  // ✅ BUG 1 & 3 FIX: Use reactive state so the notification listener updates if auth changes
  const { user: currentUser } = useAuth();

  const isMountedRef = useRef(true);

  const [trending, setTrending] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]); 
  const [recommended, setRecommended] = useState<any[]>([]); 
  const [favorites, setFavorites] = useState<any[]>([]);
  
  // ✅ TWO SEPARATE STATES NOW
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [queryText, setQueryText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => { 
      isMountedRef.current = true;
      
      // ✅ BUG 2 FIX: Coordinate the Cache TTL
      const initializeHome = async () => {
          const isCacheValid = await loadFromCache();
          // ONLY fire the expensive 200+ read query if the cache is stale or empty
          if (!isCacheValid) {
              loadInitialData();
          }
      };
      initializeHome();
      
      return () => { isMountedRef.current = false; }; 
  }, []);

  useFocusEffect(
    useCallback(() => { 
        loadFavorites(); 
        checkUnreadStatus(); 
        // ✅ FIX: useFocusEffect only reloads history for the rails display
        // loadInitialData handles history internally to avoid duplicate getContinueWatching calls
        loadHistory(); 
    }, [])
  );

  // ✅ BUG 1 & 3 FIX: This will now cleanly recreate the listener if the user changes accounts or token refreshes
  useEffect(() => {
      if (!currentUser?.uid) return;
      
      const q = query(
        collection(db, 'users', currentUser.uid, 'notifications'), 
        where('read', '==', false),
        limit(1) 
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
          if (isMountedRef.current) checkUnreadStatus(snapshot.size);
      });
      return unsubscribe;
  }, [currentUser?.uid]);

  const checkUnreadStatus = async (socialCount?: number) => {
      const localCount = await getUnreadLocalCount();
      if (!isMountedRef.current) return;
      if (socialCount !== undefined) {
           setHasUnread(socialCount > 0 || localCount > 0);
      } else {
           setHasUnread(localCount > 0);
      }
  };

  const loadFavorites = async () => {
      const favs = await getFavorites();
      if (!isMountedRef.current) return;
      const animeFavs = favs.filter((item: any) => {
          const type = item.type?.toLowerCase();
          return type !== 'manga' && type !== 'manhwa' && type !== 'novel' && !item.isManga;
      });
      setFavorites(animeFavs);
  };

  // ✅ FIX: Accepts an optional pre-fetched history array to avoid duplicate getContinueWatching calls
  // When called from loadInitialData, history is passed in directly (0 extra AsyncStorage reads)
  // When called from useFocusEffect, it fetches its own copy as normal
  const loadHistory = async (prefetchedHistory?: any[]) => {
      const history = prefetchedHistory ?? await getContinueWatching();
      if (isMountedRef.current) {
          // ✅ SPLIT THE HISTORY INTO TWO ARRAYS (Max 5 each)
          // ✅ FIX: Use nullish coalescing to guard against undefined progress on old history entries
          const activeWatches = history.filter(
              item => (item.progress ?? 0) > 0 && item.episodeId !== 'preview'
          ).slice(0, 5);

          const recentViews = history.filter(
              item => (item.progress ?? 0) === 0 || item.episodeId === 'preview'
          ).slice(0, 5);
          
          setContinueWatching(activeWatches);
          setRecentlyViewed(recentViews);
      }
  };

  // ✅ BUG 2 FIX: Implemented Time-To-Live validation
  const loadFromCache = async (): Promise<boolean> => {
      try {
          const cachedData = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
          if (cachedData) {
              const { trending, upcoming, recommended, timestamp } = JSON.parse(cachedData);
              
              if (isMountedRef.current) {
                  if (trending) setTrending(trending);
                  if (upcoming) setUpcoming(upcoming);
                  if (recommended) setRecommended(recommended);
                  
                  // ✅ SURGICAL FIX: Force loading to false if we successfully read ANY cache data
                  setLoading(false);
              }

              // Check if the cache is still fresh enough to skip Firestore reads
              if (timestamp && (Date.now() - timestamp < CACHE_TTL_MS) && trending && trending.length > 0) {
                  return true; // Cache is valid and populated, skip network fetch
              }
          }
          return false; // Cache is stale or missing, proceed to network fetch
      } catch (e) {
          console.log("Failed to load cache", e);
          return false;
      }
  };

  const getTopGenres = async (prefetchedHistory?: any[]) => {
      const genreCounts: Record<string, number> = {};
      
      if (currentUser) {
          try {
              const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
              if (userDoc.exists()) {
                  const interests = userDoc.data().interests || userDoc.data().favoriteGenres || [];
                  interests.forEach((g: string) => {
                      genreCounts[g] = (genreCounts[g] || 0) + 5; 
                  });
              }
          } catch(e) {}
      }

      // ✅ FIX: Use pre-fetched history if available — avoids a 3rd getContinueWatching call
      const history = prefetchedHistory ?? await getContinueWatching();
      history.forEach(item => {
          if (item.genres) {
              item.genres.forEach((g: string) => {
                  genreCounts[g] = (genreCounts[g] || 0) + 1; 
              });
          }
      });

      const sortedGenres = Object.entries(genreCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([genre]) => genre);

      return sortedGenres.slice(0, 5); 
  };

  const loadInitialData = async (isRefresh = false) => {
    try {
      if (trending.length === 0 && !isRefresh && isMountedRef.current) setLoading(true); 

      // ✅ FIX: Fetch history ONCE here and pass it to both loadHistory and getTopGenres
      // This eliminates the duplicate getContinueWatching calls that previously fired 2-3x on mount
      const history = await getContinueWatching();
      await loadHistory(history);

      const [trendingData, upcomingData, userGenres] = await Promise.all([
          getTopAnime(),
          getUpcomingAnime(),
          getTopGenres(history) // ✅ FIX: Pass the same history — no 3rd AsyncStorage read
      ]);

      const rawRecommendedData = await getRecommendedAnime(userGenres);

      // ✅ ADDED: Filter out the top 10 trending anime from the recommended list
      // This ensures 0% overlap between the "Trending" rail and "Recommended" rail
      const trendingIds = new Set(trendingData.slice(0, 10).map((a: any) => a.mal_id));
      const uniqueRecommendedData = rawRecommendedData.filter((a: any) => !trendingIds.has(a.mal_id));

      if (isMountedRef.current) {
          setTrending(trendingData);
          setUpcoming(upcomingData);
          setRecommended(uniqueRecommendedData); // ✅ Set the filtered list here
      }

      // ✅ BUG 2 FIX: Save the current timestamp alongside the data
      await AsyncStorage.setItem(HOME_DATA_CACHE_KEY, JSON.stringify({
          trending: trendingData,
          upcoming: upcomingData,
          recommended: uniqueRecommendedData, // ✅ Save the filtered list to cache
          timestamp: Date.now()
      }));

      await loadFavorites(); 
    } catch (error) {
      console.error("Network error, sticking to cache:", error);
    } finally {
      // ✅ SURGICAL FIX: Force loading to false no matter what happens in the Try block
      if (!isRefresh && isMountedRef.current) setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setRefreshing(true);
    await loadInitialData(true); // Force bypass cache on manual refresh
    if (isMountedRef.current) setRefreshing(false);
  }, []);

  const handleToggleFav = async (anime: any) => {
      await toggleFavorite(anime);
      await loadFavorites();
  };

  // ✅ HANDLER 1: Jumps straight into the player where they left off
  const handleContinueWatchingClick = (item: any) => {
      router.push({ pathname: '/anime/[id]', params: { id: item.mal_id, episodeId: item.episodeId } });
  };

  // ✅ HANDLER 2: Jumps to the overview/details screen
  const handleRecentlyViewedClick = (item: any) => {
      router.push(`/anime/${item.mal_id}`);
  };

  const handleSearch = async () => {
    if (queryText.trim().length === 0) return;
    // 🔐 SECURITY: Validate search length
    if (queryText.trim().length > MAX_SEARCH_CHARS) return;
    // 🔐 SECURITY: Strip special characters that break Firestore range queries
    const sanitizedQuery = queryText.trim().replace(/[^\w\s]/gi, '');
    if (!sanitizedQuery) return;

    Keyboard.dismiss(); 
    setSearchLoading(true);
    setIsSearching(true);
    try {
      const results = await searchAnime(sanitizedQuery);
      if (isMountedRef.current) setSearchResults(results);
    } catch (error) { console.error(error); } 
    finally { if (isMountedRef.current) setSearchLoading(false); }
  };

  const clearSearch = () => {
    setQueryText('');
    setIsSearching(false);
    setSearchResults([]);
    Keyboard.dismiss();
  };

  // ✅ PERF: Memoized so it's not recreated on every render
  const renderSearchItem = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.searchCard, { backgroundColor: theme.card }]}
      onPress={() => router.push(`/anime/${item.mal_id}`)}
    >
      <Image source={{ uri: item.images?.jpg?.image_url }} style={styles.searchImage} contentFit="cover" />
      <View style={styles.searchInfo}>
        <Text numberOfLines={1} style={[styles.searchTitle, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.searchMeta, { color: theme.subText }]}>
            ⭐ {item.score || '?'} • {item.year || 'N/A'} • {item.type}
        </Text>
      </View>
    </TouchableOpacity>
  ), [theme, router]);

  // ✅ UI: Header height — used to push content below the fixed header
  const HEADER_HEIGHT = insets.top + 110;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    // ✅ CHANGED: Replaced SafeAreaView with standard View so the carousel goes full screen under the notch
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Set status bar to light-content so it's visible over the anime images */}
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ✅ UI: Animated floating header — solid black at rest, glass on scroll */}
      <Animated.View style={[styles.floatingHeader, { paddingTop: insets.top, backgroundColor: headerBgColor }]}>
          {/* ✅ UI: Glass border fades in as the user scrolls */}
          <Animated.View style={[styles.headerBorder, { opacity: headerBorderOpacity }]} />

          <View style={styles.topHeader}>
              <Text style={styles.brandTextShadow}>AniYu</Text>
              
              <TouchableOpacity 
                style={styles.notificationBtn} 
                onPress={() => router.push('/notifications')}
              >
                  <Ionicons name="notifications-outline" size={26} color="white" style={styles.iconShadow} />
                  {hasUnread && <View style={styles.redDotHeader} />}
              </TouchableOpacity>
          </View>

          <View style={styles.headerContainer}>
            {/* ✅ UI: Search bar becomes more glass-like when header is in glass mode */}
            <View style={styles.glassSearchBar}>
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.8)" style={{ marginRight: 10 }} />
              <TextInput
                placeholder="Search anime..."
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={[styles.input, { color: 'white' }]}
                value={queryText}
                onChangeText={setQueryText}
                onSubmitEditing={handleSearch} 
                returnKeyType="search"
                maxLength={MAX_SEARCH_CHARS}
              />
              {queryText.length > 0 && (
                <TouchableOpacity onPress={clearSearch}>
                   <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              )}
            </View>
          </View>
      </Animated.View>

      {isSearching ? (
        // ✅ Push search results below the fixed header
        <View style={{ flex: 1, paddingTop: HEADER_HEIGHT }}>
            {searchLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="small" color={theme.tint} />
                </View>
            ) : (
                <FlatList
                    data={searchResults}
                    // ✅ BUG FIX 2: Added index to guarantee unique keys
                    keyExtractor={(item, index) => `${item.mal_id}-${index}`}
                    renderItem={renderSearchItem}
                    contentContainerStyle={{ padding: 20 }}
                    ListEmptyComponent={
                        <Text style={{ color: theme.subText, textAlign: 'center', marginTop: 50 }}>No results found.</Text>
                    }
                />
            )}
        </View>
      ) : (
        // ✅ UI: Animated.ScrollView drives the header animation via scrollY
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false } // false required — animating backgroundColor
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        >
          {/* ✅ UI: Pushes all content below the fixed header — HeroCarousel is now visually UNDER the header area */}
          <View style={{ paddingTop: HEADER_HEIGHT }}>

            {/* HeroCarousel is the first thing below the header */}
            <HeroCarousel data={trending.slice(0, 5)} />
            
            {/* ✅ RAIL 1: CONTINUE WATCHING */}
            {continueWatching.length > 0 && (
                <TrendingRail 
                    title="Continue Watching" 
                    data={continueWatching} 
                    onItemPress={handleContinueWatchingClick}
                />
            )}
            {/* ✅ RAIL 2: RECENTLY VIEWED */}
            {recentlyViewed.length > 0 && (
                <TrendingRail 
                    title="Recently Viewed" 
                    data={recentlyViewed} 
                    onItemPress={handleRecentlyViewedClick}
                />
            )}
              
              <AdBanner />

            <TrendingRail 
                title="🔥 Trending Now" 
                data={trending.slice(0, 5)} 
                favorites={favorites} 
                onToggleFavorite={handleToggleFav}
                onMore={() => router.push('/anime-list?type=trending')} 
            />

            
            <TrendingRail 
                title="Upcoming Anime" 
                data={upcoming.slice(0, 5)} 
                favorites={favorites} 
                onToggleFavorite={handleToggleFav}
                onMore={() => router.push('/anime-list?type=upcoming')}
                />

              <AdBanner />

            <TrendingRail 
                title="Recommended for You" 
                data={recommended.slice(0, 5)} 
                favorites={favorites} 
                onToggleFavorite={handleToggleFav}
                onMore={() => router.push('/anime-list?type=recommended')} 
            />
            
              <AdBanner />

            {favorites.length > 0 && (
                <TrendingRail 
                    title="My Favorites ❤️" 
                    data={favorites.slice(0, 5)} 
                    favorites={favorites} 
                    onToggleFavorite={handleToggleFav} 
                    onMore={() => router.push('/anime-list?type=favorites')}
                />
            )}

            <View style={{ height: 100 }} />
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // ✅ UI: Animated header — backgroundColor driven by scrollY
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  // ✅ UI: Thin glass border that appears as user scrolls
  headerBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  brandTextShadow: { 
    fontSize: 24, 
    fontWeight: '900', 
    fontFamily: 'System', 
    letterSpacing: 0.5,
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  glassSearchBar: {
    flexDirection: 'row', 
    borderRadius: 12, 
    paddingHorizontal: 15, 
    height: 45, 
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', // Glassmorphism dark fade
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  notificationBtn: { padding: 5, position: 'relative' },
  redDotHeader: { position: 'absolute', top: 5, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: 'red', borderWidth: 1, borderColor: 'white' },

  headerContainer: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 10 },
  input: { flex: 1, fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  searchCard: { flexDirection: 'row', marginBottom: 12, borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  searchImage: { width: 60, height: 80 },
  searchInfo: { flex: 1, padding: 12 },
  searchTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  searchMeta: { fontSize: 12 },
});