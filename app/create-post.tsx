import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ✅ Added AsyncStorage
import { ResizeMode, Video } from 'expo-av';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import {
    doc,
    getDoc
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { uploadToR2 } from '../services/r2Storage';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

const CREATE_POST_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/createPost";

const GENRES = ["Action", "Adventure", "Romance", "Fantasy", "Drama", "Comedy", "Sci-Fi", "Slice of Life", "Sports", "Mystery"];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_CHARS = 120; 

export default function CreatePostScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = auth.currentUser;
  
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<any>(null);
  const [avatar, setAvatar] = useState(user?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime');
  
  // ✅ BUG 14 FIX: State to hold cached user profile
  const [currentUserData, setCurrentUserData] = useState<any>(null);

  // ✅ BUG 39 FIX: States & Refs for Upload Cancellation
  const [showCancel, setShowCancel] = useState(false);
  const cancelUploadRef = useRef<(() => void) | null>(null);

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

  // ✅ BUG 14 FIX: Load user data once on mount and cache it
  useEffect(() => {
     if(user) {
         // 1. Try to load from local cache instantly
         AsyncStorage.getItem(`user_profile_${user.uid}`).then(cached => {
             if (cached) {
                 const parsed = JSON.parse(cached);
                 setCurrentUserData(parsed);
                 if (parsed.avatar) setAvatar(parsed.avatar);
             }
         });

         // 2. Fetch fresh from Firestore and update cache
         getDoc(doc(db, "users", user.uid)).then(docSnap => {
             if(docSnap.exists()) {
                 const data = docSnap.data();
                 setCurrentUserData(data);
                 if (data.avatar) setAvatar(data.avatar);
                 AsyncStorage.setItem(`user_profile_${user.uid}`, JSON.stringify(data));
             }
         });
     }
  }, [user]);

  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, 
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      if (asset.fileSize) {
          const isVideo = asset.type === 'video';
          const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
          const limitLabel = isVideo ? '20MB' : '5MB';

          if (asset.fileSize > limit) {
              showAlert('error', 'File Too Large', `Please select a ${isVideo ? 'video' : 'image'} under ${limitLabel}.`);
              return; 
          }
      }
      
      setMedia(asset);
    }
  };

  const processMedia = async (uri: string, type: 'image' | 'video') => {
    if (type === 'video') return uri; 
    
    console.log("Compressing image...");
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }], 
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipulated.uri;
  };

  const uploadMediaToStorage = async (uri: string, type: 'image' | 'video') => {
    if (!user) throw new Error("No user");
    const processedUri = await processMedia(uri, type);
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
    if (selectedTags.length === 0) {
        return showAlert('warning', 'Topic Required', 'Please select at least one topic for your post.');
    }

    if (!text.trim() && !media) return;

    if (text.length > MAX_CHARS) {
        return showAlert('warning', 'Too Long', `Post text cannot exceed ${MAX_CHARS} characters.`);
    }

    setLoading(true);
    setShowCancel(false);

    try {
      if (!user) throw new Error("Not logged in");

      // ✅ BUG 14 FIX: Use locally cached data instead of making a Firestore query
      const userData = currentUserData || {};
      const realUsername = userData.username || "anonymous";
      const realDisplayName = userData.displayName || user.displayName || "Anonymous";
      const realAvatar = userData.avatar || user.photoURL;
      const realRole = userData.role || 'user'; 

      let mediaUrl = null;
      let mediaType = null;
      
      if (media) {
          mediaType = media.type;
          
          // ✅ BUG 39 FIX: 5-second timer to reveal the Cancel button
          const cancelTimer = setTimeout(() => setShowCancel(true), 5000);

          try {
              // ✅ BUG 39 FIX: 60-second Timeout & Cancel Promise Race
              const uploadPromise = uploadMediaToStorage(media.uri, mediaType);
              
              const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("UPLOAD_TIMEOUT")), 60000) // 60 seconds max
              );
              
              const cancelPromise = new Promise<never>((_, reject) => {
                  cancelUploadRef.current = () => reject(new Error("UPLOAD_CANCELLED"));
              });

              mediaUrl = await Promise.race([uploadPromise, timeoutPromise, cancelPromise]);
              
              clearTimeout(cancelTimer);
              setShowCancel(false);
          } catch (err: any) {
              clearTimeout(cancelTimer);
              setShowCancel(false);
              setLoading(false);
              
              if (err.message === "UPLOAD_TIMEOUT") {
                  return showAlert('error', 'Network Timeout', 'Upload took too long. Please check your connection and try again.');
              }
              if (err.message === "UPLOAD_CANCELLED") {
                  return showAlert('info', 'Cancelled', 'Media upload was cancelled.');
              }
              throw err; // Rethrow to main catch block if it's a real R2 error
          }
      }

      const idToken = await user.getIdToken();
      const response = await fetch(CREATE_POST_URL, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
              text: text,
              mediaUrl: mediaUrl,
              mediaType: mediaType,
              tags: selectedTags,
              displayName: realDisplayName,
              username: realUsername,
              userAvatar: realAvatar,
              role: realRole 
          })
      });

      const result = await response.json();

      if (!response.ok) {
          if (response.status === 429) {
              showAlert('error', '⛔ Slow Down', result.error || 'You are posting too fast. Please wait.');
          } else {
              showAlert('error', 'Post Failed', result.error || 'Something went wrong.');
          }
          return;
      }

      router.back(); 
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("permission-denied")) {
        showAlert('error', '⛔ Blocked', 'You are posting too fast (30s cooldown) or you are banned.');
      } else {
        const friendlyMessage = getFriendlyErrorMessage(error);
        showAlert('error', 'Post Failed', friendlyMessage);
      }
    } finally {
      setLoading(false);
      setShowCancel(false);
    }
  };

  const isPostDisabled = (!text.trim() && !media) || selectedTags.length === 0 || loading || text.length > MAX_CHARS;

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
                // ✅ BUG 39 FIX: Transform Post button into a red Cancel button if upload is hanging
                showCancel && loading ? (
                    <TouchableOpacity
                        onPress={() => {
                            if (cancelUploadRef.current) cancelUploadRef.current();
                        }}
                        style={{
                            backgroundColor: '#ef4444',
                            paddingHorizontal: 15,
                            paddingVertical: 6,
                            borderRadius: 20
                        }}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Cancel Upload</Text>
                    </TouchableOpacity>
                ) : (
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
                    maxLength={MAX_CHARS}
                    value={text}
                    onChangeText={setText}
                />
                
                <Text style={{ textAlign: 'right', color: text.length === MAX_CHARS ? '#ef4444' : theme.subText, fontSize: 12, marginRight: 15, marginTop: -5, marginBottom: 10 }}>
                    {text.length}/{MAX_CHARS}
                </Text>

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