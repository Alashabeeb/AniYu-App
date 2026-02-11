import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import {
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';

import CustomAlert from '../../components/CustomAlert';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';
import { getFriendlyErrorMessage } from '../../utils/errorHandler';

// ✅ CONFIGURE GOOGLE SIGN IN
GoogleSignin.configure({
  webClientId: "891600067276-gd325gpe02fi1ceps35ri17ab7gnlonk.apps.googleusercontent.com", 
});

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Forgot Password State
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: '',
    secondaryButtonText: undefined as string | undefined,
    onSecondaryPress: undefined as (() => void) | undefined
  });

  const showAlert = (
    type: 'success' | 'error' | 'warning' | 'info', 
    title: string, 
    message: string,
    secondaryText?: string,
    secondaryAction?: () => void
  ) => {
    setAlertConfig({ 
      visible: true, 
      type, 
      title, 
      message,
      secondaryButtonText: secondaryText,
      onSecondaryPress: secondaryAction
    });
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      return Alert.alert("Error", "Please enter your email address.");
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetModalVisible(false);
      showAlert('success', 'Email Sent', 'Check your inbox or spam folder for password reset instructions.');
    } catch (error: any) {
      Alert.alert("Error", getFriendlyErrorMessage(error));
    } finally {
      setResetLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setLoading(true);
    try {
      let credential;

      if (provider === 'google') {
        // 1. Check Play Services
        await GoogleSignin.hasPlayServices();

        // ✅ FIX: Force Account Chooser (Sign out first to clear cache)
        try {
            await GoogleSignin.signOut();
        } catch (e) {
            // It's okay if they were already signed out
        }

        // 2. Sign In
        const response = await GoogleSignin.signIn();
        
        // 3. Extract ID Token
        const idToken = response.data?.idToken;
        if (!idToken) throw new Error("Google Sign-In failed: No ID Token found.");

        // 4. Create Credential
        credential = GoogleAuthProvider.credential(idToken);
      } else {
        // Apple Logic
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

      // 5. Sign In to Firebase
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      // 6. Check if User Exists in DB
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        const username = user.displayName?.replace(/\s+/g, '').toLowerCase() || `user${Date.now()}`;
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            displayName: user.displayName || "User",
            email: user.email,
            role: 'user',
            rank: 'GENIN',
            avatar: user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username,
            bio: "I'm new here!",
            followers: [],
            following: [],
            createdAt: new Date(),
            lastActiveAt: new Date(), // ✅ Added Last Active
            isVerified: false 
        });
      } else {
        // ✅ CRITICAL: Check Role if user exists
        const userData = userDoc.data();
        if (userData?.role !== 'user') {
           await signOut(auth); // Kick them out
           throw new Error("Access Denied: Admins must use web dashboard.");
        }
      }

      // Login Successful (Router handles redirect automatically via _layout listener usually)

    } catch (error: any) {
      if (error.code !== '12501') { // Ignore "User cancelled" error
         console.error(error);
         showAlert('error', 'Login Failed', getFriendlyErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if(!email || !password) {
      return showAlert('warning', 'Missing Info', 'Please fill in both email and password fields.');
    }
    
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userRole = userData.role || 'user'; 
        
        if (userRole !== 'user') {
          await signOut(auth); 
          setLoading(false);
          return showAlert('error', 'Access Denied', 'This app is for Viewers only.');
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/user-disabled') {
        showAlert('error', 'Account Suspended', 'Your account has been disabled.');
      } else {
        showAlert('error', 'Login Failed', getFriendlyErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Welcome Back! 👋</Text>
        <Text style={[styles.subtitle, { color: theme.subText }]}>Sign in to continue to AniYu</Text>

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
            placeholder="Enter your email"
            placeholderTextColor={theme.subText}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: theme.text }]}>Password</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
            placeholder="Enter your password"
            placeholderTextColor={theme.subText}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {/* ✅ FORGOT PASSWORD LINK */}
          <TouchableOpacity onPress={() => { setResetEmail(email); setResetModalVisible(true); }} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            <Text style={{ color: theme.tint, fontWeight: '600' }}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.tint }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Log In</Text>}
        </TouchableOpacity>

        {/* ✅ SOCIAL LOGIN DIVIDER */}
        <View style={styles.dividerContainer}>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.subText }]}>Or continue with</Text>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
        </View>

        {/* ✅ SOCIAL BUTTONS */}
        <View style={styles.socialRow}>
            <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialLogin('google')}>
                <Ionicons name="logo-google" size={24} color={theme.text} />
                <Text style={[styles.socialText, { color: theme.text }]}>Google</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
                <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialLogin('apple')}>
                    <Ionicons name="logo-apple" size={24} color={theme.text} />
                    <Text style={[styles.socialText, { color: theme.text }]}>Apple</Text>
                </TouchableOpacity>
            )}
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop: 25 }}>
          <Text style={{ color: theme.subText, textAlign: 'center' }}>
            Don't have an account? <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* ✅ FORGOT PASSWORD MODAL */}
      <Modal visible={resetModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Reset Password</Text>
                  <Text style={{ color: theme.subText, marginBottom: 15 }}>Enter your email to receive a reset link.</Text>
                  
                  <TextInput 
                      style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
                      placeholder="Email Address"
                      placeholderTextColor={theme.subText}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      autoCapitalize="none"
                  />

                  <View style={styles.modalButtons}>
                      <TouchableOpacity onPress={() => setResetModalVisible(false)} style={styles.cancelBtn}>
                          <Text style={{ color: theme.subText }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleForgotPassword} style={[styles.confirmBtn, { backgroundColor: theme.tint }]}>
                          {resetLoading ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>Send Link</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

      <CustomAlert 
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
        secondaryButtonText={alertConfig.secondaryButtonText}
        onSecondaryPress={alertConfig.onSecondaryPress}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  content: { padding: 25 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  subtitle: { fontSize: 16, marginBottom: 30 },
  inputContainer: { marginBottom: 20 },
  label: { marginBottom: 8, fontWeight: '600' },
  input: { padding: 15, borderRadius: 12, borderWidth: 1, fontSize: 16 },
  button: { padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  
  // Social Styles
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 14 },
  socialRow: { flexDirection: 'row', gap: 15 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 10 },
  socialText: { fontWeight: '600', fontSize: 16 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent: { padding: 20, borderRadius: 16, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 10, width: '100%' },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  confirmBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8 }
});