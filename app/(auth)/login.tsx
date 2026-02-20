import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

GoogleSignin.configure({
  webClientId: "891600067276-gd325gpe02fi1ceps35ri17ab7gnlonk.apps.googleusercontent.com", 
});

// ✅ NATIVE ANTI-BOT CAPTCHA DATABASE
const EMOJI_DB = [
    { icon: '🍎', name: 'Red Apple' }, { icon: '🚗', name: 'Car' },
    { icon: '🏀', name: 'Basketball' }, { icon: '🐶', name: 'Dog' },
    { icon: '🎸', name: 'Guitar' }, { icon: '📱', name: 'Mobile Phone' },
    { icon: '🍔', name: 'Burger' }, { icon: '✈️', name: 'Airplane' },
    { icon: '⌚', name: 'Watch' }, { icon: '🚀', name: 'Rocket' },
    { icon: '🧸', name: 'Teddy Bear' }, { icon: '🍕', name: 'Pizza' }
];

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

  // ✅ VERIFICATION STATE
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [targetEmoji, setTargetEmoji] = useState(EMOJI_DB[0]);
  const [captchaOptions, setCaptchaOptions] = useState<typeof EMOJI_DB>([]);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

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

  // ✅ GENERATE CAPTCHA CHALLENGE
  const generateCaptcha = () => {
      const target = EMOJI_DB[Math.floor(Math.random() * EMOJI_DB.length)];
      setTargetEmoji(target);
      const decoys = EMOJI_DB.filter(e => e.icon !== target.icon).sort(() => 0.5 - Math.random()).slice(0, 5);
      setCaptchaOptions([target, ...decoys].sort(() => 0.5 - Math.random()));
      setCaptchaFailed(false);
  };

  // ✅ PROCESS CAPTCHA SELECTION
  const handleCaptchaSelect = async (selectedIcon: string) => {
      if (selectedIcon === targetEmoji.icon) {
          setVerificationVisible(false);
          await AsyncStorage.setItem('termsAccepted', 'true'); // Save locally so they never see it again on this phone
          if (pendingAction) pendingAction(); // Proceed with login
      } else {
          setCaptchaFailed(true);
          setTimeout(() => generateCaptcha(), 800);
      }
  };

  // --- SOCIAL LOGIN ---
  const handleSocialLoginClick = async (provider: 'google' | 'apple') => {
      // ✅ Check local storage first. If passed before, skip modal.
      const hasAccepted = await AsyncStorage.getItem('termsAccepted');
      if (hasAccepted === 'true') {
          executeFirebaseSocialLogin(provider, false);
      } else {
          setPendingAction(() => () => executeFirebaseSocialLogin(provider, true));
          generateCaptcha();
          setAgreedToTerms(false);
          setVerificationVisible(true);
      }
  };

  const executeFirebaseSocialLogin = async (provider: 'google' | 'apple', needsDbUpdate: boolean) => {
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
        const username = user.displayName?.replace(/\s+/g, '').toLowerCase() || `user${Date.now()}`;
        await setDoc(userDocRef, {
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
            lastActiveAt: new Date(), 
            isVerified: false,
            hasAcceptedTerms: true // ✅ Auto-apply if new
        });
      } else {
        const userData = userDoc.data();
        if (userData?.role !== 'user') {
           await signOut(auth); 
           throw new Error("Access Denied: Admins must use web dashboard.");
        }

        // ✅ If it's an old user passing for the first time, update their record!
        if (needsDbUpdate) {
            await updateDoc(userDocRef, { hasAcceptedTerms: true });
        }
      }

    } catch (error: any) {
      if (error.code !== '12501') { 
         console.error(error);
         showAlert('error', 'Login Failed', getFriendlyErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  // --- EMAIL LOGIN ---
  const handleLoginClick = async () => {
    if(!email || !password) {
      return showAlert('warning', 'Missing Info', 'Please fill in both email and password fields.');
    }

    // ✅ Check local storage first
    const hasAccepted = await AsyncStorage.getItem('termsAccepted');
    if (hasAccepted === 'true') {
        executeFirebaseEmailLogin(false);
    } else {
        setPendingAction(() => () => executeFirebaseEmailLogin(true));
        generateCaptcha();
        setAgreedToTerms(false);
        setVerificationVisible(true);
    }
  };

  const executeFirebaseEmailLogin = async (needsDbUpdate: boolean) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userRole = userData.role || 'user'; 
        
        if (userRole !== 'user') {
          await signOut(auth); 
          setLoading(false);
          return showAlert('error', 'Access Denied', 'This app is for Viewers only.');
        }

        // ✅ If it's an old user passing for the first time, update their record!
        if (needsDbUpdate) {
            await updateDoc(userDocRef, { hasAcceptedTerms: true });
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
          <TouchableOpacity onPress={() => { setResetEmail(email); setResetModalVisible(true); }} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            <Text style={{ color: theme.tint, fontWeight: '600' }}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ TRIGGERS NEW FLOW */}
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.tint }]}
          onPress={handleLoginClick}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Log In</Text>}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.subText }]}>Or continue with</Text>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
        </View>

        <View style={styles.socialRow}>
            {/* ✅ TRIGGERS NEW FLOW */}
            <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialLoginClick('google')}>
                <Ionicons name="logo-google" size={24} color={theme.text} />
                <Text style={[styles.socialText, { color: theme.text }]}>Google</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
                <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border }]} onPress={() => handleSocialLoginClick('apple')}>
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

      {/* ✅ VERIFICATION MODAL */}
      <Modal visible={verificationVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                <View style={styles.modalHeader}>
                    <Ionicons name="shield-checkmark" size={28} color={theme.tint} />
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Security Verification</Text>
                </View>
                
                <TouchableOpacity style={styles.checkboxRow} onPress={() => setAgreedToTerms(!agreedToTerms)} activeOpacity={0.7}>
                    <Ionicons name={agreedToTerms ? "checkbox" : "square-outline"} size={26} color={agreedToTerms ? theme.tint : theme.subText} />
                    <Text style={[styles.checkboxText, { color: theme.text }]}>
                        I agree to the <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Terms & Conditions</Text> and <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Privacy Policy</Text>.
                    </Text>
                </TouchableOpacity>

                {agreedToTerms ? (
                    <View style={styles.captchaSection}>
                        <Text style={[styles.captchaPrompt, { color: theme.text }]}>Prove you are human: Select the <Text style={{ fontWeight: 'bold', color: theme.tint, fontSize: 16 }}>{targetEmoji.name}</Text></Text>
                        <View style={styles.captchaGrid}>
                            {captchaOptions.map((item, index) => (
                                <TouchableOpacity key={index} style={[styles.emojiBtn, { backgroundColor: theme.background, borderColor: captchaFailed ? '#FF6B6B' : theme.border }]} onPress={() => handleCaptchaSelect(item.icon)}>
                                    <Text style={styles.emojiText}>{item.icon}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {captchaFailed && <Text style={styles.errorText}>Incorrect selection. Generating new challenge...</Text>}
                    </View>
                ) : (
                    <View style={styles.captchaPlaceholder}>
                        <Ionicons name="lock-closed" size={30} color={theme.subText} opacity={0.3} />
                        <Text style={{ color: theme.subText, fontSize: 12, marginTop: 8, opacity: 0.6 }}>Agree to terms to unlock verification</Text>
                    </View>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setVerificationVisible(false)}>
                    <Text style={{ color: theme.subText, fontWeight: 'bold', fontSize: 16 }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

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
                      <TouchableOpacity onPress={() => setResetModalVisible(false)} style={styles.cancelBtn_forgot}>
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
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 14 },
  socialRow: { flexDirection: 'row', gap: 15 },
  socialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 10 },
  socialText: { fontWeight: '600', fontSize: 16 },

  // MODAL STYLES (Shared)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, paddingBottom: 40, elevation: 10 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 25 },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(150,150,150,0.1)', padding: 15, borderRadius: 12, marginBottom: 20 },
  checkboxText: { flex: 1, marginLeft: 12, fontSize: 14, lineHeight: 20 },
  captchaSection: { marginTop: 10, paddingBottom: 15 },
  captchaPrompt: { fontSize: 15, marginBottom: 15, textAlign: 'center' },
  captchaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  emojiBtn: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  emojiText: { fontSize: 35 },
  errorText: { color: '#FF6B6B', textAlign: 'center', marginTop: 15, fontSize: 12, fontWeight: 'bold' },
  captchaPlaceholder: { height: 150, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(150,150,150,0.05)', borderRadius: 16, marginTop: 10, marginBottom: 15, borderWidth: 1, borderColor: 'transparent', borderStyle: 'dashed' },
  cancelBtn: { marginTop: 15, paddingVertical: 15, alignItems: 'center' },

  // Forgot password specific
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 10, width: '100%' },
  cancelBtn_forgot: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  confirmBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8 }
});