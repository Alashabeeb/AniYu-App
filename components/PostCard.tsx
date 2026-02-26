import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    increment,
    serverTimestamp,
    updateDoc
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Modal,
    Pressable,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { sendSocialNotification } from '../services/notificationService';

interface PostCardProps {
  post: any;
  isVisible?: boolean; 
}

const REPORT_REASONS = ["Offensive content", "Abusive behavior", "Spam", "Other"];

// ✅ Dynamically calculate screen height
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PostCard({ post, isVisible = true }: PostCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;
  
  const isFocused = useIsFocused();

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // ✅ OPTIMISTIC UI STATE: Allows instant visual updates without waiting for Firebase
  const [localIsLiked, setLocalIsLiked] = useState(post.likes?.includes(currentUser?.uid));
  const [localLikeCount, setLocalLikeCount] = useState(post.likeCount || post.likes?.length || 0);

  const [localIsReposted, setLocalIsReposted] = useState(post.reposts?.includes(currentUser?.uid));
  const [localRepostCount, setLocalRepostCount] = useState(post.repostCount || post.reposts?.length || 0);

  const isOwner = post.userId === currentUser?.uid;
  const isPinned = post.pinned === true;

  // Sync local state if the feed refreshes and passes down new post props
  useEffect(() => {
      setLocalIsLiked(post.likes?.includes(currentUser?.uid));
      setLocalLikeCount(post.likeCount || post.likes?.length || 0);
      setLocalIsReposted(post.reposts?.includes(currentUser?.uid));
      setLocalRepostCount(post.repostCount || post.reposts?.length || 0);
  }, [post]);

  const videoSource = post.mediaType === 'video' && post.mediaUrl ? post.mediaUrl : null;
  
  const player = useVideoPlayer(videoSource, player => { 
      if (videoSource) {
          player.loop = true;
          // Notice: We don't auto-play here, we let the useEffect handle it safely
      }
  });

  useEffect(() => {
      if (!player || !videoSource) return;

      if (!isFocused || !isVisible) {
          try {
              player.pause();
          } catch (e) {}
      } else {
          try {
              player.play();
          } catch (e) {}
      }
  }, [isFocused, isVisible, player, videoSource]);

  let timeAgo = "now";
  if (post.createdAt?.seconds) {
    const seconds = Math.floor((new Date().getTime() / 1000) - post.createdAt.seconds);
    if (seconds < 60) timeAgo = `${seconds}s`;
    else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m`;
    else if (seconds < 86400) timeAgo = `${Math.floor(seconds / 3600)}h`;
    else timeAgo = new Date(post.createdAt.seconds * 1000).toLocaleDateString();
  }

  const handleGoToDetails = () => {
    try { if (player && videoSource) player.pause(); } catch(e){}
    router.push({ pathname: '/post-details', params: { postId: post.id } });
  };

  const handleLike = async () => {
    if (!currentUser) return;
    
    // 1. Optimistic Update (Instant UI feedback)
    const newIsLiked = !localIsLiked;
    setLocalIsLiked(newIsLiked);
    setLocalLikeCount((prev: number) => prev + (newIsLiked ? 1 : -1));

    // 2. Notification
    if (newIsLiked) {
        sendSocialNotification(post.userId, 'like', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', post.id);
    }
    
    // 3. Database Update
    try {
        const postRef = doc(db, 'posts', post.id);
        await updateDoc(postRef, { 
            likes: newIsLiked ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
            likeCount: increment(newIsLiked ? 1 : -1) 
        });
    } catch (e) {
        // Rollback on network failure
        setLocalIsLiked(!newIsLiked);
        setLocalLikeCount((prev: number) => prev + (!newIsLiked ? 1 : -1));
    }
  };

  const handleRepost = async () => {
    if (!currentUser) return;
    
    // Optimistic Update
    const newIsReposted = !localIsReposted;
    setLocalIsReposted(newIsReposted);
    setLocalRepostCount((prev: number) => prev + (newIsReposted ? 1 : -1));

    if (newIsReposted) {
        sendSocialNotification(post.userId, 'repost', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', post.id);
    }
    
    try {
        const postRef = doc(db, 'posts', post.id);
        await updateDoc(postRef, { 
            reposts: newIsReposted ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
            repostCount: increment(newIsReposted ? 1 : -1)
        });
    } catch (e) {
        setLocalIsReposted(!newIsReposted);
        setLocalRepostCount((prev: number) => prev + (!newIsReposted ? 1 : -1));
    }
  };

  const handleShare = async () => {
      try {
          await Share.share({
              message: `Check out this post from ${post.displayName} on AniYu: ${post.text || 'Check this out!'}`,
              url: post.mediaUrl || '' 
          });
      } catch (error) { console.log("Share error", error); }
  };

  const handlePin = async () => {
      setMenuVisible(false);
      try {
          const postRef = doc(db, 'posts', post.id);
          await updateDoc(postRef, { pinned: !isPinned });
          Alert.alert("Success", isPinned ? "Post Unpinned." : "Post Pinned to Profile.");
      } catch (e) { Alert.alert("Error", "Could not pin post."); }
  };

  const handleDelete = async () => {
    setMenuVisible(false);
    Alert.alert("Delete Post", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => { try { await deleteDoc(doc(db, "posts", post.id)); } catch (error) { Alert.alert("Error", "Could not delete post."); } } }
    ]);
  };

  const handleBlockUser = async () => {
      if (!currentUser || isOwner) return;
      setMenuVisible(false);
      Alert.alert("Block User", `Are you sure you want to block @${post.username}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Block", 
              style: "destructive", 
              onPress: async () => {
                  try {
                      const myRef = doc(db, 'users', currentUser.uid);
                      await updateDoc(myRef, {
                          blockedUsers: arrayUnion(post.userId)
                      });
                      Alert.alert("Blocked", `You will no longer see posts from @${post.username}.`);
                  } catch (e) {
                      Alert.alert("Error", "Could not block user.");
                  }
              }
          }
      ]);
  };

  const submitReport = async (reason: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'reports'), { type: 'post', targetId: post.id, targetContent: post.text || 'media', reportedBy: currentUser.uid, reason: reason, createdAt: serverTimestamp(), status: 'pending' });
      Alert.alert("Report Submitted", "Thank you.");
      setReportModalVisible(false);
    } catch (error) { Alert.alert("Error", "Could not submit."); }
  };

  return (
    <Pressable onPress={handleGoToDetails} style={[styles.container, { borderBottomColor: theme.border }]}>
      
      {isPinned && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 50 }}>
              <Ionicons name="pricetag" size={12} color={theme.subText} />
              <Text style={{ fontSize: 12, color: theme.subText, marginLeft: 5, fontWeight: 'bold' }}>Pinned</Text>
          </View>
      )}

      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/feed-profile', params: { userId: post.userId } }); }}>
          <Image source={{ uri: post.userAvatar }} style={styles.avatar} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{post.displayName}</Text>
              <Text style={[styles.handle, { color: theme.subText }]} numberOfLines={1}>@{post.username} · {timeAgo}</Text>
            </View>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }} style={styles.dotsButton}>
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.subText} />
            </TouchableOpacity>
          </View>

          {post.text ? <Text style={[styles.text, { color: theme.text }]}>{post.text}</Text> : null}

          {post.mediaUrl && post.mediaType === 'image' && (
              <Image source={{ uri: post.mediaUrl }} style={[styles.mediaBase, styles.imageMedia]} contentFit="cover" />
          )}
          {post.mediaUrl && post.mediaType === 'video' && (
              <VideoView 
                  player={player} 
                  style={[styles.mediaBase, styles.videoMedia]} 
                  contentFit="cover" 
                  allowsPictureInPicture={false}
                  nativeControls={false} 
              />
          )}

          <View style={styles.actions}>
            {/* ✅ BOUND TO LOCAL STATE NOW */}
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleLike(); }}>
              <Ionicons name={localIsLiked ? "heart" : "heart-outline"} size={18} color={localIsLiked ? "#FF6B6B" : theme.subText} />
              <Text style={[styles.count, { color: localIsLiked ? "#FF6B6B" : theme.subText }]}>{localLikeCount}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleGoToDetails(); }}>
              <Ionicons name="chatbubble-outline" size={18} color={theme.subText} />
              <Text style={[styles.count, { color: theme.subText }]}>{post.commentCount || 0}</Text>
            </TouchableOpacity>
            
            {/* ✅ BOUND TO LOCAL STATE NOW */}
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleRepost(); }}>
              <Ionicons name="repeat-outline" size={18} color={localIsReposted ? "#00BA7C" : theme.subText} />
              <Text style={[styles.count, { color: localIsReposted ? "#00BA7C" : theme.subText }]}>{localRepostCount}</Text>
            </TouchableOpacity>
            
            <View style={styles.actionBtn}>
                <Ionicons name="stats-chart" size={16} color={theme.subText} />
                <Text style={[styles.count, { color: theme.subText }]}>{post.views || 0}</Text>
            </View>

            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleShare(); }}>
                <Ionicons name="share-social-outline" size={18} color={theme.subText} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
                    {isOwner ? (
                        <>
                            <TouchableOpacity style={styles.menuItem} onPress={handlePin}>
                                <Ionicons name="pricetag-outline" size={20} color={theme.text} />
                                <Text style={[styles.menuText, { color: theme.text }]}>{isPinned ? "Unpin" : "Pin"}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                                <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                                <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Delete</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                                <Ionicons name="ban-outline" size={20} color="#FF6B6B" />
                                <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Block @{post.username}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setReportModalVisible(true); }}>
                                <Ionicons name="flag-outline" size={20} color={theme.text} />
                                <Text style={[styles.menuText, { color: theme.text }]}>Report</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 15, borderBottomWidth: 0.5 },
  avatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#eee' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  name: { fontWeight: 'bold', fontSize: 15, marginRight: 6, flexShrink: 1 },
  handle: { fontSize: 14, flexShrink: 1 },
  dotsButton: { padding: 5, marginTop: -5 },
  text: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  mediaBase: { width: '100%', borderRadius: 12, marginBottom: 10, backgroundColor: '#111' },
  imageMedia: { height: SCREEN_HEIGHT * 0.40 },
  videoMedia: { height: SCREEN_HEIGHT * 0.50 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 40, paddingVertical: 5 }, // Added slight padding for touch target
  count: { fontSize: 12, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 250, borderRadius: 12, padding: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
});