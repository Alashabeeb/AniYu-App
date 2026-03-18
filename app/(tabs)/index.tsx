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
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView, StatusBar, StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../context/ThemeContext';

import HeroCarousel from '../../components/HeroCarousel';
import TrendingRail from '../../components/TrendingRail';

import { auth, db } from '../../config/firebaseConfig';
import { getRecommendedAnime, getTopAnime, getUpcomingAnime, searchAnime } from '../../services/animeService';
import { getFavorites, toggleFavorite } from '../../services/favoritesService';
import { getContinueWatching } from '../../services/historyService';
import { getUnreadLocalCount } from '../../services/notificationService';

const HOME_DATA_CACHE_KEY = 'aniyu_home_screen_cache_v1';

export default function HomeScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const currentUser = auth.currentUser;

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
      loadFromCache(); 
      loadInitialData(); 
      
      return () => { isMountedRef.current = false; }; 
  }, []);

  useFocusEffect(
    useCallback(() => { 
        loadFavorites(); 
        checkUnreadStatus(); 
        loadHistory(); 
    }, [])
  );

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

  const loadHistory = async () => {
      const history = await getContinueWatching();
      if (isMountedRef.current) {
          // ✅ SPLIT THE HISTORY INTO TWO ARRAYS (Max 5 each)
          const activeWatches = history.filter(item => item.progress > 0 && item.episodeId !== 'preview').slice(0, 5);
          const recentViews = history.filter(item => item.progress === 0 || item.episodeId === 'preview').slice(0, 5);
          
          setContinueWatching(activeWatches);
          setRecentlyViewed(recentViews);
      }
  };

  const loadFromCache = async () => {
      try {
          const cachedData = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
          if (cachedData && isMountedRef.current) {
              const { trending, upcoming, recommended } = JSON.parse(cachedData);
              if (trending) setTrending(trending);
              if (upcoming) setUpcoming(upcoming);
              if (recommended) setRecommended(recommended);
              
              if (trending && trending.length > 0) setLoading(false); 
          }
      } catch (e) {
          console.log("Failed to load cache", e);
      }
  };

  const getTopGenres = async () => {
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

      const history = await getContinueWatching();
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
      
      await loadHistory();

      const [trendingData, upcomingData, userGenres] = await Promise.all([
          getTopAnime(),
          getUpcomingAnime(),
          getTopGenres()
      ]);

      const recommendedData = await getRecommendedAnime(userGenres);

      if (isMountedRef.current) {
          setTrending(trendingData);
          setUpcoming(upcomingData);
          setRecommended(recommendedData);
      }

      await AsyncStorage.setItem(HOME_DATA_CACHE_KEY, JSON.stringify({
          trending: trendingData,
          upcoming: upcomingData,
          recommended: recommendedData
      }));

      await loadFavorites(); 
    } catch (error) {
      console.error("Network error, sticking to cache:", error);
    } finally {
      if (!isRefresh && isMountedRef.current) setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setRefreshing(true);
    await loadInitialData(true);
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
    Keyboard.dismiss(); 
    setSearchLoading(true);
    setIsSearching(true);
    try {
      const results = await searchAnime(queryText);
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

  const renderSearchItem = ({ item }: { item: any }) => (
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
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <View style={styles.topHeader}>
          <Text style={[styles.brandText, { color: theme.text }]}>AniYu</Text>
          
          <TouchableOpacity 
            style={styles.notificationBtn} 
            onPress={() => router.push('/notifications')}
          >
              <Ionicons name="notifications-outline" size={26} color={theme.text} />
              {hasUnread && <View style={styles.redDotHeader} />}
          </TouchableOpacity>
      </View>

      <View style={styles.headerContainer}>
        <View style={[styles.searchBar, { backgroundColor: theme.card }]}>
          <Ionicons name="search" size={20} color={theme.subText} style={{ marginRight: 10 }} />
          <TextInput
            placeholder="Search anime..."
            placeholderTextColor={theme.subText}
            style={[styles.input, { color: theme.text }]}
            value={queryText}
            onChangeText={setQueryText}
            onSubmitEditing={handleSearch} 
            returnKeyType="search"
          />
          {queryText.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
               <Ionicons name="close-circle" size={20} color={theme.subText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        <View style={{ flex: 1 }}>
            {searchLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="small" color={theme.tint} />
                </View>
            ) : (
                <FlatList
                    data={searchResults}
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
        <ScrollView 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        >
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

          <TrendingRail 
              title="Recommended for You" 
              data={recommended.slice(0, 5)} 
              favorites={favorites} 
              onToggleFavorite={handleToggleFav}
              onMore={() => router.push('/anime-list?type=recommended')} 
          />
          
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
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  brandText: { fontSize: 24, fontWeight: '900', fontFamily: 'System', letterSpacing: 0.5 },
  notificationBtn: { padding: 5, position: 'relative' },
  redDotHeader: { position: 'absolute', top: 5, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: 'red', borderWidth: 1, borderColor: 'white' },

  headerContainer: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 10 },
  searchBar: { flexDirection: 'row', borderRadius: 12, paddingHorizontal: 15, height: 45, alignItems: 'center' },
  input: { flex: 1, fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  searchCard: { flexDirection: 'row', marginBottom: 12, borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  searchImage: { width: 60, height: 80 },
  searchInfo: { flex: 1, padding: 12 },
  searchTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  searchMeta: { fontSize: 12 },
});