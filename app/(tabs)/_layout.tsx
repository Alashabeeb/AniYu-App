// app/(tabs)/_layout.tsx

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';

const EMOJI_DB = [
    { icon: '🍎', name: 'Red Apple' }, { icon: '🚗', name: 'Car' },
    { icon: '🏀', name: 'Basketball' }, { icon: '🐶', name: 'Dog' },
    { icon: '🎸', name: 'Guitar' }, { icon: '📱', name: 'Mobile Phone' },
    { icon: '🍔', name: 'Burger' }, { icon: '✈️', name: 'Airplane' },
    { icon: '⌚', name: 'Watch' }, { icon: '🚀', name: 'Rocket' },
    { icon: '🧸', name: 'Teddy Bear' }, { icon: '🍕', name: 'Pizza' }
];

export default function TabLayout() {
  const { theme, isDark } = useTheme();
  
  // SEQUENTIAL GATEKEEPER STATES
  const [showTerms, setShowTerms] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  
  // CAPTCHA STATES
  const [targetEmoji, setTargetEmoji] = useState(EMOJI_DB[0]);
  const [captchaOptions, setCaptchaOptions] = useState<typeof EMOJI_DB>([]);
  const [captchaFailed, setCaptchaFailed] = useState(false);

  useEffect(() => {
    checkVerifications();
  }, []);

  const checkVerifications = async () => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;

      // ✅ SURGICAL UPDATE: Keys are now unique to the specific logged-in user!
      const termsKey = `aniyu_terms_${uid}`;
      const captchaKey = `aniyu_captcha_${uid}`;

      const termsAccepted = await AsyncStorage.getItem(termsKey);
      const captchaPassed = await AsyncStorage.getItem(captchaKey);

      if (termsAccepted !== 'true') {
          // Double-check Firebase: Did they already accept it on another device/previous login?
          try {
              const userDoc = await getDoc(doc(db, 'users', uid));
              if (userDoc.exists() && userDoc.data().hasAcceptedTerms) {
                  await AsyncStorage.setItem(termsKey, 'true'); // Save locally so we don't check DB next time
                  
                  // Move to Step 2 (Captcha)
                  if (captchaPassed !== 'true') {
                      generateCaptcha();
                      setShowCaptcha(true);
                  }
                  return; // Exit here since T&C is already done
              }
          } catch (e) { console.log("Error checking Firebase terms:", e); }

          // If not accepted locally OR in Firebase, show the T&C Modal
          setShowTerms(true); 
      } else if (captchaPassed !== 'true') {
          generateCaptcha();
          setShowCaptcha(true); // Stop them at Step 2
      }
  };

  const generateCaptcha = () => {
      const target = EMOJI_DB[Math.floor(Math.random() * EMOJI_DB.length)];
      setTargetEmoji(target);
      const decoys = EMOJI_DB.filter(e => e.icon !== target.icon).sort(() => 0.5 - Math.random()).slice(0, 5);
      setCaptchaOptions([target, ...decoys].sort(() => 0.5 - Math.random()));
      setCaptchaFailed(false);
  };

  // --- STEP 1: THEY CLICKED 'I AGREE' ---
  const handleAcceptTerms = async () => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    await AsyncStorage.setItem(`aniyu_terms_${uid}`, 'true');
    setShowTerms(false);
    
    // Backup: Mark it in their Firebase profile
    try { await updateDoc(doc(db, 'users', uid), { hasAcceptedTerms: true }); } 
    catch (e) { console.log("Error updating terms in DB:", e); }

    // Immediately trigger Step 2
    const captchaPassed = await AsyncStorage.getItem(`aniyu_captcha_${uid}`);
    if (captchaPassed !== 'true') {
        generateCaptcha();
        setShowCaptcha(true);
    }
  };

  // --- STEP 2: THEY CLICKED AN EMOJI ---
  const handleCaptchaSelect = async (selectedIcon: string) => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;

      if (selectedIcon === targetEmoji.icon) {
          await AsyncStorage.setItem(`aniyu_captcha_${uid}`, 'true');
          setShowCaptcha(false);
          // Gatekeeper fully passed! They are now in the app.
      } else {
          setCaptchaFailed(true);
          setTimeout(() => generateCaptcha(), 800);
      }
  };

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tint,
          tabBarInactiveTintColor: isDark ? '#888' : '#ccc', 
          headerShown: false, 
          tabBarStyle: {
            backgroundColor: theme.card, 
            borderTopWidth: 0, 
            height: Platform.OS === 'ios' ? 85 : 60,
            paddingBottom: Platform.OS === 'ios' ? 25 : 8,
            elevation: 0, 
          },
        }}>
        
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => (<Ionicons name={focused ? 'play-circle' : 'play-circle-outline'} size={28} color={color} />) }} />
        <Tabs.Screen name="feed" options={{ title: 'Community', tabBarIcon: ({ color, focused }) => (<Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={26} color={color} />) }} />
        <Tabs.Screen name="comic" options={{ title: 'Manga', tabBarIcon: ({ color, focused }) => (<Ionicons name={focused ? 'book' : 'book-outline'} size={26} color={color} />) }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => (<Ionicons name={focused ? 'person' : 'person-outline'} size={26} color={color} />) }} />
      </Tabs>

      {/* ✅ STEP 1 MODAL: TERMS & CONDITIONS */}
      <Modal visible={showTerms} animationType="slide" transparent={false}>
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <Ionicons name="document-text" size={24} color={theme.tint} />
                <Text style={[styles.headerTitle, { color: theme.text }]}>Terms & Conditions</Text>
            </View>

            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={[styles.termsText, { color: theme.text, fontWeight: 'bold', fontSize: 18, marginBottom: 5 }]}>TERMS AND CONDITIONS & COPYRIGHT POLICY</Text>
                <Text style={[styles.termsText, { color: theme.subText, marginBottom: 20, fontSize: 12 }]}>Last Updated: March 1, 2026</Text>

                <Text style={[styles.termsText, { color: theme.text, marginBottom: 15 }]}>
                    Welcome to AniYu ("we," "our," or "us"). By downloading, accessing, or using the AniYu application (the "App"), you agree to be bound by these Terms and Conditions (the "Terms"). If you do not agree to these Terms, do not use the App.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>1. Acceptance of Terms</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>By registering an account or using the App, you acknowledge that you have read, understood, and agree to be bound by these Terms, as well as our Privacy Policy. You must be at least 13 years old to use this App.</Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>2. User-Generated Content and Social Features</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu allows users to create profiles, post comments, and interact with content ("User Content").{"\n"}
                    • You are solely responsible for the User Content you post.{"\n"}
                    • You agree not to post anything that is illegal, abusive, harassing, or infringes on the intellectual property rights of others.{"\n"}
                    • We reserve the right, but not the obligation, to monitor, edit, or remove User Content at our sole discretion.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>3. Offline Syncing and Caching</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu may provide a feature allowing you to sync or cache certain content for offline viewing ("Offline Sync").{"\n"}
                    • You acknowledge that Offline Sync is provided strictly as a temporary, personal convenience for use exclusively within the AniYu App environment.{"\n"}
                    • Using the Offline Sync feature does not grant you any ownership rights, reproduction rights, or distribution rights to the underlying media files.{"\n"}
                    • Any attempt to extract, decrypt, convert, or distribute cached files outside of the AniYu App is strictly prohibited and constitutes a material breach of these Terms.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>4. Copyright & Intellectual Property Policy</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu respects the intellectual property rights of others and expects its users to do the same. We operate as a service provider and platform. If you are a copyright owner or an authorized agent thereof and believe that any content hosted on AniYu infringes upon your copyrights, you may submit a notification pursuant to international copyright standards (including the DMCA and the Nigerian Copyright Act) by providing our Designated Copyright Agent with the following information in writing:{"\n\n"}
                    • A physical or electronic signature of a person authorized to act on behalf of the owner of an exclusive right that is allegedly infringed;{"\n"}
                    • Identification of the copyrighted work claimed to have been infringed;{"\n"}
                    • Identification of the material that is claimed to be infringing or to be the subject of infringing activity and that is to be removed or access to which is to be disabled, and information reasonably sufficient to permit us to locate the material (e.g., the specific URL or location within the App);{"\n"}
                    • Information reasonably sufficient to permit us to contact you, such as an address, telephone number, and email address;{"\n"}
                    • A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law; and{"\n"}
                    • A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>Contact for Copyright Notices:</Text> Email: aniyuhq@gmail.com{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>Repeat Infringer Policy:</Text> In accordance with applicable law, AniYu has adopted a policy of terminating, in appropriate circumstances and at our sole discretion, users who are deemed to be repeat infringers.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>5. Disclaimers and Limitation of Liability</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMISSIBLE PURSUANT TO APPLICABLE LAW, ANIYU DISCLAIMS ALL WARRANTIES, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.{"\n\n"}
                    UNDER NO CIRCUMSTANCES SHALL ANIYU, ITS DEVELOPERS, OR AFFILIATES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES THAT RESULT FROM THE USE OF, OR THE INABILITY TO USE, THE APP OR MATERIALS ON THE APP, EVEN IF ANIYU HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>6. Governing Law</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>These Terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without giving effect to any principles of conflicts of law.</Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>7. Changes to Terms</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>We reserve the right to modify these Terms at any time. We will notify users of significant changes through the App. Continued use of the App following any changes constitutes your acceptance of the new Terms.</Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>8. Subscriptions and In-App Purchases</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu offers premium features via auto-renewing subscriptions ("Subscriptions") managed through your Apple App Store or Google Play Store account.{"\n"}
                    • <Text style={{fontWeight: 'bold', color: theme.text}}>Payment:</Text> Payment will be charged to your Apple/Google account at confirmation of purchase.{"\n"}
                    • <Text style={{fontWeight: 'bold', color: theme.text}}>Auto-Renewal:</Text> Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period.{"\n"}
                    • <Text style={{fontWeight: 'bold', color: theme.text}}>Cancellation:</Text> You may manage your subscription and turn off auto-renewal by going to your device's Account Settings after purchase. Cancellations take effect at the end of the active billing cycle. We do not provide refunds or credits for any partial subscription periods.
                </Text>
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
                <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: theme.tint }]} onPress={handleAcceptTerms} activeOpacity={0.8}>
                    <Text style={styles.acceptBtnText}>I Agree & Continue</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* ✅ STEP 2 MODAL: BOT CAPTCHA */}
      <Modal visible={showCaptcha} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={[styles.captchaModalContent, { backgroundColor: theme.card }]}>
                <View style={styles.captchaHeader}>
                    <Ionicons name="shield-checkmark" size={28} color={theme.tint} />
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Security Verification</Text>
                </View>
                
                <View style={styles.captchaSection}>
                    <Text style={[styles.captchaPrompt, { color: theme.text }]}>Prove you are human: Select the <Text style={{ fontWeight: 'bold', color: theme.tint, fontSize: 16 }}>{targetEmoji.name}</Text></Text>
                    <View style={styles.captchaGrid}>
                        {captchaOptions.map((item, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={[styles.emojiBtn, { backgroundColor: theme.background, borderColor: captchaFailed ? '#FF6B6B' : theme.border }]} 
                                onPress={() => handleCaptchaSelect(item.icon)}
                            >
                                <Text style={styles.emojiText}>{item.icon}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {captchaFailed && <Text style={styles.errorText}>Incorrect selection. Generating new challenge...</Text>}
                </View>
            </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Tabs & Layout
  modalContainer: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  scrollContent: { flex: 1, padding: 25 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 22, marginBottom: 8 },
  termsText: { fontSize: 14, lineHeight: 22 },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderTopWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
  acceptBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  acceptBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

  // Captcha Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  captchaModalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, paddingBottom: 40, elevation: 10 },
  captchaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },
  captchaSection: { marginTop: 10, paddingBottom: 15 },
  captchaPrompt: { fontSize: 15, marginBottom: 15, textAlign: 'center' },
  captchaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  emojiBtn: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  emojiText: { fontSize: 35 },
  errorText: { color: '#FF6B6B', textAlign: 'center', marginTop: 15, fontSize: 12, fontWeight: 'bold' },
});