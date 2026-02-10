import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
// ✅ ADDED: collection, getDocs, query, where
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
import CustomAlert from '../components/CustomAlert';
import { auth, db, storage } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';

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

  const getBlobFromUri = async (uri: string): Promise<Blob> => {
    const blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
    return blob as Blob;
  };

  const uploadImage = async (uri: string, type: 'avatar' | 'banner') => {
      setUploading(true);
      try {
          const user = auth.currentUser;
          if (!user) throw new Error("User not found");

          const blob = await getBlobFromUri(uri);
          
          const storageRef = ref(storage, `users/${user.uid}/${type}.jpg`);
          const metadata = { contentType: 'image/jpeg' };
          
          await uploadBytesResumable(storageRef, blob, metadata);
          const downloadUrl = await getDownloadURL(storageRef);

          if (type === 'avatar') setAvatar(downloadUrl);
          else setBanner(downloadUrl);

      } catch (error: any) {
          console.error(error);
          if (error.code === 'storage/unauthorized') {
             showAlert('error', 'Permission Denied', 'You cannot upload to this profile.');
          } else {
             showAlert('error', 'Upload Failed', 'Could not upload image. Please try again.');
          }
      } finally {
          setUploading(false);
      }
  };

  // ✅ UPDATED: Handle Save with Unique Username Check
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (!username.trim() || !displayName.trim()) {
        return showAlert('warning', 'Missing Info', 'Username and Display Name are required.');
    }

    setLoading(true);
    try {
        const lowerCaseUsername = username.trim().toLowerCase();

        // 1. Get current data to check if username actually changed
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const currentData = userDocSnap.data();

        // 2. Only check uniqueness if the username is DIFFERENT from what they already have
        if (currentData && currentData.username !== lowerCaseUsername) {
            const usersRef = collection(db, "users");
            // Query for ANY user with this username
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
            username: lowerCaseUsername, // Always save as lowercase for consistency
            bio: bio.trim(),
            avatar,
            banner
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
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="close" size={28} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: theme.text }]}>Edit Profile</Text>
                    <TouchableOpacity onPress={handleSave} disabled={loading || uploading}>
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
});