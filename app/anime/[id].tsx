import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { arrayUnion, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Image,
    Linking,
    Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';

import {
    addAnimeComment,
    addAnimeReview,
    getAnimeDetails,
    getAnimeEpisodes,
    getAnimeRank,
    getSimilarAnime,
    getUserReaction,
    incrementAnimeView,
    toggleAnimeReaction
} from '../../services/animeService';

import {
    downloadEpisodeToFile,
    getLocalEpisodeUri,
    isDownloading,
    registerDownloadListener,
    removeDownload,
    unregisterDownloadListener
} from '../../services/downloadService';
import { getContinueWatching, saveWatchProgress } from '../../services/historyService';

const RANKS = [
    { name: 'GENIN', min: 0, max: 4 },       
    { name: 'CHUNIN', min: 5, max: 19 },      
    { name: 'JONIN', min: 20, max: 49 },      
    { name: 'ANBU', min: 50, max: 99 },       
    { name: 'KAGE', min: 100, max: Infinity },
];

const SOCIAL_LINKS = [
    { id: 'mail', icon: 'mail', url: 'mailto:partnerships@aniyu.com', color: '#EA4335' },
    { id: 'twitter', icon: 'logo-twitter', url: 'https://twitter.com/aniyu_app', color: '#1DA1F2' },
    { id: 'linkedin', icon: 'logo-linkedin', url: 'https://linkedin.com/company/aniyu', color: '#0A66C2' },
    { id: 'whatsapp', icon: 'logo-whatsapp', url: 'https://wa.me/1234567890', color: '#25D366' },
];

export default function AnimeDetailScreen() {
  const { id, episodeId } = useLocalSearchParams();
  const { theme } = useTheme();
  const router = useRouter();
  
  const [anime, setAnime] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [similarAnime, setSimilarAnime] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview'); 
  
  const [rank, setRank] = useState<number | string>('N/A');

  const [modalVisible, setModalVisible] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [userReaction, setUserReaction] = useState<'like' | 'dislike' | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);

  const [downloadedEpIds, setDownloadedEpIds] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({}); 
  const [watchedEpisodeIds, setWatchedEpisodeIds] = useState<string[]>([]);
  const [currentEpId, setCurrentEpId] = useState<string | null>(null);
  const [currentVideoSource, setCurrentVideoSource] = useState<string | null>(null);

  const resumeTimeRef = useRef<number | null>(null);

  const player = useVideoPlayer(currentVideoSource, player => { 
      player.loop = false; 
  });

  useFocusEffect(
    useCallback(() => {
      if (!loading && currentVideoSource && player) {
          try {
            player.play();
          } catch(e) {}
      }
      return () => {
          try {
              if (player) player.pause();
          } catch (e) {}
      };
    }, [loading, currentVideoSource, player])
  );

  useEffect(() => {
      const checkHistory = async () => {
          if (!anime || !currentEpId) return;
          const history = await getContinueWatching();
          const savedItem = history.find(h => String(h.mal_id) === String(anime.mal_id));
          if (savedItem && String(savedItem.episodeId) === String(currentEpId)) {
              resumeTimeRef.current = savedItem.progress;
          } else {
              resumeTimeRef.current = null;
          }
      };
      checkHistory();
  }, [anime, currentEpId]);

  useEffect(() => {
      const fetchWatchedStatus = async () => {
          const user = auth.currentUser;
          if (!user || !anime) return;
          try {
              const progressRef = doc(db, 'users', user.uid, 'anime_progress', String(anime.mal_id));
              const snap = await getDoc(progressRef);
              if (snap.exists()) {
                  const data = snap.data();
                  if (data.watchedEpisodes) setWatchedEpisodeIds(data.watchedEpisodes);
              }
          } catch (e) { console.log(e); }
      };
      if (anime) fetchWatchedStatus();
  }, [anime]);

  useEffect(() => {
      if (player && resumeTimeRef.current !== null) {
          const timer = setTimeout(() => {
              if(resumeTimeRef.current) {
                  player.currentTime = resumeTimeRef.current;
                  resumeTimeRef.current = null;
              }
          }, 800); 
          return () => clearTimeout(timer);
      }
  }, [player, currentVideoSource]);

  const saveCurrentProgress = useCallback(async () => {
      if (!anime || !currentEpId || !player) return;
      const activeEp = episodes.find(e => String(e.mal_id) === currentEpId);
      
      if (activeEp && player.currentTime > 5) {
          await saveWatchProgress(anime, { ...activeEp, id: currentEpId }, player.currentTime, player.duration || 0);
      }
  }, [anime, currentEpId, episodes, player]);

  useEffect(() => {
      if (!currentEpId || !anime || !player) return;

      const subscription = player.addListener('playingChange', (isPlaying) => {
          if (!isPlaying) {
              saveCurrentProgress();
          }
      });

      const heartbeat = setInterval(() => {
          if (player.playing) {
              saveCurrentProgress();
          }
      }, 60000); 

      return () => {
          saveCurrentProgress();
          clearInterval(heartbeat);
          subscription.remove();
      };
  }, [player, currentEpId, anime, episodes, saveCurrentProgress]);

  useEffect(() => {
    if (currentVideoSource && !loading) {
      player.replace(currentVideoSource);
    }
  }, [currentVideoSource, loading]);

  useEffect(() => {
      const subscription = player.addListener('playToEnd', () => handleVideoFinished());
      return () => subscription.remove();
  }, [player]);

  const handleVideoFinished = async () => {
      const user = auth.currentUser;
      if (!user || !anime || !currentEpId) return;
      try {
          const activeEp = episodes.find(e => String(e.mal_id) === currentEpId);
          if (activeEp) {
             await saveWatchProgress(anime, { ...activeEp, id: currentEpId }, player.duration, player.duration || 0);
          }

          const progressRef = doc(db, 'users', user.uid, 'anime_progress', String(anime.mal_id));
          await setDoc(progressRef, {
              watchedEpisodes: arrayUnion(currentEpId),
              totalEpisodes: anime.totalEpisodes || episodes.length 
          }, { merge: true });
          setWatchedEpisodeIds(prev => !prev.includes(currentEpId) ? [...prev, currentEpId] : prev);
          
          const progressSnap = await getDoc(progressRef);
          if (progressSnap.exists()) {
              const data = progressSnap.data();
              if ((data.watchedEpisodes?.length || 0) >= (data.totalEpisodes || 0) && !data.isCompleted) {
                  await updateDoc(progressRef, { isCompleted: true });
                  const userRef = doc(db, 'users', user.uid);
                  await updateDoc(userRef, { completedAnimeCount: increment(1) });
                  const userSnap = await getDoc(userRef);
                  if (userSnap.exists()) {
                      const score = userSnap.data().completedAnimeCount || 0;
                      const newRank = RANKS.find(r => score >= r.min && score <= r.max)?.name || "GENIN";
                      if (userSnap.data().rank !== newRank) {
                          await updateDoc(userRef, { rank: newRank });
                          Alert.alert("🎉 RANK PROMOTION!", `You are now a ${newRank}!`);
                      }
                  }
              }
          }
      } catch (error) { console.log(error); }
  };

  useEffect(() => {
    if (episodeId) { 
        setCurrentEpId(episodeId as string); 
        setActiveTab('Overview'); 
    }
  }, [episodeId]);

  useEffect(() => { 
      if (id) {
          loadAllData();
          checkAndIncrementView();
      } 
  }, [id]);

  useEffect(() => {
    const loadSimilar = async () => {
      if (activeTab === 'Similar' && similarAnime.length === 0 && anime?.genres) {
        try {
          const similar = await getSimilarAnime(anime.genres, id as string);
          setSimilarAnime(similar);
        } catch (error) {
          console.error("Error loading similar anime:", error);
        }
      }
    };
    loadSimilar();
  }, [activeTab, anime?.genres, id]);

  useEffect(() => {
      const determineSource = async () => {
          if (!currentEpId) return;
          const localUri = await getLocalEpisodeUri(currentEpId);
          if (localUri) setCurrentVideoSource(localUri);
          else {
              const activeEpisode = episodes.find(e => String(e.mal_id) === currentEpId);
              if (activeEpisode?.url) setCurrentVideoSource(activeEpisode.url);
          }
      };
      determineSource();
  }, [currentEpId, episodes, downloadedEpIds]); 

  // ✅ COST SAVER 3: Replaced expensive Firestore reads with free local cache
  const checkAndIncrementView = async () => {
      const user = auth.currentUser;
      if (!user || !id) return;
      
      const localKey = `viewed_anime_${user.uid}_${id}`;
      try {
          const hasViewedLocally = await AsyncStorage.getItem(localKey);
          
          if (!hasViewedLocally) {
              await AsyncStorage.setItem(localKey, 'true');
              await incrementAnimeView(id as string);
          }
      } catch (e) {
          console.log("View track error", e);
      }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [detailsData, episodesData] = await Promise.all([
        getAnimeDetails(id as string),
        getAnimeEpisodes(id as string)
      ]);
      setAnime(detailsData);
      setEpisodes(episodesData);
      
      const animeData = detailsData as any; 
      
      if(animeData) {
          setLikesCount(animeData.likes || 0);
          setDislikesCount(animeData.dislikes || 0);
      }

      const user = auth.currentUser;
      if(user && id) {
          const reaction = await getUserReaction(id as string, user.uid);
          setUserReaction(reaction);
      }

      if (animeData?.views !== undefined) {
          const calculatedRank = await getAnimeRank(animeData.views);
          setRank(calculatedRank);
      }

      const ids: string[] = [];
      for (const ep of episodesData) {
          const localUri = await getLocalEpisodeUri(ep.mal_id);
          if (localUri) ids.push(String(ep.mal_id));
      }
      setDownloadedEpIds(ids);

      episodesData.forEach(ep => {
          const epId = String(ep.mal_id);
          if (isDownloading(epId)) {
              setDownloadProgress(prev => ({ ...prev, [epId]: 0.01 }));
              registerDownloadListener(epId, (p) => {
                  setDownloadProgress(prev => ({ ...prev, [epId]: p }));
                  if (p >= 1) {
                      setDownloadedEpIds(prev => [...prev, epId]);
                      setDownloadProgress(prev => { const n={...prev}; delete n[epId]; return n; });
                      unregisterDownloadListener(epId);
                  }
              });
          }
      });

    } catch (error) { console.error(error); } 
    finally { setLoading(false); }
  };

  const handleReaction = async (type: 'like' | 'dislike') => {
      const user = auth.currentUser;
      if (!user) return Alert.alert("Login Required", "Please login to interact.");
      
      const oldReaction = userReaction;
      let newLikes = likesCount;
      let newDislikes = dislikesCount;

      if (oldReaction === type) {
          setUserReaction(null);
          if(type === 'like') newLikes--;
          else newDislikes--;
      } else {
          setUserReaction(type);
          if(type === 'like') {
              newLikes++;
              if(oldReaction === 'dislike') newDislikes--;
          } else {
              newDislikes++;
              if(oldReaction === 'like') newLikes--;
          }
      }
      
      setLikesCount(newLikes);
      setDislikesCount(newDislikes);

      await toggleAnimeReaction(id as string, user.uid, type);
  };

  const handleEpisodePress = (ep: any) => {
    setCurrentEpId(String(ep.mal_id));
  };

  const performDownload = async (ep: any) => {
      const epId = String(ep.mal_id);
      try {
        setDownloadProgress(prev => ({ ...prev, [epId]: 0.01 }));
        registerDownloadListener(epId, (progress) => {
             setDownloadProgress(prev => ({ ...prev, [epId]: progress }));
        });

        const localUri = await downloadEpisodeToFile(anime, ep);

        if (localUri) {
            setDownloadedEpIds(prev => [...prev, epId]);
            setDownloadProgress(prev => {
                const newState = { ...prev };
                delete newState[epId]; 
                return newState;
            });
            unregisterDownloadListener(epId);

            const user = auth.currentUser;
            if (user) {
                const userDownloadRef = doc(db, 'users', user.uid, 'downloaded_episodes', epId);
                const snap = await getDoc(userDownloadRef);
                if (!snap.exists()) {
                    await setDoc(userDownloadRef, { downloadedAt: serverTimestamp() });
                    const epRef = doc(db, 'anime', String(anime.mal_id), 'episodes', epId);
                    await updateDoc(epRef, { downloads: increment(1) });
                }
            }
        }
    } catch (e) {
        Alert.alert("Error", "Download failed.");
        setDownloadProgress(prev => { const n = { ...prev }; delete n[epId]; return n; });
        unregisterDownloadListener(epId);
    }
  };

  const handleDownload = async (ep: any) => {
    const epId = String(ep.mal_id);

    if (downloadedEpIds.includes(epId)) {
        Alert.alert("Delete Download?", "Remove this episode from offline storage?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => {
                await removeDownload(epId);
                setDownloadedEpIds(prev => prev.filter(id => id !== epId));
            }}
        ]);
        return;
    }

    performDownload(ep);
  };

  const submitReview = async () => {
      const user = auth.currentUser;
      if (!user) return Alert.alert("Login Required", "You must be logged in to rate.");

      if (userRating === 0 && commentText.trim() === '') {
          return Alert.alert("Empty", "Please rate or write a comment.");
      }

      setSubmittingReview(true);
      
      if (userRating > 0) {
          await addAnimeReview(id as string, user.uid, user.displayName || 'User', userRating);
      }

      if (commentText.trim() !== '') {
          await addAnimeComment(id as string, user.uid, user.displayName || 'User', commentText);
      }

      setSubmittingReview(false);
      setModalVisible(false);
      setCommentText('');
      setUserRating(0);
      Alert.alert("Sent", "Feedback submitted successfully.");
      loadAllData(); 
  };

  const openSocial = (url: string) => {
      Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const formatSize = (bytes: number) => {
      if (!bytes || bytes === 0) return 'Unknown Size';
      const mb = bytes / (1024 * 1024);
      return mb.toFixed(1) + ' MB';
  };

  if (loading) return <View style={[styles.loading, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={theme.tint} /></View>;
  if (!anime) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1 }}>
        
        <View style={styles.videoContainer}>
            {currentVideoSource ? (
                <VideoView 
                    style={styles.video} 
                    player={player} 
                    allowsPictureInPicture 
                    allowsFullscreen 
                />
            ) : (
                <View style={styles.posterContainer}>
                    <Image source={{ uri: anime.images?.jpg?.image_url }} style={styles.heroPoster} resizeMode="cover" />
                    <View style={styles.posterOverlay}>
                        <Ionicons name="play-circle-outline" size={50} color="white" style={{opacity: 0.8}} />
                        <Text style={{color:'white', fontWeight:'bold', marginTop:5}}>Select an Episode</Text>
                    </View>
                </View>
            )}

            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
        </View>

        <View style={[styles.infoContainer, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>{anime.title}</Text>
            
            <View style={{flexDirection:'row', alignItems:'center', marginBottom: 15, gap: 5}}>
                <Text style={{ color: theme.subText, fontSize: 13 }}>
                    {anime.year || 'N/A'} • {anime.ageRating || 'N/A'} • {anime.type} •
                </Text>
                <Ionicons name="eye-outline" size={14} color={theme.subText} />
                <Text style={{ color: theme.subText, fontSize: 13 }}>{anime.views || 0}</Text>
            </View>

            <View style={styles.tabRow}>
                <TabButton title="Overview" active={activeTab === 'Overview'} onPress={() => setActiveTab('Overview')} theme={theme} />
                <TabButton title="Similar" active={activeTab === 'Similar'} onPress={() => setActiveTab('Similar')} theme={theme} />
            </View>
        </View>

        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 20 }}>
            {activeTab === 'Overview' ? (
                <>
                    <View style={styles.detailsContainer}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Synopsis</Text>
                        <Text style={[styles.synopsis, { color: theme.subText }]}>{anime.synopsis}</Text>
                        
                        <View style={[styles.statsGrid, { backgroundColor: theme.card }]}>
                            <TouchableOpacity style={styles.statBox} onPress={() => setModalVisible(true)}>
                                <Text style={{ color: theme.subText }}>Rating</Text>
                                <View style={{flexDirection:'row', alignItems:'center', gap: 5, marginTop: 4}}>
                                    <View style={{flexDirection:'row', gap: 1}}>
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <Ionicons 
                                                key={s} 
                                                name={Math.round(anime.score || 0) >= (s * 2) ? "star" : "star-outline"} 
                                                size={12} 
                                                color="#FFD700" 
                                            />
                                        ))}
                                    </View>
                                    <Text style={[styles.val, { color: theme.text, fontSize: 13 }]}>
                                        {anime.score ? `${Number(anime.score).toFixed(1)}/5` : 'N/A'}
                                    </Text>
                                </View>
                                <Text style={{fontSize:10, color: theme.tint, marginTop:2}}>Tap to Rate</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.statBox}>
                                <Text style={{ color: theme.subText }}>Episodes</Text>
                                <Text style={[styles.val, { color: theme.text, marginTop: 4 }]}>{anime.totalEpisodes || episodes.length}</Text>
                            </View>
                            
                            <View style={styles.statBox}>
                                <Text style={{ color: theme.subText }}>Rank</Text>
                                <Text style={[styles.val, { color: theme.text, marginTop: 4 }]}>#{rank}</Text>
                            </View>
                        </View>

                        <View style={styles.interactionRow}>
                            <TouchableOpacity style={[styles.interactBtn, { backgroundColor: theme.card }]} onPress={() => handleReaction('like')}>
                                <Ionicons name={userReaction === 'like' ? "thumbs-up" : "thumbs-up-outline"} size={20} color={userReaction === 'like' ? theme.tint : theme.text} />
                                <Text style={{color: theme.text, marginLeft: 6}}>{likesCount}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.interactBtn, { backgroundColor: theme.card }]} onPress={() => handleReaction('dislike')}>
                                <Ionicons name={userReaction === 'dislike' ? "thumbs-down" : "thumbs-down-outline"} size={20} color={userReaction === 'dislike' ? "#FF6B6B" : theme.text} />
                                <Text style={{color: theme.text, marginLeft: 6}}>{dislikesCount}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.interactBtn, { backgroundColor: theme.card }]} onPress={() => setModalVisible(true)}>
                                <Ionicons name="chatbubble-outline" size={20} color={theme.text} />
                                <Text style={{color: theme.text, marginLeft: 6}}>Comment</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20 }]}>Genres</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {anime.genres?.map((g: any) => (
                                <View key={g} style={{ backgroundColor: theme.card, padding: 8, borderRadius: 10, marginRight: 8, marginBottom: 8 }}>
                                    <Text style={{ color: theme.text, fontSize: 12 }}>{g}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {anime.hasStreamingRights === false ? (
                        <View style={[styles.noLicenseContainer, { backgroundColor: theme.card }]}>
                            <Ionicons name="lock-closed" size={40} color={theme.subText} style={{ marginBottom: 15 }} />
                            <Text style={[styles.noLicenseTitle, { color: theme.text }]}>
                                Content Unavailable
                            </Text>
                            <Text style={[styles.noLicenseText, { color: theme.subText }]}>
                                We currently do not hold the streaming rights or licensing to provide episodes for this anime.
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
                                <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 20, marginBottom: 10 }]}>Episodes ({episodes.length})</Text>
                            </View>
                            <View style={styles.episodeList}>
                                {episodes.map((ep) => {
                                    const epIdStr = String(ep.mal_id);
                                    const isActive = currentEpId === epIdStr;
                                    const isDownloaded = downloadedEpIds.includes(epIdStr);
                                    const isWatched = watchedEpisodeIds.includes(epIdStr); 
                                    const progress = downloadProgress[epIdStr];
                                    const isDownloading = progress !== undefined;

                                    return (
                                        <View key={ep.mal_id} style={styles.epRowWrapper}>
                                            <TouchableOpacity 
                                                style={[styles.epCard, { backgroundColor: theme.card }, isActive && { borderColor: theme.tint, borderWidth: 1 }]}
                                                onPress={() => handleEpisodePress(ep)}
                                            >
                                                <Ionicons name={isActive ? "play" : "play-outline"} size={20} color={isActive ? theme.tint : theme.subText} style={{ marginRight: 10 }} />
                                                <View style={{ flex: 1 }}>
                                                    <View style={{flexDirection:'row', alignItems:'center', gap: 8, marginBottom: 2}}>
                                                        <Text numberOfLines={1} style={[styles.epTitle, { color: isActive ? theme.tint : theme.text, flex: 1 }]}>{ep.title}</Text>
                                                        {isWatched && (
                                                            <View style={{backgroundColor: 'rgba(76, 175, 80, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#4CAF50'}}>
                                                                <Text style={{fontSize: 10, color: '#4CAF50', fontWeight:'bold'}}>Watched</Text>
                                                            </View>
                                                        )}
                                                    </View>

                                                    <View style={{flexDirection:'row', alignItems:'center', gap: 5}}>
                                                        <Text style={{ color: theme.subText, fontSize: 12 }}>
                                                            {ep.aired ? new Date(ep.aired).toLocaleDateString() : 'Ep ' + ep.number}
                                                        </Text>
                                                        <Text style={{ color: theme.subText, fontSize: 12 }}>• {formatSize(ep.size)}</Text>
                                                        {isDownloaded && <Text style={{ color: theme.tint, fontSize: 10, fontWeight: 'bold' }}> • Downloaded</Text>}
                                                    </View>
                                                </View>
                                            </TouchableOpacity>

                                            <View style={styles.actionContainer}>
                                                {isDownloading ? (
                                                    <View style={styles.progressWrapper}>
                                                        <Text style={{fontSize: 9, color: theme.tint, marginBottom: 2, textAlign:'center'}}>{Math.round(progress * 100)}%</Text>
                                                        <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                                                            <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: theme.tint }]} />
                                                        </View>
                                                    </View>
                                                ) : (
                                                    <TouchableOpacity 
                                                        style={[styles.downloadBtn, { backgroundColor: theme.card }]} 
                                                        onPress={() => handleDownload(ep)}
                                                    >
                                                        <Ionicons 
                                                            name={isDownloaded ? "checkmark-done-circle" : "download-outline"} 
                                                            size={22} 
                                                            color={isDownloaded ? "#4CAF50" : theme.subText} 
                                                        />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </>
                    )}
                </>
            ) : (
                <View style={styles.similarContainer}>
                    {similarAnime.length > 0 ? (
                        <View style={styles.grid}>
                            {similarAnime.map((item) => (
                                <TouchableOpacity 
                                    key={item.mal_id} 
                                    style={[styles.similarCard, { backgroundColor: theme.card }]}
                                    onPress={() => router.push(`/anime/${item.mal_id}`)}
                                >
                                    <Image source={{ uri: item.images?.jpg?.image_url }} style={styles.similarPoster} />
                                    <Text numberOfLines={2} style={[styles.similarTitle, { color: theme.text }]}>{item.title}</Text>
                                    <Text style={{ color: theme.subText, fontSize: 10 }}>{item.type} • {item.score ? Number(item.score).toFixed(1) : 'N/A'}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            {activeTab === 'Similar' && similarAnime.length === 0 ? (
                                <ActivityIndicator color={theme.tint} />
                            ) : (
                                <>
                                    <Ionicons name="film-outline" size={50} color={theme.subText} />
                                    <Text style={{ color: theme.subText, marginTop: 10 }}>No similar anime found.</Text>
                                </>
                            )}
                        </View>
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
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Rate & Comment</Text>
                    
                    <View style={styles.starRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity key={star} onPress={() => setUserRating(star)}>
                                <Ionicons 
                                    name={userRating >= star ? "star" : "star-outline"} 
                                    size={36} 
                                    color="#FFD700" 
                                    style={{ marginHorizontal: 5 }}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput 
                        style={[styles.commentInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        placeholder="Write a comment (Admin only view)..."
                        placeholderTextColor={theme.subText}
                        value={commentText}
                        onChangeText={setCommentText}
                        multiline
                        numberOfLines={3}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                            <Text style={{ color: theme.subText }}>Cancel</Text>
                        </TouchableOpacity>
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

function TabButton({ title, active, onPress, theme }: any) {
    return (
        <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && { borderBottomColor: theme.tint, borderBottomWidth: 2 }]}>
            <Text style={{ color: active ? theme.tint : theme.subText, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoContainer: { width: '100%', height: 250, backgroundColor: 'black', position: 'relative' },
  video: { width: '100%', height: '100%' },
  posterContainer: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  heroPoster: { width: '100%', height: '100%' },
  posterOverlay: { 
      position: 'absolute', 
      backgroundColor: 'rgba(0,0,0,0.4)', 
      width: '100%', height: '100%', 
      justifyContent: 'center', alignItems: 'center' 
  },
  
  backButton: {
      position: 'absolute',
      top: 50, 
      left: 20,
      zIndex: 10,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 20,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center'
  },

  infoContainer: { padding: 16, paddingBottom: 0, borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
  meta: { fontSize: 13, marginBottom: 15 },
  tabRow: { flexDirection: 'row', marginTop: 5 },
  tabBtn: { marginRight: 20, paddingBottom: 10 },
  contentScroll: { flex: 1 },
  
  episodeList: { padding: 16, paddingTop: 0 },
  epRowWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  epCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8 },
  epTitle: { fontWeight: '600', fontSize: 15, marginBottom: 0 }, 
  actionContainer: { marginLeft: 10, width: 50, alignItems: 'center', justifyContent: 'center' },
  downloadBtn: { width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  progressWrapper: { width: '100%', alignItems: 'center' },
  progressBarBg: { width: 40, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  
  detailsContainer: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  synopsis: { fontSize: 15, lineHeight: 24, marginBottom: 20 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderRadius: 8, marginBottom: 20 },
  statBox: { alignItems: 'center' },
  val: { fontWeight: 'bold', fontSize: 16 },
  sectionHeader: { marginTop: 10 },

  interactionRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  interactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },

  similarContainer: { padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  similarCard: { width: '48%', marginBottom: 16, borderRadius: 8, padding: 8 },
  similarPoster: { width: '100%', height: 150, borderRadius: 6, marginBottom: 8 },
  similarTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalContent: { padding: 25, borderRadius: 16, alignItems: 'center', width:'100%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  starRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  commentInput: { width: '100%', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 20, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', gap: 15 },
  cancelBtn: { padding: 12, flex: 1, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  submitBtn: { padding: 12, flex: 1, alignItems: 'center', borderRadius: 8 },

  noLicenseContainer: { margin: 20, padding: 30, borderRadius: 16, alignItems: 'center' },
  noLicenseTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  noLicenseText: { textAlign: 'center', lineHeight: 22, fontSize: 14 },
  socialRow: { flexDirection: 'row', marginTop: 25, gap: 15 },
  socialBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center' }
});