import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Keyboard,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MangaGrid from '../../components/MangaGrid';
import TrendingRail from '../../components/TrendingRail';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';
// Services
import { DownloadItem, getMangaDownloads, removeMangaDownload } from '../../services/downloadService';
import { getMangaFavorites, toggleMangaFavorite } from '../../services/favoritesService';
import { getAllManga, getRecommendedManga, getTopManga, searchManga } from '../../services/mangaService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MANGA_SCREEN_CACHE_KEY = 'aniyu_manga_screen_cache_v1';

// 🔐 SECURITY: Max search length
const MAX_SEARCH_CHARS = 15;

interface GroupedManga {
  mal_id: string | number;
  title: string;
  image: string;
  chapters: DownloadItem[];
}

export default function ComicScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  // ✅ BUG FIX 1: Memory Leak Protection Ref
  const isMountedRef = useRef(true);

  const [activeTab, setActiveTab] = useState('Discover'); 
  const [libraryType, setLibraryType] = useState('Favorites');
  
  const [topManga, setTopManga] = useState<any[]>([]);
  const [recommendedManga, setRecommendedManga] = useState<any[]>([]);
  const [allManga, setAllManga] = useState<any[]>([]); 
  const [library, setLibrary] = useState<any[]>([]);
  
  const [groupedDownloads, setGroupedDownloads] = useState<GroupedManga[]>([]);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
      isMountedRef.current = true;
      const loadCache = async () => {
          try {
              const cachedData = await AsyncStorage.getItem(MANGA_SCREEN_CACHE_KEY);
              if (cachedData && isMountedRef.current) {
                  const { top, all, favs, recs } = JSON.parse(cachedData);
                  if (top) setTopManga(top);
                  if (all) setAllManga(all);
                  if (favs) setLibrary(favs);
                  if (recs) setRecommendedManga(recs);
                  if (top && top.length > 0) setLoading(false);
              }
          } catch (e) { console.log("Manga cache load failed", e); }
      };
      loadCache();
      
      return () => { isMountedRef.current = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
        loadData();
    }, [])
  );

  const loadData = async (isRefresh = false) => {
    try {
        const down = await getMangaDownloads(); 
        const groups: Record<string, GroupedManga> = {};
        down.forEach((item) => {
            const id = item.mal_id;
            if (!groups[id]) {
                groups[id] = { mal_id: id, title: item.animeTitle || item.title, image: item.image || '', chapters: [] };
            }
            groups[id].chapters.push(item);
        });
        Object.values(groups).forEach(g => { g.chapters.sort((a, b) => a.number - b.number); });
        
        if (isMountedRef.current) setGroupedDownloads(Object.values(groups));
    } catch (e) { console.log("Error loading downloads", e); }

    if (topManga.length === 0 && !isRefresh && isMountedRef.current) setLoading(true); 
    
    try {
        const top = await getTopManga();
        const all = await getAllManga();
        const favs = await getMangaFavorites();

        const genreCounts: Record<string, number> = {};
        const currentUser = auth.currentUser;
        
        if (currentUser) {
            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (userDoc.exists()) {
                    const interests = userDoc.data().interests || userDoc.data().favoriteGenres || [];
                    interests.forEach((g: string) => { genreCounts[g] = (genreCounts[g] || 0) + 5; });
                }
            } catch(e) {}
        }
        
        favs.forEach((item: any) => {
            if (item.genres) {
                item.genres.forEach((g: string) => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
            }
        });
        
        const sortedGenres = Object.entries(genreCounts).sort(([, a], [, b]) => b - a).map(([genre]) => genre).slice(0, 5);
        const recs = await getRecommendedManga(sortedGenres);

        AsyncStorage.setItem(MANGA_SCREEN_CACHE_KEY, JSON.stringify({
            top: top,
            all: all,
            favs: favs,
            recs: recs
        })).catch(e => console.log("Cache save failed", e));
        
        // ✅ Safe state updates
        if (isMountedRef.current) {
            setTopManga(top);
            setAllManga(all);
            setLibrary(favs);
            setRecommendedManga(recs);
        }
    } catch (error) {
        console.error("Network error, staying with cache:", error);
    } finally {
        if (!isRefresh && isMountedRef.current) setLoading(false); 
    }
  };

  const onRefresh = async () => {
    if (!isMountedRef.current) return;
    setRefreshing(true);
    await loadData(true); 
    if (isMountedRef.current) setRefreshing(false);
  };

  const handleToggleFav = async (manga: any) => {
      await toggleMangaFavorite(manga);
      const favs = await getMangaFavorites();
      if (isMountedRef.current) setLibrary(favs);
      AsyncStorage.setItem(MANGA_SCREEN_CACHE_KEY, JSON.stringify({
          top: topManga,
          all: allManga,
          favs: favs,
          recs: recommendedManga
      }));
  };

  const handleDelete = (chapter: DownloadItem) => {
      Alert.alert(
          "Delete Chapter",
          `Are you sure you want to delete ${chapter.title}?`,
          [
              { text: "Cancel", style: "cancel" },
              { 
                  text: "Delete", 
                  style: "destructive", 
                  onPress: async () => {
                      await removeMangaDownload(chapter.episodeId);
                      await loadData(); 
                  }
              }
          ]
      );
  };

  const handleSearch = async () => {
      if (!searchQuery.trim()) return;
      // 🔐 SECURITY: Validate search length
      if (searchQuery.trim().length > MAX_SEARCH_CHARS) return;
      // 🔐 SECURITY: Strip special characters that break API queries
      const sanitizedQuery = searchQuery.trim().replace(/[^\w\s]/gi, '');
      if (!sanitizedQuery) return;

      Keyboard.dismiss();
      setSearchLoading(true);
      setIsSearching(true);
      const results = await searchManga(sanitizedQuery);
      if (isMountedRef.current) {
          setSearchResults(results);
          setSearchLoading(false);
      }
  };

  const openMangaDetails = (item: any) => {
      router.push({ pathname: '/manga/[id]', params: { id: item.mal_id } });
  };

  const toggleExpand = (id: string | number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedId(expandedId === id ? null : id);
  };

  const isFavorite = (id: any) => library.some((fav: any) => String(fav.mal_id) === String(id));

  const renderGridItem = ({ item }: { item: any }) => {
      const isFav = isFavorite(item.mal_id);
      return (
        <TouchableOpacity 
            style={styles.gridItem}
            onPress={() => openMangaDetails(item)}
        >
            <View style={styles.imageContainer}>
                <Image 
                    source={{ uri: item.images?.jpg?.image_url || item.image || 'https://via.placeholder.com/150' }} 
                    style={styles.poster} 
                    contentFit="cover"
                />
                {item.status && item.status !== 'Upcoming' && (
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'Completed' ? '#10b981' : '#3b82f6' }]}>
                        <Text style={styles.statusText}>{item.status}</Text>
                    </View>
                )}
                <TouchableOpacity 
                    style={styles.favBtn} 
                    onPress={() => handleToggleFav(item)}
                >
                    <Ionicons name={isFav ? "heart" : "heart-outline"} size={16} color={isFav ? "#FF6B6B" : "white"} />
                </TouchableOpacity>
            </View>
            <Text numberOfLines={1} style={[styles.mangaTitle, { color: theme.text }]}>
                {item.title || item.animeTitle}
            </Text>
        </TouchableOpacity>
      );
  };

  const renderLibrary = () => (
      <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', margin: 15, marginBottom: 5 }}>
              <TouchableOpacity onPress={() => setLibraryType('Favorites')} style={{ marginRight: 20 }}>
                  <Text style={{ 
                      color: libraryType === 'Favorites' ? theme.tint : theme.subText, 
                      fontWeight: 'bold', 
                      fontSize: 18 
                  }}>Favorites</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLibraryType('Downloads')}>
                  <Text style={{ 
                      color: libraryType === 'Downloads' ? theme.tint : theme.subText, 
                      fontWeight: 'bold', 
                      fontSize: 18 
                  }}>Downloads</Text>
              </TouchableOpacity>
          </View>

          {libraryType === 'Favorites' ? (
             <MangaGrid 
                data={library} 
                theme={theme} 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                emptyMsg="No favorites yet."
             />
          ) : (
             <FlatList
                data={groupedDownloads}
                // ✅ BUG FIX 2: Added index to keys
                keyExtractor={(item, index) => `${item.mal_id}-${index}`}
                renderItem={({ item }) => {
                    const isExpanded = expandedId === item.mal_id;
                    return (
                        <View style={[styles.groupContainer, { backgroundColor: theme.card }]}>
                            <TouchableOpacity 
                                style={styles.groupHeader} 
                                onPress={() => toggleExpand(item.mal_id)}
                            >
                                <Image source={{ uri: item.image }} style={styles.groupPoster} />
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={[styles.groupTitle, { color: theme.text }]}>{item.title}</Text>
                                    <Text style={{ color: theme.subText }}>{item.chapters.length} Chapters Downloaded</Text>
                                </View>
                                <Ionicons 
                                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                                    size={24} 
                                    color={theme.subText} 
                                />
                            </TouchableOpacity>

                            {isExpanded && (
                                <View style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
                                    {item.chapters.map((chapter) => (
                                        <View key={chapter.episodeId} style={styles.chapterRow}>
                                            <TouchableOpacity 
                                                style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}
                                                onPress={() => {
                                                    router.push({
                                                        pathname: '/chapter-read',
                                                        params: {
                                                            url: chapter.localUri, 
                                                            title: `${item.title} - ${chapter.title}`,
                                                            mangaId: item.mal_id,
                                                            chapterId: chapter.episodeId,
                                                            chapterNum: chapter.number
                                                        }
                                                    });
                                                }}
                                            >
                                                <Ionicons name="book-outline" size={20} color={theme.tint} />
                                                <Text style={[styles.chapterText, { color: theme.text }]} numberOfLines={1}>
                                                    {chapter.title}
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                onPress={() => handleDelete(chapter)}
                                                style={{ padding: 8 }}
                                            >
                                                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    );
                }}
                contentContainerStyle={{ padding: 15 }}
                ListEmptyComponent={<Text style={{ color: theme.subText, textAlign: 'center', marginTop: 50 }}>No downloads yet.</Text>}
             />
          )}
      </View>
  );

  const renderDiscover = () => (
      <ScrollView 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
          <View style={[styles.searchBar, { backgroundColor: theme.card }]}>
              <Ionicons name="search" size={20} color={theme.subText} style={{ marginRight: 10 }} />
              <TextInput 
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Search Manga..."
                  placeholderTextColor={theme.subText}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  maxLength={MAX_SEARCH_CHARS}
              />
              {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setIsSearching(false); setSearchResults([]); }}>
                      <Ionicons name="close-circle" size={18} color={theme.subText} />
                  </TouchableOpacity>
              )}
          </View>

          {isSearching ? (
              <View style={{ flex: 1 }}>
                  {searchLoading ? (
                      <View style={styles.center}><ActivityIndicator size="small" color={theme.tint} /></View>
                  ) : (
                      <FlatList
                          data={searchResults}
                          // ✅ BUG FIX 2: Added index to keys
                          keyExtractor={(item, index) => `${item.mal_id}-${index}`}
                          numColumns={3}
                          renderItem={renderGridItem}
                          contentContainerStyle={{ padding: 10 }}
                          ListEmptyComponent={<Text style={{ color: theme.subText, textAlign: 'center', marginTop: 50 }}>No results found.</Text>}
                      />
                  )}
              </View>
          ) : (
              <>
                  <TrendingRail 
                      title="🏆 Top Manga" 
                      data={topManga.slice(0, 5)} 
                      favorites={library} 
                      onToggleFavorite={handleToggleFav}
                      onMore={() => router.push('/manga-list?type=top')}
                      onItemPress={openMangaDetails}
                  />

                  <TrendingRail 
                      title="Recommended for You" 
                      data={recommendedManga.slice(0, 5)} 
                      favorites={library} 
                      onToggleFavorite={handleToggleFav}
                      onMore={() => router.push('/manga-list?type=recommended')}
                      onItemPress={openMangaDetails}
                  />

                  <View style={styles.sectionContainer}>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>All Manga</Text>
                      {allManga.length > 0 ? (
                          <View style={styles.gridContainer}>
                              {allManga.map((item: any) => (
                                  <View key={item.mal_id} style={styles.gridItemWrapper}>
                                      {renderGridItem({ item })}
                                  </View>
                              ))}
                          </View>
                      ) : (
                          <Text style={{color: theme.subText, textAlign:'center', marginTop: 20}}>No manga found.</Text>
                      )}
                  </View>
              </>
          )}
      </ScrollView>
  );

  if (loading && topManga.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Manga</Text>
        <View style={[styles.switchContainer, { backgroundColor: theme.border }]}>
          <TouchableOpacity 
            style={[styles.switchBtn, activeTab === 'Discover' && { backgroundColor: theme.card }]}
            onPress={() => setActiveTab('Discover')}
          >
            <Text style={[styles.switchText, { color: activeTab === 'Discover' ? theme.text : theme.subText }]}>Discover</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.switchBtn, activeTab === 'Library' && { backgroundColor: theme.card }]}
            onPress={() => setActiveTab('Library')}
          >
            <Text style={[styles.switchText, { color: activeTab === 'Library' ? theme.text : theme.subText }]}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'Discover' ? renderDiscover() : renderLibrary()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 15 },
  switchContainer: { flexDirection: 'row', borderRadius: 10, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  switchText: { fontWeight: '600' },
  content: { flex: 1, marginTop: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginLeft: 20 },
  headerContainer: { paddingHorizontal: 15, paddingBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 45, borderRadius: 12, marginBottom: 10 },
  input: { flex: 1, marginLeft: 10, fontSize: 16 },
  sectionContainer: { marginBottom: 20 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  gridItemWrapper: { width: '33.33%', padding: 5, marginBottom: 10 },
  gridItem: { flex: 1, alignItems: 'center' }, 
  imageContainer: { width: '100%', position: 'relative', marginBottom: 5 },
  poster: { width: '100%', aspectRatio: 0.7, borderRadius: 8 },
  mangaTitle: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statusBadge: { position: 'absolute', top: 5, right: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, zIndex: 10 },
  statusText: { color: 'white', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
  
  favBtn: { position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 20, zIndex: 10 },
  groupContainer: { borderRadius: 12, marginBottom: 15, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  groupPoster: { width: 50, height: 70, borderRadius: 5, backgroundColor: '#333' },
  groupTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 10, borderBottomWidth: 0.5, borderBottomColor: '#333' },
  chapterText: { flex: 1, fontSize: 14, marginLeft: 5 }
});