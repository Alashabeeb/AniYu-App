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

export default function PostCard({ post, isVisible = true }: PostCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;
  
  const isFocused = useIsFocused();

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const isLiked = post.likes?.includes(currentUser?.uid);
  const isReposted = post.reposts?.includes(currentUser?.uid);
  const isOwner = post.userId === currentUser?.uid;
  const isPinned = post.pinned === true;

  const videoSource = post.mediaType === 'video' && post.mediaUrl ? post.mediaUrl : null;
  
  const player = useVideoPlayer(videoSource, player => { 
      if (videoSource) {
          player.loop = true;
          player.play(); 
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
    if (!isLiked) {
        sendSocialNotification(post.userId, 'like', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', post.id);
    }
    const postRef = doc(db, 'posts', post.id);
    
    // ✅ Updated: Atomic Increment
    await updateDoc(postRef, { 
        likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        likeCount: increment(isLiked ? -1 : 1) 
    });
  };

  const handleRepost = async () => {
    if (!currentUser) return;
    if (!isReposted) {
        sendSocialNotification(post.userId, 'repost', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', post.id);
    }
    const postRef = doc(db, 'posts', post.id);
    
    // ✅ Updated: Atomic Increment
    await updateDoc(postRef, { 
        reposts: isReposted ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        repostCount: increment(isReposted ? -1 : 1)
    });
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

          {post.mediaUrl && post.mediaType === 'image' && <Image source={{ uri: post.mediaUrl }} style={styles.media} contentFit="cover" />}
          {post.mediaUrl && post.mediaType === 'video' && (
              <VideoView 
                  player={player} 
                  style={styles.media} 
                  contentFit="cover" 
                  allowsFullscreen={false}
                  allowsPictureInPicture={false}
                  nativeControls={false} 
              />
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleLike(); }}>
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={18} color={isLiked ? "#FF6B6B" : theme.subText} />
              {/* ✅ PREFER NUMERIC COUNT */}
              <Text style={[styles.count, { color: isLiked ? "#FF6B6B" : theme.subText }]}>{post.likeCount || post.likes?.length || 0}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleGoToDetails(); }}>
              <Ionicons name="chatbubble-outline" size={18} color={theme.subText} />
              <Text style={[styles.count, { color: theme.subText }]}>{post.commentCount || 0}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleRepost(); }}>
              <Ionicons name="repeat-outline" size={18} color={isReposted ? "#00BA7C" : theme.subText} />
              {/* ✅ PREFER NUMERIC COUNT */}
              <Text style={[styles.count, { color: isReposted ? "#00BA7C" : theme.subText }]}>{post.repostCount || post.reposts?.length || 0}</Text>
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
  media: { width: '100%', height: 250, borderRadius: 12, marginBottom: 10, backgroundColor: '#f0f0f0' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 40 },
  count: { fontSize: 12, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 250, borderRadius: 12, padding: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
});