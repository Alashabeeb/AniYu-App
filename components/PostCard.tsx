import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Modal,
    Platform,
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
import { deleteFromR2 } from '../services/r2Storage'; // ✅ IMPORTED R2 DELETE FUNCTION

interface PostCardProps {
  post: any;
  isVisible?: boolean; 
  isProfilePinnedView?: boolean;
  onDelete?: (postId: string) => void;
  onBlock?: (userId: string) => void;
}

const REPORT_REASONS = ["Offensive content", "Abusive behavior", "Spam", "Other"];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const localViewedSet = new Set<string>();

const formatCount = (count: number): string => {
    if (!count) return "0";
    if (count < 1000) return count.toString();
    if (count < 1000000) {
        return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
};

export default function PostCard({ post, isVisible = true, isProfilePinnedView = false, onDelete, onBlock }: PostCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const currentUser = auth.currentUser;
  
  const isFocused = useIsFocused();

  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);

  const [localIsLiked, setLocalIsLiked] = useState(post.likes?.includes(currentUser?.uid));
  const [localLikeCount, setLocalLikeCount] = useState<number>(post.likeCount || post.likes?.length || 0);

  const [localIsReposted, setLocalIsReposted] = useState(post.reposts?.includes(currentUser?.uid));
  const [localRepostCount, setLocalRepostCount] = useState<number>(post.repostCount || post.reposts?.length || 0);

  const [localViewCount, setLocalViewCount] = useState<number>(post.views || 0);

  // ✅ BUG 3 FIX: Action Lock state to prevent Double-Tap Clones
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const authorId = post.isRepost && post.originalUserId ? post.originalUserId : post.userId;
  const isOwner = post.userId === currentUser?.uid;
  const isPinned = post.pinned === true;
  const isOriginalAuthor = authorId === currentUser?.uid;
  
  const isMyOriginalPost = currentUser?.uid === post.userId && !post.isRepost;
  const showMenu = isOwner || !isOriginalAuthor;

  useEffect(() => {
      setLocalIsLiked(post.likes?.includes(currentUser?.uid));
      setLocalLikeCount(post.likeCount || post.likes?.length || 0);
      setLocalIsReposted(post.reposts?.includes(currentUser?.uid));
      setLocalRepostCount(post.repostCount || post.reposts?.length || 0);
      setLocalViewCount(post.views || 0);
  }, [post.id, currentUser?.uid, post.views, post.likeCount, post.repostCount, post.likes, post.reposts]);

  const videoSource = post.mediaType === 'video' && post.mediaUrl ? post.mediaUrl : null;
  const player = useVideoPlayer(videoSource, player => { 
      if (videoSource) player.loop = true;
  });

  useEffect(() => {
      if (!player || !videoSource) return;
      if (!isFocused || !isVisible) {
          try { player.pause(); } catch (e) {}
      } else {
          try { player.play(); } catch (e) {}
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
    const targetPostId = post.isRepost ? post.originalPostId : post.id;
    
    if (!localViewedSet.has(targetPostId)) {
        localViewedSet.add(targetPostId);
        setLocalViewCount((prev: number) => prev + 1);
    }
    router.push({ pathname: '/post-details', params: { postId: targetPostId } });
  };

  const handleLike = async () => {
    if (!currentUser || isProcessingAction) return;
    setIsProcessingAction(true); // Lock the UI

    const newIsLiked = !localIsLiked;
    setLocalIsLiked(newIsLiked);
    setLocalLikeCount((prev: number) => prev + (newIsLiked ? 1 : -1));

    if (newIsLiked && !post.isRepost) {
        sendSocialNotification(authorId, 'like', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', post.id);
    }
    
    try {
        const targetPostId = post.isRepost ? post.originalPostId : post.id;
        const postRef = doc(db, 'posts', targetPostId);
        await updateDoc(postRef, { 
            likes: newIsLiked ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
            likeCount: increment(newIsLiked ? 1 : -1) 
        });
    } catch (e: any) {
        setLocalIsLiked(!newIsLiked);
        setLocalLikeCount((prev: number) => prev + (!newIsLiked ? 1 : -1));
        Alert.alert("Action Blocked", "Firebase blocked this action. Check your Security Rules!");
    } finally {
        // Enforce a strict cooldown before unlocking
        setTimeout(() => setIsProcessingAction(false), 1000);
    }
  };

  const handleRepost = async () => {
    if (!currentUser || isProcessingAction) return;
    setIsProcessingAction(true); // Lock the UI

    const newIsReposted = !localIsReposted;
    setLocalIsReposted(newIsReposted);
    setLocalRepostCount((prev: number) => prev + (newIsReposted ? 1 : -1));
    
    try {
        const targetPostId = post.isRepost ? post.originalPostId : post.id;
        const postRef = doc(db, 'posts', targetPostId);
        
        await updateDoc(postRef, { 
            reposts: newIsReposted ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
            repostCount: increment(newIsReposted ? 1 : -1)
        });

        if (newIsReposted) {
            await addDoc(collection(db, 'posts'), {
                isRepost: true,
                originalPostId: targetPostId,
                userId: currentUser.uid, 
                repostedByUid: currentUser.uid,
                repostedByName: currentUser.displayName || 'Someone',
                originalUserId: authorId,
                displayName: post.displayName,
                username: post.username,
                userAvatar: post.userAvatar,
                text: post.text || "",
                mediaUrl: post.mediaUrl || null,
                mediaType: post.mediaType || null,
                tags: post.tags || [],
                parentId: null, 
                createdAt: serverTimestamp(),
                likes: post.likes || [], 
                likeCount: post.likeCount || 0,
                reposts: post.reposts || [], 
                repostCount: post.repostCount || 0,
                commentCount: post.commentCount || 0,
                views: post.views || 0,
                role: post.role || 'user' // Ensures role is carried over in reposts
            });
            sendSocialNotification(authorId, 'repost', { uid: currentUser.uid, name: currentUser.displayName || 'User', avatar: currentUser.photoURL || '' }, '', targetPostId);
        } else {
            const q = query(
                collection(db, 'posts'),
                where('isRepost', '==', true),
                where('originalPostId', '==', targetPostId),
                where('repostedByUid', '==', currentUser.uid)
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
    } catch (e: any) {
        setLocalIsReposted(!newIsReposted);
        setLocalRepostCount((prev: number) => prev + (!newIsReposted ? 1 : -1));
        Alert.alert("Action Blocked", "Firebase blocked this action. Check your Security Rules!");
    } finally {
        // Enforce a strict cooldown before unlocking
        setTimeout(() => setIsProcessingAction(false), 1000);
    }
  };

  const handleShare = async () => {
      try {
          const targetPostId = post.isRepost ? post.originalPostId : post.id;
          const postUrl = Linking.createURL('/post-details', { queryParams: { postId: targetPostId } });

          await Share.share({
              message: `Check out this post from ${post.displayName} on AniYu!\n\n${post.text ? `"${post.text}"\n\n` : ''}${postUrl}`,
              url: postUrl 
          });
      } catch (error) { console.log("Share error", error); }
  };

  const handlePin = async () => {
      if (!currentUser) return;
      setMenuVisible(false);
      try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          const oldPinnedPostId = userSnap.data()?.pinnedPostId;

          const batch = writeBatch(db);

          if (!isPinned) {
              if (oldPinnedPostId && oldPinnedPostId !== post.id) {
                  batch.update(doc(db, 'posts', oldPinnedPostId), { pinned: false });
              }
              batch.update(doc(db, 'posts', post.id), { pinned: true });
              batch.update(userRef, { pinnedPostId: post.id });
          } else {
              batch.update(doc(db, 'posts', post.id), { pinned: false });
              batch.update(userRef, { pinnedPostId: null });
          }
          
          await batch.commit();
          Alert.alert("Success", isPinned ? "Post Unpinned." : "Post Pinned to Profile.");
      } catch (e) {
          console.error(e);
          Alert.alert("Error", "Could not pin post.");
      }
  };

  const handleDelete = async () => {
    setMenuVisible(false);
    Alert.alert("Delete Post", "Are you sure you want to permanently delete this?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => { 
            try { 
                if (!post.isRepost && post.mediaUrl) {
                    await deleteFromR2(post.mediaUrl);
                }

                if (post.pinned && currentUser) {
                    const userRef = doc(db, 'users', currentUser.uid);
                    await updateDoc(userRef, { pinnedPostId: null });
                }

                await deleteDoc(doc(db, "posts", post.id));

                if (onDelete) {
                    onDelete(post.id);
                }

                if (post.parentId) {
                    try {
                        await updateDoc(doc(db, "posts", post.parentId), { commentCount: increment(-1) });
                    } catch (e) { console.log("Parent post already deleted or inaccessible."); }
                }

            } catch (error: any) { 
                console.error("Delete Error:", error);
                if (error.code === 'permission-denied') {
                    Alert.alert("Permission Denied", "Firebase Security Rules blocked the deletion.");
                } else {
                    Alert.alert("Error", error.message || "Could not delete post."); 
                }
            } 
        } }
    ]);
  };

  const handleBlockUser = async () => {
      if (!currentUser || isOwner || isOriginalAuthor) return;
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
                          blockedUsers: arrayUnion(authorId)
                      });
                      
                      if (onBlock) {
                          onBlock(authorId);
                      }

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
      
      {post.isRepost && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 50 }}>
              <Ionicons name="repeat" size={12} color={theme.subText} />
              <Text style={{ fontSize: 12, color: theme.subText, marginLeft: 5, fontWeight: 'bold' }}>
                  {post.repostedByUid === currentUser?.uid ? 'You reposted' : `${post.repostedByName} reposted`}
              </Text>
          </View>
      )}

      {isPinned && !post.isRepost && isProfilePinnedView && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 50 }}>
              <Ionicons name="pricetag" size={12} color={theme.subText} />
              <Text style={{ fontSize: 12, color: theme.subText, marginLeft: 5, fontWeight: 'bold' }}>Pinned</Text>
          </View>
      )}

      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/feed-profile', params: { userId: authorId } }); }}>
          <Image source={{ uri: post.userAvatar }} style={styles.avatar} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{post.displayName}</Text>
              
              {/* ✅ GOLDEN BADGES FOR FEED */}
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

              <Text style={[styles.handle, { color: theme.subText }]} numberOfLines={1}>@{post.username} · {timeAgo}</Text>
            </View>
            {showMenu && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }} style={styles.dotsButton}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={theme.subText} />
                </TouchableOpacity>
            )}
          </View>

          {post.text ? <Text style={[styles.text, { color: theme.text }]}>{post.text}</Text> : null}

          {post.mediaUrl && post.mediaType === 'image' && (
              <Pressable onPress={(e) => { e.stopPropagation(); setImageModalVisible(true); }}>
                  <Image source={{ uri: post.mediaUrl }} style={[styles.mediaBase, styles.imageMedia]} contentFit="cover" />
              </Pressable>
          )}

          {post.mediaUrl && post.mediaType === 'video' && (
              <Pressable onPress={(e) => { e.stopPropagation(); setVideoModalVisible(true); }}>
                  <VideoView 
                      player={player} 
                      style={[styles.mediaBase, styles.videoMedia]} 
                      contentFit="cover" 
                      allowsPictureInPicture={false}
                      nativeControls={false} 
                  />
              </Pressable>
          )}

          <View style={styles.actions}>
            {/* ✅ BUG 3 FIX: Disabled state passed into buttons */}
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleLike(); }} disabled={isProcessingAction}>
              <Ionicons name={localIsLiked ? "heart" : "heart-outline"} size={18} color={localIsLiked ? "#FF6B6B" : theme.subText} />
              <Text style={[styles.count, { color: localIsLiked ? "#FF6B6B" : theme.subText }]}>
                  {formatCount(localLikeCount)}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleGoToDetails(); }}>
              <Ionicons name="chatbubble-outline" size={18} color={theme.subText} />
              <Text style={[styles.count, { color: theme.subText }]}>
                  {formatCount(post.commentCount || 0)}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); handleRepost(); }} disabled={isProcessingAction}>
              <Ionicons name="repeat-outline" size={18} color={localIsReposted ? "#00BA7C" : theme.subText} />
              <Text style={[styles.count, { color: localIsReposted ? "#00BA7C" : theme.subText }]}>
                  {formatCount(localRepostCount)}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.actionBtn}>
                <Ionicons name="stats-chart" size={16} color={theme.subText} />
                <Text style={[styles.count, { color: theme.subText }]}>
                    {formatCount(localViewCount)}
                </Text>
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
                            {!post.isRepost && (
                                <TouchableOpacity style={styles.menuItem} onPress={handlePin}>
                                    <Ionicons name="pricetag-outline" size={20} color={theme.text} />
                                    <Text style={[styles.menuText, { color: theme.text }]}>{isPinned ? "Unpin" : "Pin"}</Text>
                                </TouchableOpacity>
                            )}
                            {isMyOriginalPost && (
                                <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                                    <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                                    <Text style={[styles.menuText, { color: '#FF6B6B' }]}>Delete</Text>
                                </TouchableOpacity>
                            )}
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

      <Modal visible={imageModalVisible} transparent={false} animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
        <View style={styles.fullScreenMediaContainer}>
            <TouchableOpacity style={styles.closeMediaBtn} onPress={() => setImageModalVisible(false)}>
                <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {post.mediaUrl && post.mediaType === 'image' && (
                <Image source={{ uri: post.mediaUrl }} style={styles.fullScreenMediaItem} contentFit="contain" />
            )}
        </View>
      </Modal>

      <Modal visible={videoModalVisible} transparent={false} animationType="fade" onRequestClose={() => setVideoModalVisible(false)}>
        <View style={styles.fullScreenMediaContainer}>
            <TouchableOpacity style={styles.closeMediaBtn} onPress={() => setVideoModalVisible(false)}>
                <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {post.mediaUrl && post.mediaType === 'video' && (
                <VideoView
                    player={player}
                    style={styles.fullScreenMediaItem}
                    contentFit="contain"
                    nativeControls={true} 
                />
            )}
        </View>
      </Modal>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 15, borderBottomWidth: 0.5 },
  avatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#eee' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  name: { fontWeight: 'bold', fontSize: 15, marginRight: 6, flexShrink: 1 },
  
  // ✅ NEW FEED BADGE STYLES
  postGoldenBadge: { backgroundColor: '#FFD700', width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center', marginRight: 6, marginTop: 1 },
  postGoldenBadgeText: { color: '#000', fontSize: 9, fontWeight: '900' },

  handle: { fontSize: 14, flexShrink: 1 },
  dotsButton: { padding: 5, marginTop: -5 },
  text: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  mediaBase: { width: '100%', borderRadius: 12, marginBottom: 10, backgroundColor: '#111' },
  imageMedia: { height: SCREEN_HEIGHT * 0.40 },
  videoMedia: { height: SCREEN_HEIGHT * 0.50 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 40, paddingVertical: 5 }, 
  count: { fontSize: 12, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 250, borderRadius: 12, padding: 10, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { fontSize: 16, marginLeft: 12, fontWeight: '500' },
  fullScreenMediaContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  closeMediaBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 },
  fullScreenMediaItem: { width: '100%', height: '100%' }
});