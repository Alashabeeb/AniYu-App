import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  collection,
  limit, // ✅ IMPORTED LIMIT
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
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

import AdBanner from '../../components/AdBanner';
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

  const [trending, setTrending] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]); 
  const [recommended, setRecommended] = useState<any[]>([]); 
  const [favorites, setFavorites] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [queryText, setQueryText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => { 
      loadFromCache(); 
      loadInitialData(); 
  }, []);

  useFocusEffect(
    useCallback(() => { 
        loadFavorites(); 
        checkUnreadStatus(); 
        loadHistory(); 
    }, [])
  );

  // ✅ OPTIMIZED NOTIFICATION CHECK
  useEffect(() => {
      if (!currentUser) return;
      
      // OLD: Checked ALL unread (Expensive)
      // NEW: Checks only for the FIRST unread item (Cheap)
      const q = query(
        collection(db, 'users', currentUser.uid, 'notifications'), 
        where('read', '==', false),
        limit(1) // ✅ STOP READING AFTER 1 DOCUMENT
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
          // If size > 0, we have at least one unread item.
          // We don't need the exact count for a simple red dot.
          checkUnreadStatus(snapshot.size);
      });
      return unsubscribe;
  }, []);

  const checkUnreadStatus = async (socialCount?: number) => {
      const localCount = await getUnreadLocalCount();
      if (socialCount !== undefined) {
           setHasUnread(socialCount > 0 || localCount > 0);
      } else {
           setHasUnread(localCount > 0);
      }
  };

  const loadFavorites = async () => {
      const favs = await getFavorites();
      const animeFavs = favs.filter((item: any) => {
          const type = item.type?.toLowerCase();
          return type !== 'manga' && type !== 'manhwa' && type !== 'novel' && !item.isManga;
      });
      setFavorites(animeFavs);
  };

  const loadHistory = async () => {
      const history = await getContinueWatching();
      setContinueWatching(history);
  };

  const loadFromCache = async () => {
      try {
          const cachedData = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
          if (cachedData) {
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
      const history = await getContinueWatching();
      if (history.length === 0) return [];

      const genreCounts: Record<string, number> = {};
      
      history.forEach(item => {
          if (item.genres) {
              item.genres.forEach(g => {
                  genreCounts[g] = (genreCounts[g] || 0) + 1;
              });
          }
      });

      const sortedGenres = Object.entries(genreCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([genre]) => genre);

      return sortedGenres.slice(0, 3); 
  };

  const loadInitialData = async () => {
    try {
      if (trending.length === 0) setLoading(true); 
      
      await loadHistory();

      const [trendingData, upcomingData, userGenres] = await Promise.all([
          getTopAnime(),
          getUpcomingAnime(),
          getTopGenres()
      ]);

      const recommendedData = await getRecommendedAnime(userGenres);

      setTrending(trendingData);
      setUpcoming(upcomingData);
      setRecommended(recommendedData);

      await AsyncStorage.setItem(HOME_DATA_CACHE_KEY, JSON.stringify({
          trending: trendingData,
          upcoming: upcomingData,
          recommended: recommendedData
      }));

      await loadFavorites(); 
    } catch (error) {
      console.error("Network error, sticking to cache:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  }, []);

  const handleToggleFav = async (anime: any) => {
      await toggleFavorite(anime);
      await loadFavorites();
  };

  const handleContinueWatching = (item: any) => {
      if (item.episodeId) {
          router.push({ pathname: '/anime/[id]', params: { id: item.mal_id, episodeId: item.episodeId } });
      } else {
          router.push(`/anime/${item.mal_id}`);
      }
  };

  const handleSearch = async () => {
    if (queryText.trim().length === 0) return;
    Keyboard.dismiss(); 
    setSearchLoading(true);
    setIsSearching(true);
    try {
      const results = await searchAnime(queryText);
      setSearchResults(results);
    } catch (error) { console.error(error); } 
    finally { setSearchLoading(false); }
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
                    keyExtractor={(item) => item.mal_id.toString()}
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
          
          {continueWatching.length > 0 && (
              <TrendingRail 
                  title="Continue Watching" 
                  data={continueWatching} 
                  onItemPress={handleContinueWatching}
              />
          )}

          <TrendingRail 
              title="🔥 Trending Now" 
              data={trending.slice(0, 5)} 
              favorites={favorites} 
              onToggleFavorite={handleToggleFav}
              onMore={() => router.push('/anime-list?type=trending')} 
          />

          <AdBanner />
          
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