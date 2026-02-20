import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
// ✅ REMOVED FIREBASE STORAGE IMPORTS
// import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
import { auth, db } from '../config/firebaseConfig'; // Removed storage import from here too
import { useTheme } from '../context/ThemeContext';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
// ✅ IMPORT R2 SERVICE
import { uploadToR2 } from '../services/r2Storage';

const GENRES = ["Action", "Adventure", "Romance", "Fantasy", "Drama", "Comedy", "Sci-Fi", "Slice of Life", "Sports", "Mystery"];

// ✅ DEFINE SIZE LIMITS (in Bytes)
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_VIDEO_SIZE = 5 * 1024 * 1024; // 5 MB

export default function CreatePostScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = auth.currentUser;
  
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<any>(null);
  const [avatar, setAvatar] = useState(user?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime');
  
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  useEffect(() => {
     if(user) {
         getDoc(doc(db, "users", user.uid)).then(doc => {
             if(doc.exists()) setAvatar(doc.data().avatar);
         });
     }
  }, []);

  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, 
      allowsEditing: true,
      quality: 0.8, // Initial quality setting
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      // ✅ CRITICAL: Pre-check file size before anything else
      if (asset.fileSize) {
          const isVideo = asset.type === 'video';
          const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
          const limitLabel = isVideo ? '5MB' : '1MB';

          if (asset.fileSize > limit) {
              showAlert('error', 'File Too Large', `Please select a ${isVideo ? 'video' : 'image'} under ${limitLabel}.`);
              return; // Stop here, do not set media
          }
      }
      
      setMedia(asset);
    }
  };

  const processMedia = async (uri: string, type: 'image' | 'video') => {
    if (type === 'video') return uri; 
    
    // Compressor runs only if size passed the initial check in pickMedia
    console.log("Compressing image...");
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }], 
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipulated.uri;
  };

  // ✅ UPDATED: Uploads to R2 instead of Firebase Storage
  const uploadMediaToStorage = async (uri: string, type: 'image' | 'video') => {
    if (!user) throw new Error("No user");
    
    // 1. Process/Compress (if image)
    const processedUri = await processMedia(uri, type);

    // 2. Upload to Cloudflare R2
    const folder = `user_posts/${user.uid}`;
    const publicUrl = await uploadToR2(processedUri, folder);
    
    return publicUrl;
  };

  const toggleTag = (tag: string) => {
      if (selectedTags.includes(tag)) {
          setSelectedTags(selectedTags.filter(t => t !== tag));
      } else {
          if (selectedTags.length < 3) {
              setSelectedTags([...selectedTags, tag]);
          } else {
              showAlert('warning', 'Limit Reached', 'You can only select up to 3 topics.');
          }
      }
  };

  const handlePost = async () => {
    // ✅ NEW: Strict validation requiring at least 1 tag
    if (selectedTags.length === 0) {
        return showAlert('warning', 'Topic Required', 'Please select at least one topic for your post.');
    }

    if (!text.trim() && !media) return;
    setLoading(true);
    try {
      if (!user) throw new Error("Not logged in");

      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      
      const realUsername = userData.username || "anonymous";
      const realDisplayName = userData.displayName || user.displayName || "Anonymous";
      const realAvatar = userData.avatar || user.photoURL;

      let mediaUrl = null;
      let mediaType = null;
      if (media) {
          mediaType = media.type;
          // This now calls the R2 version
          mediaUrl = await uploadMediaToStorage(media.uri, mediaType);
      }

      const batch = writeBatch(db);
      const newPostRef = doc(collection(db, 'posts'));
      
      batch.set(newPostRef, {
        text: text,
        mediaUrl: mediaUrl,   
        mediaType: mediaType,
        userId: user.uid,
        displayName: realDisplayName, 
        username: realUsername,       
        userAvatar: realAvatar,
        tags: selectedTags,
        createdAt: serverTimestamp(),
        likes: [],
        reposts: [],
        likeCount: 0,
        repostCount: 0,
        commentCount: 0,
        parentId: null,
        views: 0 
      });

      const userRef = doc(db, 'users', user.uid);
      batch.update(userRef, { lastPostedAt: serverTimestamp() });

      await batch.commit();

      router.back(); 
    } catch (error: any) {
      console.error(error);
      if (error.message.includes("permission-denied")) {
        showAlert('error', '⛔ Blocked', 'You are posting too fast (30s cooldown) or you are banned.');
      } else {
        const friendlyMessage = getFriendlyErrorMessage(error);
        showAlert('error', 'Post Failed', friendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Post button is disabled if no tags are selected
  const isPostDisabled = (!text.trim() && !media) || selectedTags.length === 0 || loading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      
      <Stack.Screen 
        options={{
            title: '', 
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerLeft: () => (
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: theme.text, fontSize: 16 }}>Cancel</Text>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <TouchableOpacity 
                  onPress={handlePost} 
                  disabled={isPostDisabled}
                  style={{ 
                    backgroundColor: isPostDisabled ? theme.card : theme.tint,
                    paddingHorizontal: 15,
                    paddingVertical: 6,
                    borderRadius: 20
                  }}
                >
                  {loading ? <ActivityIndicator color="white" size="small" /> : (
                     <Text style={{ color: isPostDisabled ? theme.subText : 'white', fontWeight: 'bold', fontSize: 14 }}>Post</Text>
                  )}
                </TouchableOpacity>
            )
        }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
         <View style={styles.inputRow}>
             <Image source={{ uri: avatar }} style={styles.avatar} />
             
             <View style={{ flex: 1 }}>
                <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="What's happening?"
                    placeholderTextColor={theme.subText}
                    multiline
                    autoFocus
                    value={text}
                    onChangeText={setText}
                />

                {media && (
                    <View style={styles.previewWrapper}>
                        {media.type === 'video' ? (
                            <Video
                                source={{ uri: media.uri }}
                                style={styles.mediaPreview}
                                useNativeControls
                                resizeMode={ResizeMode.COVER}
                            />
                        ) : (
                            <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
                        )}
                        <TouchableOpacity style={styles.removeBtn} onPress={() => setMedia(null)}>
                            <Ionicons name="close" size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                )}
             </View>
         </View>

         <View style={styles.inlineToolbar}>
            <TouchableOpacity onPress={pickMedia} style={styles.toolIcon}>
                <Ionicons name="image-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
            
            {/* Camera button could also use pickMedia logic if implemented later */}
            <TouchableOpacity style={styles.toolIcon}>
                <Ionicons name="camera-outline" size={20} color={theme.tint} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolIcon}>
                <Ionicons name="list-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
         </View>

         <View style={{ marginTop: 5, paddingHorizontal: 15 }}>
            <Text style={{ color: selectedTags.length === 0 ? '#ef4444' : theme.subText, fontSize: 11, marginBottom: 8, fontWeight: 'bold' }}>
                {selectedTags.length === 0 ? "⚠️ AT LEAST 1 TOPIC REQUIRED" : `ADD TOPICS (${selectedTags.length}/3)`}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {GENRES.map(genre => {
                    const isSelected = selectedTags.includes(genre);
                    return (
                        <TouchableOpacity 
                            key={genre}
                            onPress={() => toggleTag(genre)}
                            style={{
                                paddingHorizontal: 12, 
                                paddingVertical: 6, 
                                borderRadius: 15, 
                                backgroundColor: isSelected ? theme.tint : theme.card,
                                borderWidth: 1, 
                                borderColor: isSelected ? theme.tint : theme.border
                            }}
                        >
                            <Text style={{ 
                                color: isSelected ? 'white' : theme.text, 
                                fontSize: 11,
                                fontWeight: '600'
                            }}>{genre}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
         </View>

      </ScrollView>

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
  scrollContent: { paddingVertical: 10 },
  inputRow: { flexDirection: 'row', paddingHorizontal: 15 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  
  input: { 
      fontSize: 18, 
      textAlignVertical: 'top', 
      minHeight: 60, 
      paddingTop: 10, 
      paddingBottom: 10,
      width: '100%' 
  },

  previewWrapper: { position: 'relative', marginTop: 10, marginRight: 10, marginBottom: 10 },
  mediaPreview: { width: '100%', height: 200, borderRadius: 12 },
  removeBtn: { 
      position: 'absolute', top: 6, right: 6, 
      backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 4 
  },

  inlineToolbar: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 15,
    marginTop: 0,
    alignItems: 'center'
  },
  toolIcon: { 
    marginRight: 20 
  }
});