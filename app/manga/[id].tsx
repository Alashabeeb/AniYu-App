import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ✅ Added AsyncStorage
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DocumentSnapshot } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, Image,
    Linking,
    Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';
import { downloadChapterToFile, getMangaDownloads } from '../../services/downloadService';
import { getMangaHistory } from '../../services/historyService';
import {
    addMangaReview,
    getMangaChapters,
    getMangaDetails,
    incrementMangaView
} from '../../services/mangaService';

const SOCIAL_LINKS = [
    { id: 'mail', icon: 'mail', url: 'mailto:partnerships@aniyu.com', color: '#EA4335' },
    { id: 'twitter', icon: 'logo-twitter', url: 'https://twitter.com/aniyu_app', color: '#1DA1F2' },
    { id: 'linkedin', icon: 'logo-linkedin', url: 'https://linkedin.com/company/aniyu', color: '#0A66C2' },
    { id: 'whatsapp', icon: 'logo-whatsapp', url: 'https://wa.me/1234567890', color: '#25D366' },
];

export default function MangaDetailScreen() {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const router = useRouter(); 
  
  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [downloadedChapters, setDownloadedChapters] = useState<string[]>([]);
  const [readChapters, setReadChapters] = useState<string[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);

  const [activeTab, setActiveTab] = useState('Overview');

  useFocusEffect(useCallback(() => { if (id) loadStatus(); }, [id]));
  useFocusEffect(useCallback(() => { if(id) loadData(); }, [id]));

  const loadStatus = async () => {
      const dls = await getMangaDownloads();
      const myDls = dls.filter(d => String(d.mal_id) === String(id));
      setDownloadedChapters(myDls.map(d => String(d.episodeId)));
      const hist = await getMangaHistory();
      const myHist = hist.filter(h => String(h.mal_id) === String(id));
      setReadChapters(myHist.map(h => String(h.chapterId)));
  };

  const loadData = async () => {
    try {
      if(!manga) setLoading(true); 
      const details = await getMangaDetails(id as string);
      setManga(details);

      const chapData = await getMangaChapters(id as string, null);
      setChapters(chapData.data);
      setLastVisible(chapData.lastVisible);
      if (chapData.data.length < 50) setHasMore(false);

      checkAndIncrementView();
    } catch (error) { 
        console.log("Error loading data", error);
    } finally { setLoading(false); }
  };

  const handleLoadMore = async () => {
      if (!hasMore || loadingMore || !lastVisible) return;
      setLoadingMore(true);
      const more = await getMangaChapters(id as string, lastVisible);
      if (more.data.length > 0) {
          setChapters(prev => [...prev, ...more.data]);
          setLastVisible(more.lastVisible);
      } else {
          setHasMore(false);
      }
      setLoadingMore(false);
  };

  // ✅ COST SAVER 3: Replaced expensive Firestore reads with free local cache
  const checkAndIncrementView = async () => {
      const user = auth.currentUser;
      if (!user || !id) return;
      
      const localKey = `viewed_manga_${user.uid}_${id}`;
      try {
          const hasViewedLocally = await AsyncStorage.getItem(localKey);
          
          if (!hasViewedLocally) {
              await AsyncStorage.setItem(localKey, 'true');
              await incrementMangaView(id as string);
          }
      } catch (e) {
          console.log("View track error", e);
      }
  };

  const submitReview = async () => {
      if (userRating === 0) return Alert.alert("Rate First", "Please tap the stars to rate.");
      const user = auth.currentUser;
      if (!user) return Alert.alert("Login Required", "You must be logged in to rate.");
      setSubmittingReview(true);
      await addMangaReview(id as string, user.uid, user.displayName || 'User', userRating);
      setSubmittingReview(false);
      setModalVisible(false);
      Alert.alert("Thank you!", "Your rating has been saved.");
  };

  const performDownload = async (chapter: any) => {
      const fileUrl = chapter.pages?.[0];
      if (!fileUrl) return Alert.alert("Error", "No file to download.");
      const chId = String(chapter.id || chapter.number);
      setDownloadingIds(prev => [...prev, chId]);
      try {
          await downloadChapterToFile(manga, { id: chId, number: chapter.number, title: chapter.title, url: fileUrl });
          setDownloadedChapters(prev => [...prev, chId]);
      } catch (e) { Alert.alert("Error", "Download failed."); }
      finally { setDownloadingIds(prev => prev.filter(id => id !== chId)); }
  };

  const handleDownload = (chapter: any) => {
      const chId = String(chapter.id || chapter.number);
      if (downloadedChapters.includes(chId)) return; 
      performDownload(chapter);
  };

  const handleReadChapter = (chapter: any) => {
      const chId = String(chapter.id || chapter.number);
      const fileUrl = chapter.pages?.[0];

      if (!fileUrl) { Alert.alert("Error", "Chapter file not available."); return; }
      
      router.push({
          pathname: '/chapter-read', 
          params: {
              url: fileUrl, 
              title: `${manga.title} - ${chapter.title || 'Chapter ' + chapter.number}`,
              mangaId: manga.mal_id, 
              chapterId: chId,
              chapterNum: chapter.number
          }
      });
  };

  const openSocial = (url: string) => {
      Linking.openURL(url).catch(err => console.error("Couldn't open link", err));
  };

  if (loading && !manga) return <View style={[styles.loading, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={theme.tint} /></View>;
  if (!manga) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerTitle: '', headerTransparent: true, headerTintColor: 'white' }} />
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1 }}>
        
        <View style={styles.headerContainer}>
            <Image source={{ uri: manga.images?.jpg?.image_url || manga.coverUrl }} style={styles.heroPoster} resizeMode="cover" />
            <View style={styles.headerOverlay} />
            <View style={styles.headerContent}>
                <Image source={{ uri: manga.images?.jpg?.image_url || manga.coverUrl }} style={styles.smallPoster} />
                <View style={{flex: 1, justifyContent:'flex-end'}}>
                    <Text style={[styles.title, { color: 'white' }]}>{manga.title}</Text>
                    <Text style={{ color: '#ccc', fontSize: 13 }}>{manga.type || 'Manga'}</Text>
                </View>
            </View>
        </View>

        <View style={[styles.tabBar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            {['Overview', 'Chapters'].map(tab => (
                <TouchableOpacity 
                    key={tab} 
                    style={[styles.tabItem, activeTab === tab && { borderBottomColor: theme.tint }]}
                    onPress={() => setActiveTab(tab)}
                >
                    <Text style={[styles.tabText, { color: activeTab === tab ? theme.tint : theme.subText }]}>{tab}</Text>
                </TouchableOpacity>
            ))}
        </View>

        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 20 }}>
            {activeTab === 'Overview' && (
                <View style={styles.detailsContainer}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Synopsis</Text>
                    <Text style={[styles.synopsis, { color: theme.subText }]}>{manga.synopsis}</Text>
                    
                    <View style={[styles.statsGrid, { backgroundColor: theme.card }]}>
                        <TouchableOpacity style={styles.statBox} onPress={() => setModalVisible(true)}>
                            <Text style={{ color: theme.subText }}>Rating</Text>
                            <Text style={[styles.val, { color: theme.text }]}>{manga.score ? Number(manga.score).toFixed(1) : 'N/A'}</Text>
                        </TouchableOpacity>
                        <View style={styles.statBox}>
                            <Text style={{ color: theme.subText }}>Chapters</Text>
                            <Text style={[styles.val, { color: theme.text }]}>{manga.totalChapters || chapters.length || '?'}</Text>
                        </View>
                    </View>
                    
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 15 }}>
                        {manga.genres?.map((g: string) => (
                            <View key={g} style={{ backgroundColor: theme.card, padding: 6, borderRadius: 6, marginRight: 8, marginBottom: 8 }}>
                                <Text style={{ color: theme.subText, fontSize: 12 }}>{g}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {activeTab === 'Chapters' && (
                <View>
                    {manga.hasReadingRights === false ? (
                        <View style={[styles.noLicenseContainer, { backgroundColor: theme.card }]}>
                            <Ionicons name="lock-closed" size={40} color={theme.subText} style={{ marginBottom: 15 }} />
                            <Text style={[styles.noLicenseTitle, { color: theme.text }]}>
                                Content Unavailable
                            </Text>
                            <Text style={[styles.noLicenseText, { color: theme.subText }]}>
                                We currently do not hold the reading rights or licensing to provide chapters for this manga.
                            </Text>
                            <Text style={[styles.noLicenseText, { color: theme.subText, marginTop: 10 }]}>
                                If you are a licensor or know how we can acquire these rights, your assistance would be greatly appreciated!
                            </Text>
                            
                            <View style={styles.socialRow}>
                                {SOCIAL_LINKS.map(link => (
                                    <TouchableOpacity 
                                        key={link.id} 
                                        style={[styles.socialBtn, { backgroundColor: link.color + '20' }]} 
                                        onPress={() => openSocial(link.url)}
                                    >
                                        <Ionicons name={link.icon as any} size={22} color={link.color} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 20 }]}>Chapters</Text>
                            </View>
                            
                            <View style={styles.chapterList}>
                                {chapters.map((ch) => {
                                    const chId = String(ch.id || ch.number);
                                    const isRead = readChapters.includes(chId);
                                    return (
                                        <View key={chId} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                                            <TouchableOpacity style={[styles.chapterCard, { backgroundColor: theme.card, flex: 1 }]} onPress={() => handleReadChapter(ch)}>
                                                <View>
                                                    <Text style={[styles.chapterNum, { color: isRead ? theme.subText : theme.tint }]}>
                                                        Chapter {ch.number} {isRead && '✓'}
                                                    </Text>
                                                    <Text numberOfLines={1} style={[styles.chapterTitle, { color: theme.subText }]}>{ch.title}</Text>
                                                </View>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => handleDownload(ch)} style={{padding: 10}}>
                                                <Ionicons name={downloadedChapters.includes(chId) ? "checkmark-circle" : "download-outline"} size={24} color={downloadedChapters.includes(chId) ? "#10b981" : theme.subText} />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                                
                                {hasMore && (
                                    <TouchableOpacity 
                                        onPress={handleLoadMore} 
                                        style={{ padding: 15, alignItems: 'center', backgroundColor: theme.card, borderRadius: 8, marginTop: 10 }}
                                    >
                                        {loadingMore ? <ActivityIndicator color={theme.tint} /> : <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Load More Chapters</Text>}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}
                </View>
            )}
        </ScrollView>
        
        <Modal
            animationType="fade"
            transparent={true}
            visible={modalVisible}
            onRequestClose={() => setModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Rate this Manga</Text>
                    <View style={styles.starRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity key={star} onPress={() => setUserRating(star)}>
                                <Ionicons name={userRating >= star ? "star" : "star-outline"} size={36} color="#FFD700" style={{ marginHorizontal: 5 }} />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text style={{ color: theme.subText }}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity onPress={submitReview} style={[styles.submitBtn, { backgroundColor: theme.tint }]}>
                            {submittingReview ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>Submit</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { width: '100%', height: 300, position: 'relative' },
  heroPoster: { width: '100%', height: '100%' },
  headerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  headerContent: { position: 'absolute', bottom: 20, left: 20, right: 20, flexDirection: 'row', gap: 15 },
  smallPoster: { width: 100, height: 150, borderRadius: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
  
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 10 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 15, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontWeight: 'bold', fontSize: 14 },
  
  contentScroll: { flex: 1 },
  detailsContainer: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  synopsis: { fontSize: 15, lineHeight: 24, marginBottom: 20 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderRadius: 8, marginBottom: 20 },
  statBox: { alignItems: 'center' },
  val: { fontWeight: 'bold', fontSize: 16 },
  sectionHeader: { marginTop: 10, marginBottom: 10 },
  chapterList: { padding: 20, paddingTop: 0 },
  chapterCard: { padding: 15, borderRadius: 10 },
  chapterNum: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  chapterTitle: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalContent: { padding: 25, borderRadius: 16, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  starRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 25 },
  modalButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', gap: 15 },
  cancelBtn: { padding: 12, flex: 1, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  submitBtn: { padding: 12, flex: 1, alignItems: 'center', borderRadius: 8 },

  noLicenseContainer: { margin: 20, padding: 30, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  noLicenseTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  noLicenseText: { textAlign: 'center', lineHeight: 22, fontSize: 14 },
  socialRow: { flexDirection: 'row', marginTop: 25, gap: 15 },
  socialBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center' }
});