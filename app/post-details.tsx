import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
    arrayRemove, arrayUnion,
    collection, deleteDoc, doc,
    getDoc,
    increment,
    onSnapshot, orderBy,
    query, serverTimestamp, updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList, KeyboardAvoidingView, Modal, Platform, Share, StyleSheet,
    Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, ViewToken
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { sendSocialNotification } from '../services/notificationService';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

const REPORT_REASONS = [
  "Offensive content",
  "Abusive behavior",
  "Spam",
  "Misinformation",
  "Sexual content",
  "Other"
];

// ✅ GLOBAL CACHE
const viewedSessionIds = new Set<string>();
const viewedCommentSessionIds = new Set<string>();

export default function PostDetailsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { postId } = useLocalSearchParams(); 
  const user = auth.currentUser;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);

  // Menu State
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  // Initialize Video Player
  const videoSource = post?.mediaType === 'video' && post?.mediaUrl ? post.mediaUrl : null;
  const player = useVideoPlayer(videoSource, player => {
      if (videoSource) {
          player.loop = true;
          player.play();
      }
  });

  // ✅ Safe Pause on Leave
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
            if (player && videoSource) player.pause();
        } catch(e) {}
      };
    }, [player, videoSource])
  );

  const isOwner = post?.userId === user?.uid;

  useEffect(() => {
    if (!postId) return;
    
    const postUnsub = onSnapshot(doc(db, 'posts', postId as string), (doc) => {
      if (doc.exists()) setPost({ id: doc.id, ...doc.data() });
    });

    const q = query(
        collection(db, 'posts'), 
        where('parentId', '==', postId), 
        orderBy('createdAt', 'desc')
    );
    const commentsUnsub = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

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

    return () => { postUnsub(); commentsUnsub(); };
  }, [postId]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.forEach((viewToken) => {
          if (viewToken.isViewable && viewToken.item?.id) {
              const commentId = viewToken.item.id;
              if (!viewedCommentSessionIds.has(commentId)) {
                  viewedCommentSessionIds.add(commentId);
                  try {
                      updateDoc(doc(db, 'posts', commentId), { views: increment(1) });
                  } catch (e) { console.log("Error incrementing comment view", e); }
              }
          }
      });
  }).current;

  // ✅ UPDATED: Toggle Action with Numeric Counters
  const toggleAction = async (id: string, field: 'likes' | 'reposts', currentArray: string[]) => {
      if (!user) return;
      const ref = doc(db, 'posts', id);
      const isActive = currentArray?.includes(user.uid);
      
      // Determine counterpart integer field
      const countField = field === 'likes' ? 'likeCount' : 'repostCount';

      await updateDoc(ref, { 
          [field]: isActive ? arrayRemove(user.uid) : arrayUnion(user.uid),
          [countField]: increment(isActive ? -1 : 1)
      });
  };

  const handleShare = async (item: any) => {
      try {
          await Share.share({
              message: `Check out this post from ${item.displayName || item.username} on AniYu: ${item.text || 'Check this out!'}`,
              url: item.mediaUrl || '' 
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
              await deleteDoc(doc(db, "posts", postId as string));
              router.back();
          }}
      ]);
  };

  const handleBlockUser = async () => {
      if (!user || !post) return;
      setMenuVisible(false);
      Alert.alert("Block User", `Are you sure you want to block @${post.username}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Block", 
              style: "destructive", 
              onPress: async () => {
                  try {
                      await updateDoc(doc(db, 'users', user.uid), {
                          blockedUsers: arrayUnion(post.userId)
                      });
                      showAlert('success', 'User Blocked', `You have blocked @${post.username}.`);
                      router.back();
                  } catch (e) {
                      const friendlyMessage = getFriendlyErrorMessage(e);
                      showAlert('error', 'Block Failed', friendlyMessage);
                  }
              }
          }
      ]);
  };

  const submitReport = async (reason: string) => {
      if (!user) return;
      setReportLoading(true);
      try {
        const batch = writeBatch(db);
        const reportRef = doc(collection(db, 'reports'));
        batch.set(reportRef, {
          type: 'post',
          targetId: postId,
          targetContent: post?.text || 'media',
          reportedBy: user.uid,
          reason: reason,
          createdAt: serverTimestamp(),
          status: 'pending'
        });
        await batch.commit();

        setReportModalVisible(false);
        showAlert('success', 'Report Submitted', 'Thank you for keeping our community safe. We will review this shortly.');
      } catch (error) {
        const friendlyMessage = getFriendlyErrorMessage(error);
        showAlert('error', 'Submission Failed', friendlyMessage);
      } finally {
        setReportLoading(false);
      }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !user) return;
    setSending(true);
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const realUsername = userData.username || user.email?.split('@')[0] || "user"; 
      const realDisplayName = userData.displayName || user.displayName || "Anonymous";
      const realAvatar = userData.avatar || user.photoURL;

      const batch = writeBatch(db);

      const newCommentRef = doc(collection(db, 'posts'));
      batch.set(newCommentRef, {
        text: newComment,
        userId: user.uid,
        username: realUsername,        
        displayName: realDisplayName, 
        userAvatar: realAvatar,
        createdAt: serverTimestamp(),
        parentId: postId, 
        likes: [],
        reposts: [],
        // Initialize counts for comments too
        likeCount: 0,
        repostCount: 0,
        commentCount: 0,
        views: 0
      });

      const parentPostRef = doc(db, 'posts', postId as string);
      batch.update(parentPostRef, { commentCount: increment(1) });

      const userRef = doc(db, 'users', user.uid);
      batch.update(userRef, { lastPostedAt: serverTimestamp() });

      await batch.commit();
      
      if (post && post.userId && post.userId !== user.uid) {
          sendSocialNotification(
              post.userId, 
              'comment', 
              { uid: user.uid, name: realDisplayName, avatar: realAvatar || '' },
              newComment,
              postId as string
          );
      }

      setNewComment('');
    } catch (e: any) { 
        console.error(e); 
        if (e.message.includes("permission-denied")) {
            showAlert('error', '⛔ Blocked', 'You are posting too fast (30s cooldown) or you have been banned.');
        } else {
            const friendlyMessage = getFriendlyErrorMessage(e);
            showAlert('error', 'Comment Failed', friendlyMessage);
        }
    } 
    finally { setSending(false); }
  };

  if (!post) return <View style={[styles.container, { backgroundColor: theme.background }]} />;

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "now";
    const seconds = Math.floor((new Date().getTime() / 1000) - timestamp.seconds);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds/60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds/3600)}h`;
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  const renderComment = ({ item }: { item: any }) => {
      const isLiked = item.likes?.includes(user?.uid);
      const isReposted = item.reposts?.includes(user?.uid);
      const timeAgo = formatTimeAgo(item.createdAt);
      return (
        <TouchableOpacity 
            style={[styles.commentItem, { borderBottomColor: theme.border }]}
            onPress={() => goToDetails(item.id)} 
            activeOpacity={0.7}
        >
            <Image source={{ uri: item.userAvatar }} style={styles.commentAvatar} />
            <View style={{ flex: 1 }}>
                <View style={styles.row}>
                    <Text style={[styles.commentName, { color: theme.text }]} numberOfLines={1}>{item.displayName || item.username}</Text>
                    <Text style={[styles.commentHandle, { color: theme.subText }]} numberOfLines={1}>@{item.username} · {timeAgo}</Text>
                </View>
                <Text style={{ color: theme.text, marginTop: 2, marginBottom: 8 }}>{item.text}</Text>
                <View style={styles.commentActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => toggleAction(item.id, 'likes', item.likes || [])}>
                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={16} color={isLiked ? "#FF6B6B" : theme.subText} />
                        {/* ✅ Use Aggregated Counter */}
                        <Text style={[styles.actionText, { color: theme.subText }]}>{item.likeCount || item.likes?.length || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => goToDetails(item.id)}>
                        <Ionicons name="chatbubble-outline" size={16} color={theme.subText} />
                        <Text style={[styles.actionText, { color: theme.subText }]}>{item.commentCount || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => toggleAction(item.id, 'reposts', item.reposts || [])}>
                        <Ionicons name="repeat-outline" size={16} color={isReposted ? "#00BA7C" : theme.subText} />
                         {/* ✅ Use Aggregated Counter */}
                         <Text style={[styles.actionText, { color: theme.subText }]}>{item.repostCount || item.reposts?.length || 0}</Text>
                    </TouchableOpacity>
                    <View style={styles.actionButton}>
                        <Ionicons name="stats-chart" size={16} color={theme.subText} />
                        <Text style={[styles.actionText, { color: theme.subText }]}>{item.views || 0}</Text>
                    </View>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item)}>
                        <Ionicons name="share-social-outline" size={16} color={theme.subText} />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
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
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
             <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Accounts for Header
      >
          <FlatList
            data={comments}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            ListHeaderComponent={() => (
               <View style={[styles.mainPost, { borderBottomColor: theme.border }]}>
                  <View style={styles.row}>
                     <Image source={{ uri: post.userAvatar }} style={styles.avatar} />
                     <View style={{ marginLeft: 10 }}>
                        <Text style={[styles.name, { color: theme.text }]}>{post.displayName || post.username}</Text>
                        <Text style={[styles.handle, { color: theme.subText }]}>@{post.username}</Text>
                     </View>
                  </View>
                  <Text style={[styles.postText, { color: theme.text }]}>{post.text}</Text>
                  
                  {post.mediaUrl && post.mediaType === 'video' && (
                      <VideoView 
                        player={player} 
                        style={styles.postVideo} 
                        contentFit="cover"
                        allowsFullscreen={false}
                        allowsPictureInPicture={false}
                        nativeControls={false} // ✅ Correct Prop
                      />
                  )}
                  {post.mediaUrl && post.mediaType === 'image' && (
                      <Image source={{ uri: post.mediaUrl }} style={styles.postImage} contentFit="cover" />
                  )}

                  <Text style={{ color: theme.subText, marginTop: 10, fontSize: 12 }}>
                     {post.createdAt?.seconds ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
                  </Text>
                  
                  <View style={[styles.statsRow, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                      {/* ✅ Updated to use Aggregated Counters */}
                      <Text style={{ color: theme.subText }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{post.likeCount || post.likes?.length || 0}</Text> Likes</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{post.repostCount || post.reposts?.length || 0}</Text> Reposts</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{post.commentCount || 0}</Text> Comments</Text>
                      <Text style={{ color: theme.subText, marginLeft: 15 }}><Text style={{ fontWeight: 'bold', color: theme.text }}>{post.views || 0}</Text> Views</Text>
                  </View>

                  <View style={styles.mainActions}>
                       <TouchableOpacity onPress={() => toggleAction(postId as string, 'likes', post.likes || [])}><Ionicons name={post.likes?.includes(user?.uid)?"heart":"heart-outline"} size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity><Ionicons name="chatbubble-outline" size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity onPress={() => toggleAction(postId as string, 'reposts', post.reposts || [])}><Ionicons name="repeat-outline" size={22} color={theme.text} /></TouchableOpacity>
                       <TouchableOpacity onPress={() => handleShare(post)}><Ionicons name="share-social-outline" size={22} color={theme.text} /></TouchableOpacity>
                  </View>
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
  handle: { fontSize: 14 },
  postText: { fontSize: 18, marginTop: 10, lineHeight: 26 },
  postImage: { width: '100%', height: 250, borderRadius: 15, marginTop: 10 },
  postVideo: { width: '100%', height: 250, borderRadius: 15, marginTop: 10 },
  statsRow: { flexDirection: 'row', marginTop: 15, paddingVertical: 10, borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  mainActions: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  commentItem: { flexDirection: 'row', padding: 15, borderBottomWidth: 0.5 },
  commentAvatar: { width: 35, height: 35, borderRadius: 17.5, marginRight: 10 },
  commentName: { fontWeight: 'bold', fontSize: 14, marginRight: 5 },
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
  reasonBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 15, borderBottomWidth: 0.5 }
});