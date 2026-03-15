import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
// ✅ ADDED: collection, getDocs, query, where
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ IMPORT ADMOB
import { useRewardedAd } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

import CustomAlert from '../components/CustomAlert';
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { uploadToR2 } from '../services/r2Storage';

// ✅ Genres for the user to select their interests
const GENRES = [
    "Action", "Adventure", "Romance", "Fantasy", "Drama", "Comedy", 
    "Sci-Fi", "Slice of Life", "Sports", "Mystery", "Isekai", "Horror", 
    "Psychological", "Mecha", "Supernatural"
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [banner, setBanner] = useState('');

  // ✅ State to hold user interests
  const [interests, setInterests] = useState<string[]>([]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  // ✅ ADMOB: Initialize the Rewarded Ad Hook
  const { isLoaded, isClosed, isEarnedReward, load, show } = useRewardedAd(AdUnitIds.rewarded, {
      requestNonPersonalizedAdsOnly: true,
  });

  // ✅ ADMOB: Pre-load the ad securely when the screen opens
  useEffect(() => {
      load();
  }, [load]);

  // ✅ ADMOB: Listen for when the ad finishes to execute the save
  useEffect(() => {
      if (isClosed) {
          if (isEarnedReward) {
              performSave(); // The user watched the ad, now actually save it!
          } else {
              // User skipped the ad
              setLoading(false);
              showAlert('warning', 'Save Canceled', 'You must watch the full ad to save your profile changes.');
          }
          load(); // Load the next ad just in case they want to try again
      }
  }, [isClosed, isEarnedReward, load]);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        setDisplayName(data.displayName || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
        setAvatar(data.avatar || '');
        setBanner(data.banner || '');
        setInterests(data.interests || data.favoriteGenres || []);
    }
  };

  const pickImage = async (type: 'avatar' | 'banner') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'avatar' ? [1, 1] : [16, 9],
      quality: 0.5,
    });

    if (!result.canceled) {
        uploadImage(result.assets[0].uri, type);
    }
  };

  const uploadImage = async (uri: string, type: 'avatar' | 'banner') => {
      setUploading(true);
      try {
          const user = auth.currentUser;
          if (!user) throw new Error("User not found");

          const folderPath = `users/${user.uid}/${type}s`;
          const downloadUrl = await uploadToR2(uri, folderPath);

          if (type === 'avatar') setAvatar(downloadUrl);
          else setBanner(downloadUrl);

      } catch (error: any) {
          console.error(error);
          showAlert('error', 'Upload Failed', 'Could not upload image. Please try again.');
      } finally {
          setUploading(false);
      }
  };

  const toggleInterest = (genre: string) => {
      if (interests.includes(genre)) {
          setInterests(interests.filter(i => i !== genre));
      } else {
          if (interests.length < 5) {
              setInterests([...interests, genre]);
          } else {
              showAlert('warning', 'Limit Reached', 'You can select up to 5 favorite genres.');
          }
      }
  };

  // ✅ ADMOB: The Interceptor Function. This triggers when they click "Save"
  const handleSaveClick = async () => {
      if (!username.trim() || !displayName.trim()) {
          return showAlert('warning', 'Missing Info', 'Username and Display Name are required.');
      }

      if (isLoaded) {
          Alert.alert(
              "Save Profile",
              "Watch a quick ad to save your changes?",
              [
                  { text: "Cancel", style: "cancel" },
                  { 
                      text: "Watch Ad", 
                      onPress: () => {
                          setLoading(true); // Show loading spinner while ad is playing
                          show(); // Trigger the Ad
                      }
                  }
              ]
          );
      } else {
          // Fallback: If ad failed to load, just save it normally so they don't get frustrated
          setLoading(true);
          performSave();
      }
  };

  // ✅ UPDATED: Renamed to performSave. This holds your exact original save logic.
  const performSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const lowerCaseUsername = username.trim().toLowerCase();

        // 1. Get current data to check if username actually changed
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const currentData = userDocSnap.data();

        // 2. Only check uniqueness if the username is DIFFERENT from what they already have
        if (currentData && currentData.username !== lowerCaseUsername) {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", lowerCaseUsername));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                setLoading(false);
                return showAlert('error', 'Username Taken', 'This username is already taken by another user.');
            }
        }

        // 3. Update Profile 
        await updateDoc(userDocRef, {
            displayName: displayName.trim(),
            username: lowerCaseUsername, 
            bio: bio.trim(),
            avatar,
            banner,
            interests 
        });
        showAlert('success', 'Profile Updated', 'Your changes have been saved successfully.');
    } catch (error) {
        console.error(error);
        showAlert('error', 'Update Failed', 'Could not update profile. Please check your connection.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
                
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="close" size={28} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: theme.text }]}>Edit Profile</Text>
                    {/* ✅ UPDATED: Now triggers handleSaveClick which fires the ad */}
                    <TouchableOpacity onPress={handleSaveClick} disabled={loading || uploading}>
                        {loading ? <ActivityIndicator color={theme.tint} /> : (
                            <Text style={[styles.saveBtn, { color: theme.tint }]}>Save</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => pickImage('banner')} style={styles.bannerContainer}>
                    {banner ? (
                        <Image source={{ uri: banner }} style={styles.bannerImage} contentFit="cover" />
                    ) : (
                        <View style={[styles.bannerPlaceholder, { backgroundColor: theme.card }]}>
                            <Ionicons name="camera-outline" size={30} color={theme.subText} />
                            <Text style={{ color: theme.subText, marginTop: 5 }}>Tap to add Banner</Text>
                        </View>
                    )}
                    {uploading && <ActivityIndicator style={styles.loader} color="white" />}
                </TouchableOpacity>

                <View style={{ alignItems: 'center', marginTop: -40 }}>
                    <TouchableOpacity onPress={() => pickImage('avatar')}>
                        <Image source={{ uri: avatar || 'https://via.placeholder.com/150' }} style={[styles.avatar, { borderColor: theme.background }]} />
                        <View style={styles.cameraIcon}>
                             <Ionicons name="camera" size={18} color="white" />
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.form}>
                    <Text style={[styles.label, { color: theme.subText }]}>Display Name</Text>
                    <TextInput 
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card }]} 
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Your Name"
                        placeholderTextColor={theme.subText}
                    />

                    <Text style={[styles.label, { color: theme.subText }]}>Username</Text>
                    <TextInput 
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card }]} 
                        value={username}
                        onChangeText={setUsername}
                        placeholder="username"
                        placeholderTextColor={theme.subText}
                        autoCapitalize="none"
                    />

                    <Text style={[styles.label, { color: theme.subText }]}>Bio</Text>
                    <TextInput 
                        style={[styles.input, { color: theme.text, backgroundColor: theme.card, height: 100 }]} 
                        value={bio}
                        onChangeText={setBio}
                        placeholder="Tell us about yourself..."
                        placeholderTextColor={theme.subText}
                        multiline
                    />
                </View>

                <View style={styles.interestsSection}>
                    <View style={styles.interestsHeader}>
                        <Text style={[styles.label, { color: theme.subText, marginBottom: 0 }]}>Favorite Genres</Text>
                        <Text style={{ color: theme.tint, fontSize: 12, fontWeight: 'bold' }}>{interests.length}/5</Text>
                    </View>
                    <Text style={{ color: theme.subText, fontSize: 12, marginBottom: 15 }}>
                        Select your favorite genres to personalize your "For You" timeline.
                    </Text>

                    <View style={styles.chipsContainer}>
                        {GENRES.map(genre => {
                            const isSelected = interests.includes(genre);
                            return (
                                <TouchableOpacity 
                                    key={genre}
                                    onPress={() => toggleInterest(genre)}
                                    style={[
                                        styles.chip, 
                                        { backgroundColor: isSelected ? theme.tint : theme.card, borderColor: isSelected ? theme.tint : theme.border }
                                    ]}
                                >
                                    <Text style={{ color: isSelected ? 'white' : theme.text, fontSize: 13, fontWeight: '600' }}>
                                        {genre}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

            </ScrollView>
        </KeyboardAvoidingView>

        <CustomAlert 
            visible={alertConfig.visible}
            type={alertConfig.type}
            title={alertConfig.title}
            message={alertConfig.message}
            onClose={() => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                if (alertConfig.type === 'success') {
                    router.back(); 
                }
            }}
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold' },
  saveBtn: { fontSize: 16, fontWeight: 'bold' },
  bannerContainer: { width: '100%', height: 120, borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4 },
  cameraIcon: { position: 'absolute', bottom: 5, right: 5, backgroundColor: '#007AFF', padding: 6, borderRadius: 15 },
  loader: { position: 'absolute', top: '40%', left: '45%' },
  form: { marginTop: 20 },
  label: { marginBottom: 5, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  input: { padding: 15, borderRadius: 8, marginBottom: 20, fontSize: 16 },
  
  interestsSection: { marginTop: 10, paddingTop: 20, borderTopWidth: 0.5, borderTopColor: 'rgba(150,150,150,0.3)' },
  interestsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 }
});