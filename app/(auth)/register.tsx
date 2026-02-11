import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithCredential,
    signOut, // ✅ Added signOut
    updateProfile
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView,
    Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CustomAlert from '../../components/CustomAlert';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';
import { getFriendlyErrorMessage } from '../../utils/errorHandler';

GoogleSignin.configure({
  webClientId: "891600067276-gd325gpe02fi1ceps35ri17ab7gnlonk.apps.googleusercontent.com", 
});

export default function SignUpScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  const handleSocialSignUp = async (provider: 'google' | 'apple') => {
    setLoading(true);
    try {
      let credential;

      if (provider === 'google') {
        await GoogleSignin.hasPlayServices();
        try { await GoogleSignin.signOut(); } catch (e) { }

        const response = await GoogleSignin.signIn();
        const idToken = response.data?.idToken;
        if (!idToken) throw new Error("Google Sign-In failed: No ID Token found.");

        credential = GoogleAuthProvider.credential(idToken);
      } else {
        const appleCredential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        credential = new OAuthProvider('apple.com').credential({
          idToken: appleCredential.identityToken!,
          accessToken: appleCredential.authorizationCode!,
        });
      }

      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const generatedUsername = user.displayName?.replace(/\s+/g, '').toLowerCase() || `user${Date.now().toString().slice(-6)}`;
        
        await setDoc(userDocRef, {
            username: generatedUsername,
            displayName: user.displayName || "User",
            email: user.email,
            role: 'user', // Default role
            rank: 'GENIN',
            avatar: user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + generatedUsername,
            bio: "I'm new here!",
            followers: [],
            following: [],
            createdAt: new Date(),
            lastActiveAt: new Date(),
            isVerified: false 
        });
        showAlert('success', 'Welcome!', 'Your account has been created successfully.');
      } else {
        // ✅ FIX: Check Role if user already exists!
        const userData = userDoc.data();
        if (userData?.role !== 'user') {
            await signOut(auth); // Kick them out immediately
            throw new Error("Access Denied: This account is restricted to the Web Dashboard.");
        }
        router.replace('/(tabs)');
      }

    } catch (error: any) {
        if (error.code !== '12501') {
            console.error(error);
            showAlert('error', 'Sign Up Failed', getFriendlyErrorMessage(error));
        }
    } finally {
        setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !username) {
        return showAlert('warning', 'Missing Fields', 'Please fill in all fields to continue.');
    }
    if (password.length < 6) {
        return showAlert('warning', 'Weak Password', 'Password must be at least 6 characters long.');
    }

    setLoading(true);

    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username.toLowerCase()));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            setLoading(false);
            return showAlert('error', 'Username Taken', 'This username is already in use. Please choose another.');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: username });

        await setDoc(doc(db, "users", user.uid), {
            username: username.toLowerCase(),
            displayName: username,
            email: email,
            role: 'user',
            rank: 'GENIN',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username,
            bio: "I'm new here!",
            followers: [],
            following: [],
            createdAt: new Date(),
            lastActiveAt: new Date(),
            isVerified: false 
        });

        showAlert('success', 'Welcome!', 'Your account has been created successfully.');

    } catch (error: any) {
        showAlert('error', 'Sign Up Failed', getFriendlyErrorMessage(error));
    } finally {
        setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}>
            
            <Text style={[styles.title, { color: theme.text }]}>Create Account</Text>
            <Text style={[styles.subtitle, { color: theme.subText }]}>Join the AniYu community!</Text>

            <View style={styles.form}>
                <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="person-outline" size={20} color={theme.subText} style={styles.icon} />
                    <TextInput 
                        placeholder="Username" 
                        placeholderTextColor={theme.subText} 
                        style={[styles.input, { color: theme.text }]} 
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                    />
                </View>

                <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="mail-outline" size={20} color={theme.subText} style={styles.icon} />
                    <TextInput 
                        placeholder="Email" 
                        placeholderTextColor={theme.subText} 
                        style={[styles.input, { color: theme.text }]} 
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                </View>

                <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.subText} style={styles.icon} />
                    <TextInput 
                        placeholder="Password" 
                        placeholderTextColor={theme.subText} 
                        style={[styles.input, { color: theme.text }]} 
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity 
                    style={[styles.button, { backgroundColor: theme.tint }]} 
                    onPress={handleSignUp}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign Up</Text>}
                </TouchableOpacity>
            </View>

            <View style={styles.dividerContainer}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.subText }]}>Or sign up with</Text>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.socialRow}>
                <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialSignUp('google')}>
                    <Ionicons name="logo-google" size={24} color={theme.text} />
                    <Text style={[styles.socialText, { color: theme.text }]}>Google</Text>
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                    <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialSignUp('apple')}>
                        <Ionicons name="logo-apple" size={24} color={theme.text} />
                        <Text style={[styles.socialText, { color: theme.text }]}>Apple</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.footer}>
                <Text style={{ color: theme.subText }}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/login')}>
                    <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Log In</Text>
                </TouchableOpacity>
            </View>

        </ScrollView>

        <CustomAlert 
            visible={alertConfig.visible}
            type={alertConfig.type}
            title={alertConfig.title}
            message={alertConfig.message}
            onClose={() => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                if (alertConfig.type === 'success') {
                    router.replace('/(tabs)');
                }
            }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 25 },
  backBtn: { position: 'absolute', top: 20, left: 20, zIndex: 10 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, marginTop: 60 },
  subtitle: { fontSize: 16, marginBottom: 40 },
  form: { width: '100%' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 15, paddingHorizontal: 15, height: 55 },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },
  button: { height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 14 },
  socialRow: { flexDirection: 'row', gap: 15 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 10 },
  socialText: { fontWeight: '600', fontSize: 16 },
});