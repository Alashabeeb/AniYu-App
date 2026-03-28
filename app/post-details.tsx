import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
    addDoc, arrayRemove, arrayUnion,
    collection, deleteDoc, doc,
    getDoc, getDocs,
    increment,
    limit,
    onSnapshot, orderBy,
    query, serverTimestamp, updateDoc,
    where, writeBatch
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
    RefreshControl,
    Share, StyleSheet,
    Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, ViewToken
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
// ✅ IMPORT AD BANNER
import AdBanner from '../components/AdBanner';

// ✅ SURGICAL FIX: Imported appCheck and getToken for security
import { getToken } from 'firebase/app-check';
import { appCheck, auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { sendSocialNotification } from '../services/notificationService';
import { deleteFromR2 } from '../services/r2Storage';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// 🔐 SECURITY: Comment creation now goes through rate-limited Cloud Function
const CREATE_COMMENT_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/createComment";

// 🔐 SECURITY: Report now goes through rate-limited Cloud Function
const CREATE_REPORT_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/createReport";

// 🔐 SECURITY: Max comment length guard
const MAX_COMMENT_CHARS = 300;

const REPORT_REASONS = [
  "Offensive content",
  "Abusive behavior",
  "Spam",
  "Misinformation",
  "Sexual content",
  "Other"
];

const viewedSessionIds = new Set<string>();
const viewedCommentSessionIds = new Set<string>();

const formatCount = (count: number): string => {
    if (!count) return "0";
    if (count < 1000) return count.toString();
    if (count < 1000000) {
        return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
};

export default function PostDetailsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { postId } = useLocalSearchParams(); 
  const user = auth.currentUser;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // ✅ Added for manual comment refresh

  const [loading, setLoading] = useState(true);
  const [postFound, setPostFound] = useState(true);

  // ✅ BUG 3 FIX: Cache user data on mount to prevent getDoc spam
  const [currentUserData, setCurrentUserData] = useState<any>(null);

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const isMountedRef = useRef(true);

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  const videoSource = post?.mediaType === 'video' && post?.mediaUrl ? post.mediaUrl : null;
  const player = useVideoPlayer(videoSource, player => {
      if (videoSource) {
          player.loop = true;
          player.play();
      }
  });

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        try { if (player && videoSource) player.pause(); } catch(e) {}
      };
    }, [player, videoSource])
  );

  const isOwner = post?.userId === user?.uid;
  const authorId = post?.isRepost && post?.originalUserId ? post.originalUserId : post?.userId;
  const isOriginalAuthor = authorId === user?.uid;
  const showMenu = isOwner || !isOriginalAuthor;

  // ✅ BUG 3 FIX: Pre-fetch user data once on mount
  useEffect(() => {
      if (user) {
          getDoc(doc(db, "users", user.uid)).then(docSnap => {
              if (docSnap.exists() && isMountedRef.current) {
                  setCurrentUserData(docSnap.data());
              }
          });
      }
  }, [user]);

  // ✅ BUG 1 FIX: Separate function to fetch comments without live listener
  const fetchComments = async () => {
      if (!postId) return;
      try {
          const q = query(
              collection(db, 'posts'), 
              where('parentId', '==', postId), 
              orderBy('createdAt', 'desc'),
              limit(50) // Safely bounded to 50
          );
          const snapshot = await getDocs(q);
          if (isMountedRef.current) {
              setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
          }
      } catch (error) {
          console.error("Error fetching comments:", error);
      }
  };

  const onRefresh = useCallback(async () => {
      if (!isMountedRef.current) return;
      setRefreshing(true);
      await fetchComments();
      if (isMountedRef.current) setRefreshing(false);
  }, [postId]);

  useEffect(() => {
    if (!postId) {
        setLoading(false);
        setPostFound(false);
        return;
    }
    
    const postUnsub = onSnapshot(doc(db, 'posts', postId as string), (docSnapshot) => {
      if (docSnapshot.exists()) {
          setPost({ id: docSnapshot.id, ...docSnapshot.data() });
          setPostFound(true);
          
          // ✅ BUG 2 FIX: Increment view ONLY if post exists
          const incrementView = async () => {
              const pId = postId as string;
              if (!viewedSessionIds.has(pId)) {
                  viewedSessionIds.add(pId);
                  try {
                      await updateDoc(doc(db, 'posts', pId), { views: increment(1) });
                  } catch (e) { console.log("Error incrementing view", e); }
              }
          };
          incrementView();

      } else {
          setPostFound(false);
      }
      setLoading(false);
    }, (error) => {
        console.error("Error fetching post:", error);
        setPostFound(false);
        setLoading(false);
    });

    // Fetch initial comments once
    fetchComments();

    return () => { postUnsub(); };
  }, [postId]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.forEach((viewToken) => {
          if (viewToken.isViewable && viewToken.item?.id) {
              const commentId = viewToken.item.id;
              if (!viewedCommentSessionIds.has(commentId)) {
                  viewedCommentSessionIds.add(commentId);
              }
          }
      });
  }).current;

  const toggleAction = async (id: string, field: 'likes' | 'reposts', currentArray: string[]) => {
      if (!user) return;
      const ref = doc(db, 'posts', id);
      const isActive = currentArray?.includes(user.uid);
      const countField = field === 'likes' ? 'likeCount' : 'repostCount';

      try {
          await updateDoc(ref, { 
              [field]: isActive ? arrayRemove(user.uid) : arrayUnion(user.uid),
              [countField]: increment(isActive ? -1 : 1)
          });

          if (!isActive) {
              const targetPost = id === post?.id ? post : comments.find(c => c.id === id);
              if (targetPost) {
                  if (field === 'reposts') {
                      await addDoc(collection(db, 'posts'), {
                          isRepost: true,
                          originalPostId: id,
                          userId: user.uid,
                          repostedByUid: user.uid,
                          repostedByName: user.displayName || 'Someone',
                          originalUserId: targetPost.userId,
                          displayName: targetPost.displayName,
                          username: targetPost.username,
                          userAvatar: targetPost.userAvatar,
                          text: targetPost.text || "",
                          mediaUrl: targetPost.mediaUrl || null,
                          mediaType: targetPost.mediaType || null,
                          tags: targetPost.tags || [],
                          parentId: null, 
                          createdAt: serverTimestamp(),
                          likes: [], likeCount: 0,
                          reposts: [], repostCount: 0,
                          commentCount: 0,
                          views: 0,
                          role: targetPost.role || 'user'
                      });
                      sendSocialNotification(targetPost.userId, 'repost', { uid: user.uid, name: user.displayName || 'User', avatar: user.photoURL || '' }, '', id).catch(()=>console.log("Silent notif error"));
                  } else if (field === 'likes' && targetPost.userId !== user.uid) {
                      sendSocialNotification(targetPost.userId, 'like', { uid: user.uid, name: user.displayName || 'User', avatar: user.photoURL || '' }, '', id).catch(()=>console.log("Silent notif error"));
                  }
              }
          } else {
              if (field === 'reposts') {
                  const q = query(
                      collection(db, 'posts'),
                      where('isRepost', '==', true),
                      where('originalPostId', '==', id),
                      where('repostedByUid', '==', user.uid)
                  );
                  const querySnapshot = await getDocs(q);
                  if (!querySnapshot.empty) {
                      const batch = writeBatch(db);
                      querySnapshot.forEach((docSnapshot) => {
                          batch.delete(doc(db, 'posts', docSnapshot.id));
                      });
                      await batch.commit();
                  }
              }
          }
      } catch (error: any) {
          console.error("Action error:", error);
          const errorMessage = error.message?.includes('permission') 
              ? 'Security block: Action reverted. Ensure rules allow this update.' 
              : 'Network error. Try again.';
          showAlert('error', 'Action Failed', errorMessage);
      }
  };

  const handleShare = async (item: any) => {
      try {
          const itemUrl = Linking.createURL('post-details', { queryParams: { postId: item.id } });
          await Share.share({
              message: `Check out what ${item.displayName || item.username} said on AniYu!\n\n${item.text ? `"${item.text}"\n\n` : ''}${itemUrl}`,
              url: itemUrl 
          });
      } catch (error) { console.log("Share error", error); }
  };

  const goToDetails = (id: string) => {
      try { if (player && videoSource) player.pause(); } catch(e){}
      router.push({ pathname: '/post-details', params: { postId: id } });
  };

  const handleDelete = () => {
      setMenuVisible(false);
      Alert.alert("Delete Post", "Are you sure you want to delete this post permanently?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => {
              try {
                  if (!post.isRepost && post.mediaUrl) {
                      await deleteFromR2(post.mediaUrl);
                  }

                  if (post.pinned && user) {
                      await updateDoc(doc(db, 'users', user.uid), { pinnedPostId: null });
                  }

                  if (post?.parentId) {
                      const batch = writeBatch(db);
                      batch.delete(doc(db, "posts", postId as string));
                      batch.update(doc(db, "posts", post.parentId), { commentCount: increment(-1) });
                      await batch.commit();
                  } else {
                      await deleteDoc(doc(db, "posts", postId as string));
                  }
                  
                  router.back();
              } catch (error: any) {
                  console.error("Delete Error:", error);
                  showAlert('error', 'Delete Failed', error.message || 'Could not delete this post.');
              }
          }}
      ]);
  };

  const handleBlockUser = async () => {
      if (!user || !post || isOwner || isOriginalAuthor) return;
      setMenuVisible(false);
      Alert.alert("Block User", `Are you sure you want to block @${post.username}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Block", 
              style: "destructive", 
              onPress: async () => {
                  try {
                      await updateDoc(doc(db, 'users', user.uid), {
                          blockedUsers: arrayUnion(authorId)
                      });
                      showAlert('success', 'User Blocked', `You have blocked @${post.username}.`);
                      router.back();
                  } catch (e) {
                      showAlert('error', 'Block Failed', getFriendlyErrorMessage(e));
                  }
              }
          }
      ]);
  };

  const submitReport = async (reason: string) => {
      if (!user) return;
      setReportLoading(true);
      try {
        const idToken = await user.getIdToken();
        const appCheckTokenResponse = await getToken(appCheck, false); // ✅ Grab VIP Pass

        const response = await fetch(CREATE_REPORT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${idToken}`,
                'X-Firebase-AppCheck': appCheckTokenResponse.token // ✅ Inject VIP Pass
            },
            body: JSON.stringify({ type: 'post', targetId: postId, targetContent: post?.text || 'media', userId: authorId, reason })
        });
        if (response.status === 429) {
            showAlert('warning', 'Slow Down', 'You are reporting too fast. Please wait.');
            return;
        }
        setReportModalVisible(false);
        showAlert('success', 'Report Submitted', 'Thank you for keeping our community safe. We will review this shortly.');
      } catch (error) {
        showAlert('error', 'Submission Failed', getFriendlyErrorMessage(error));
      } finally {
        setReportLoading(false);
      }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !user) return;

    if (newComment.length > MAX_COMMENT_CHARS) {
        return showAlert('warning', 'Too Long', `Comments cannot exceed ${MAX_COMMENT_CHARS} characters.`);
    }

    setSending(true);
    try {
      const userData = currentUserData || {};
      const realUsername = userData.username || user.email?.split('@')[0] || "user"; 
      const realDisplayName = userData.displayName || user.displayName || "Anonymous";
      const realAvatar = userData.avatar || user.photoURL;
      const realRole = userData.role || 'user'; 

      const idToken = await user.getIdToken();
      const appCheckTokenResponse = await getToken(appCheck, false); // ✅ Grab VIP Pass

      const response = await fetch(CREATE_COMMENT_URL, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
              'X-Firebase-AppCheck': appCheckTokenResponse.token // ✅ Inject VIP Pass
          },
          body: JSON.stringify({
              text: newComment,
              parentId: postId,
              displayName: realDisplayName,
              username: realUsername,
              userAvatar: realAvatar,
              role: realRole 
          })
      });

      const result = await response.json();

      if (!response.ok) {
          if (response.status === 429) {
              showAlert('error', '⛔ Slow Down', result.error || 'You are commenting too fast. Please wait.');
          } else {
              showAlert('error', 'Comment Failed', result.error || 'Something went wrong.');
          }
          return;
      }

      if (post && post.userId && post.userId !== user.uid) {
          sendSocialNotification(
              post.userId, 
              'comment', 
              { uid: user.uid, name: realDisplayName, avatar: realAvatar || '' },
              newComment,
              postId as string
          ).catch(e => console.log("Silent Notification Error:", e));
      }

      setNewComment('');
      
      fetchComments();

    } catch (e: any) { 
        console.error(e); 
        if (e.message?.includes("permission-denied")) {
            showAlert('error', '⛔ Blocked', 'You are posting too fast (30s cooldown) or you have been banned.');
        } else {
            showAlert('error', 'Comment Failed', getFriendlyErrorMessage(e));
        }
    } 
    finally { setSending(false); }
  };

  if (loading) {
      return (
          <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="large" color={theme.tint} />
          </SafeAreaView>
      );
  }

  if (!postFound || !post) {
      return (
          <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
              <Stack.Screen options={{ headerShown: false }} />
              <View style={[styles.header, { borderBottomColor: theme.border }]}>
                  <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="arrow-back" size={24} color={theme.text} />
                      <Text style={[styles.headerTitle, { color: theme.text }]}>Back</Text>
                  </TouchableOpacity>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <Ionicons name="document-text-outline" size={64} color={theme.subText} style={{ marginBottom: 15 }} />
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold' }}>Post not found</Text>
                  <Text style={{ color: theme.subText, marginTop: 10, textAlign: 'center' }}>This post may have been deleted by the author.</Text>
              </View>
          </SafeAreaView>
      );
  }

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "now";
    const seconds = Math.floor((new Date().getTime() / 1000) - timestamp.seconds);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds/60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds/3600)}h`;
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  const renderComment = ({ item, index }: { item: any, index: number }) => {
      const isLiked = item.likes?.includes(user?.uid);
      const isReposted = item.reposts?.includes(user?.uid);
      const timeAgo = formatTimeAgo(item.createdAt);
      return (
        <>
        <TouchableOpacity 
            style={[styles.commentItem, { borderBottomColor: theme.border }]}
            onPress={() => goToDetails(item.id)} 
            activeOpacity={0.7}
        >
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/feed-profile', params: { userId: item.userId } }); }}>
                <Image source={{ uri: item.userAvatar }} style={styles.commentAvatar} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
                <View style={[styles.row, { flexWrap: 'wrap' }]}>
                    <Text style={[styles.commentName, { color: theme.text }]} numberOfLines={1}>{item.displayName || item.username}</Text>
                    
                    {(item.role === 'creator' || item.userRole === 'creator') && (
                        <View style={styles.commentGoldenBadge}>
                            <Text style={styles.commentGoldenBadgeText}>C</Text>
                        </View>
                    )}
                    
                    {(item.role === 'moderator' || item.userRole === 'moderator') && (
                        <View style={styles.commentGoldenBadge}>
                            <Text style={styles.commentGoldenBadgeText}>M</Text>
                        </View>
                    )}

                    <Text style={[styles.commentHandle, { color: theme.subText }]} numberOfLines={1}>@{item.username} · {timeAgo}</Text>
                </View>
                
                <Text style={{ color: theme.text, marginTop: 2, marginBottom: 8 }}>{item.text}</Text>
                
                <View style={styles.commentActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => toggleAction(item.id, 'likes', item.likes || [])}>
                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={16} color={isLiked ? "#FF6B6B" : theme.subText} />
                        <Text style={[styles.actionText, { color: theme.subText }]}>{formatCount(item.likeCount || item.likes?.length || 0)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => goToDetails(item.id)}>
                        <Ionicons name="chatbubble-outline" size={16} color={theme.subText} />
                        <Text style={[styles.actionText, { color: theme.subText }]}>{formatCount(item.commentCount || 0)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => toggleAction(item.id, 'reposts', item.reposts || [])}>
                        <Ionicons name="repeat-outline" size={16} color={isReposted ? "#00BA7C" : theme.subText} />
                         <Text style={[styles.actionText, { color: theme.subText }]}>{formatCount(item.repostCount || item.reposts?.length || 0)}</Text>
                    </TouchableOpacity>
                    <View style={styles.actionButton}>
                        <Ionicons name="stats-chart" size={16} color={theme.subText} />
                        <Text style={[styles.actionText, { color: theme.subText }]}>{formatCount(item.views || 0)}</Text>
                    </View>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item)}>
                        <Ionicons name="share-social-outline" size={16} color={theme.subText} />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
        {(index + 1) % 3 === 0 && <AdBanner />}
        </>
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Post</Text>
        </View>
        {showMenu && (
            <TouchableOpacity onPress={() => setMenuVisible(true)}>
                 <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
            </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} 
      >
          <FlatList
            data={comments}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />} // ✅ BUG 1 FIX: Pull to refresh comments
            ListHeaderComponent={() => (
               <View style={[styles.mainPost, { borderBottomColor: theme.border }]}>
                  <View style={styles.row}>
                     <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/feed-profile', params: { userId: post.userId } }); }}>
                         <Image source={{ uri: post.userAvatar }} style={styles.avatar} />
                     </TouchableOpacity>
                     <View style={{ marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.name, { color: theme.text }]}>{post.displayName || post.username}</Text>
                            
                            {(post.role === 'creator' || post.userRole === 'creator') && (
                                <View style={styles.postGoldenBadge}>
                                    <Text style={styles.postGoldenBadgeText}>C</Text>
                                </View>
                            )}
                            
                            {(post.role === 'moderator' || post.userRole === 'moderator') && (
                                <View style={styles.postGoldenBadge}>
                                    <Text style={styles.postGoldenBadgeText}>M</Text>
                                </View>
                            )}
                        </View>

                        <Text style={[styles.handle, { color: theme.subText }]}>@{post.username}</Text>
                     </View>
                  </View>
                  <Text style={[styles.postText, { color: theme.text }]}>{post.text}</Text>
                  
                  {post.mediaUrl && post.mediaType === 'video' && (
                      <Pressable onPress={() => setVideoModalVisible(true)}>
                          <VideoView 
                            player={player} 
                            style={styles.postVideo} 
                            contentFit="cover"
                            allowsPictureInPicture={false}
                            nativeControls={false} 
                          />
                      </Pressable>
                  )}
                  {post.mediaUrl && post.mediaType === 'image' && (
                      <Pressable onPress={() => setImageModalVisible(true)}>
                          <Image source={{ uri: post.mediaUrl }} style={styles.postImage} contentFit="cover" />
                      </Pressable>
                  )}

                  <Text style={{ color: theme.subText, marginTop: 10, fontSize: 12 }}>
                     {post.createdAt?.seconds ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
                  </Text>
                  
                  <View style={[styles.statsRow, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                      <Text style={{ color: theme.subText }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{formatCount(post.likeCount || post.likes?.length || 0)}</Text> Likes</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{formatCount(post.repostCount || post.reposts?.length || 0)}</Text> Reposts</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{formatCount(post.commentCount || 0)}</Text> Comments</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{formatCount(post.views || 0)}</Text> Views</Text>
                  </View>

                  <View style={styles.mainActions}>
                       <TouchableOpacity onPress={() => toggleAction(postId as string, 'likes', post.likes || [])}><Ionicons name={post.likes?.includes(user?.uid)?"heart":"heart-outline"} size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity><Ionicons name="chatbubble-outline" size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity onPress={() => toggleAction(postId as string, 'reposts', post.reposts || [])}><Ionicons name="repeat-outline" size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity onPress={() => handleShare(post)}><Ionicons name="share-social-outline" size={22} color={theme.text} /></TouchableOpacity>
                  </View>
                  <AdBanner />
               </View>
            )}
            renderItem={renderComment}
          />

          <View style={[styles.inputContainer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
              <TextInput
                  style={[styles.input, { color: theme.text, backgroundColor: theme.card }]}
                  placeholder="Post your reply"
                  placeholderTextColor={theme.subText}
                  value={newComment}
                  onChangeText={setNewComment}
                  maxLength={MAX_COMMENT_CHARS}
              />
              <TouchableOpacity onPress={handleSendComment} disabled={!newComment.trim() || sending}>
                  {sending ? <ActivityIndicator color={theme.tint} /> : <Ionicons name="send" size={24} color={theme.tint} />}
              </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
                    {isOwner ? (
                        <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                            <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                            <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Delete Post</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                                <Ionicons name="ban-outline" size={20} color="#FF6B6B" />
                                <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Block @{post?.username}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.menuItem} 
                                onPress={() => { setMenuVisible(false); setReportModalVisible(true); }}
                            >
                                <Ionicons name="flag-outline" size={20} color={theme.text} />
                                <Text style={[styles.menuText, { color: theme.text }]}>Report Post</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                         <Ionicons name="close" size={20} color={theme.text} />
                         <Text style={[styles.menuText, { color: theme.text }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={[styles.reportContainer, { backgroundColor: theme.background }]}>
                <Text style={[styles.reportTitle, { color: theme.text }]}>Report Post</Text>
                <Text style={{ color: theme.subText, marginBottom: 15, textAlign: 'center' }}>Why?</Text>
                {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity 
                        key={reason} 
                        style={[styles.reasonBtn, { borderColor: theme.border }]}
                        onPress={() => submitReport(reason)}
                        disabled={reportLoading}
                    >
                        <Text style={{ color: theme.text }}>{reason}</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.subText} />
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={{ marginTop: 10, padding: 10 }} onPress={() => setReportModalVisible(false)}>
                    <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Cancel</Text>
                </TouchableOpacity>
                {reportLoading && <ActivityIndicator style={{ position: 'absolute' }} size="large" color={theme.tint} />}
            </View>
        </View>
      </Modal>

      <Modal visible={imageModalVisible} transparent={false} animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
        <View style={styles.fullScreenMediaContainer}>
            <TouchableOpacity style={styles.closeMediaBtn} onPress={() => setImageModalVisible(false)}>
                <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {post?.mediaUrl && post?.mediaType === 'image' && (
                <Image source={{ uri: post.mediaUrl }} style={styles.fullScreenMediaItem} contentFit="contain" />
            )}
        </View>
      </Modal>

      <Modal visible={videoModalVisible} transparent={false} animationType="fade" onRequestClose={() => setVideoModalVisible(false)}>
        <View style={styles.fullScreenMediaContainer}>
            <TouchableOpacity style={styles.closeMediaBtn} onPress={() => setVideoModalVisible(false)}>
                <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {post?.mediaUrl && post?.mediaType === 'video' && (
                <VideoView
                    player={player}
                    style={styles.fullScreenMediaItem}
                    contentFit="contain"
                    nativeControls={true} 
                />
            )}
        </View>
      </Modal>

      <CustomAlert 
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 0.5, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 15 },
  mainPost: { padding: 15, borderBottomWidth: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  name: { fontWeight: 'bold', fontSize: 16 },
  
  postGoldenBadge: { backgroundColor: '#FFD700', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  postGoldenBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },

  handle: { fontSize: 14 },
  postText: { fontSize: 18, marginTop: 10, lineHeight: 26 },
  
  postImage: { width: '100%', height: SCREEN_HEIGHT * 0.40, borderRadius: 15, marginTop: 10, backgroundColor: '#111' },
  postVideo: { width: '100%', height: SCREEN_HEIGHT * 0.50, borderRadius: 15, marginTop: 10, backgroundColor: '#111' },
  
  statsRow: { flexDirection: 'row', marginTop: 15, paddingVertical: 10, borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  mainActions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  commentItem: { flexDirection: 'row', padding: 15, borderBottomWidth: 0.5 },
  commentAvatar: { width: 35, height: 35, borderRadius: 17.5, marginRight: 10 },
  commentName: { fontWeight: 'bold', fontSize: 14, marginRight: 5 },
  
  commentGoldenBadge: { backgroundColor: '#FFD700', width: 12, height: 12, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 4, marginTop: 1 },
  commentGoldenBadgeText: { color: '#000', fontSize: 8, fontWeight: '900' },

  commentHandle: { fontSize: 12 }, 
  commentActions: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 40, marginTop: 5 },
  actionButton: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontSize: 12, marginLeft: 5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 0.5, paddingBottom: 10 }, 
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, marginRight: 10, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 250, borderRadius: 12, padding: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
  reportContainer: { width: '90%', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 10 },
  reportTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  reasonBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 15, borderBottomWidth: 0.5 },

  fullScreenMediaContainer: {
      flex: 1,
      backgroundColor: '#000000',
      justifyContent: 'center',
      alignItems: 'center',
  },
  closeMediaBtn: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 50 : 20,
      left: 20,
      zIndex: 100,
      padding: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 20,
  },
  fullScreenMediaItem: {
      width: '100%',
      height: '100%',
  }
});