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
                <Text style={[styles.termsText, { color: theme.text, fontWeight: 'bold', fontSize: 18, marginBottom: 5 }]}>TERMS OF SERVICE</Text>
                <Text style={[styles.termsText, { color: theme.subText, marginBottom: 20, fontSize: 12 }]}>Global Edition -- Effective March 2026</Text>

                <Text style={[styles.termsText, { color: theme.text, marginBottom: 15 }]}>
                    Welcome to AniYu ("we," "our," or "us"). AniYu is an anime streaming, manga reading, and social community platform developed and operated by Aniyu Ventures, a business registered under the Companies and Allied Matters Act 2020 in the Federal Republic of Nigeria (Business Name Registration No. 9158767).
                    {"\n\n"}
                    These Terms of Service ("Terms") govern your access to and use of the AniYu mobile application, website, and all associated services (collectively, the "Platform"). By accessing or using the Platform, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.
                    {"\n\n"}
                    AniYu operates globally. These Terms are written to comply with applicable laws across multiple jurisdictions including but not limited to Nigeria, the European Union, the United States, Brazil, the United Arab Emirates, the Kingdom of Saudi Arabia, and Southeast Asian territories.
                    {"\n\n"}
                    If you do not agree to these Terms, you must immediately stop using the Platform.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>1. ELIGIBILITY AND ACCOUNT REGISTRATION</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    <Text style={{fontWeight: 'bold', color: theme.text}}>1.1 Minimum Age Requirement:</Text> You must be at least thirteen (13) years of age to use AniYu. Users under the age of eighteen (18) represent that they have obtained the consent of a parent or legal guardian to use the Platform. AniYu reserves the right to request proof of age at any time.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>1.2 COPPA Compliance (US Users):</Text> AniYu does not knowingly collect personal information from children under the age of thirteen (13) in the United States in violation of the Children's Online Privacy Protection Act (COPPA). If we become aware that a user under 13 has provided personal information without verifiable parental consent, we will delete such information immediately.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>1.3 Account Registration:</Text> To access certain features of the Platform, you must create an account. You agree to provide accurate, current, and complete registration information; maintain the security and confidentiality of your account credentials; notify AniYu immediately of any unauthorised use of your account; and accept responsibility for all activities conducted under your account. AniYu reserves the right to suspend or terminate any account that provides false information or violates these Terms.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>2. PLATFORM FEATURES AND PERMITTED USE</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    <Text style={{fontWeight: 'bold', color: theme.text}}>2.1 Available Features:</Text> AniYu provides users with access to anime streaming and discovery, manga and manhua reader, offline content downloads, community feed (social posts, follows, likes, and comments), and independent creator content.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>2.2 Regional Content Availability:</Text> Certain content features are subject to regional licensing restrictions and may not be available in all territories. AniYu reserves the right to restrict, modify, or withdraw content availability in any region at any time. The community features of the Platform are available globally.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>2.3 Permitted Use:</Text> You agree to use the Platform only for lawful purposes. Permitted use includes personal, non-commercial access to available content; engaging with the community feed; sharing original content you have the right to distribute; and following and interacting with other users.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>3. PROHIBITED CONDUCT</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    By using AniYu, you agree that you will NOT:{"\n"}
                    • Post, transmit, or share content that is illegal, defamatory, obscene, harassing, threatening, or abusive.{"\n"}
                    • Infringe upon any third-party intellectual property rights.{"\n"}
                    • Impersonate any person or entity.{"\n"}
                    • Upload or distribute viruses or malicious code.{"\n"}
                    • Attempt to gain unauthorised access to the Platform.{"\n"}
                    • Scrape, crawl, or use automated tools to extract data.{"\n"}
                    • Post content that promotes violence, discrimination, or hatred.{"\n"}
                    • Share sexually explicit or pornographic content.{"\n"}
                    • Attempt to extract, decrypt, convert, or distribute cached or downloaded files outside the AniYu Platform environment.{"\n"}
                    • Circumvent security features or engage in conduct that restricts other users' enjoyment.{"\n\n"}
                    AniYu reserves the right to investigate and take appropriate action against violators.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>4. USER-GENERATED CONTENT</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    <Text style={{fontWeight: 'bold', color: theme.text}}>4.1 Ownership:</Text> You retain all ownership rights to the original content you post ("User Content"). By posting, you grant AniYu a worldwide, non-exclusive, royalty-free, transferable, and sublicensable licence to use, reproduce, distribute, display, and perform your User Content solely for the purposes of operating and promoting the Platform.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>4.2 Your Responsibility:</Text> You are solely responsible for all User Content you submit. You represent that you own or have the necessary rights to post it, and that it does not infringe third-party rights or violate applicable laws.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>4.3 Content Moderation:</Text> AniYu reserves the right to review, edit, or remove any User Content at our sole discretion, without notice, for any reason.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>4.4 Indemnification:</Text> You agree to indemnify and hold harmless AniYu from claims arising from your User Content or violation of these Terms.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>5. INDEPENDENT CREATOR CONTENT</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu may host original works submitted by independent creators under separate agreements. All such content is governed by those specific terms. Users may not reproduce, redistribute, or commercially exploit any creator content hosted on the Platform without express written consent.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>6. OFFLINE DOWNLOADS AND CACHING</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu may provide an offline download feature allowing users to cache certain content for personal, offline use exclusively within the AniYu application ("Offline Content").{"\n"}
                    • Offline Content is provided strictly as a temporary, personal convenience.{"\n"}
                    • It does not grant ownership, reproduction, or distribution rights.{"\n"}
                    • Any attempt to extract, decrypt, convert, or distribute Offline Content outside the AniYu Platform is strictly prohibited.{"\n"}
                    • AniYu reserves the right to revoke offline access at any time.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>7. INTELLECTUAL PROPERTY RIGHTS</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    <Text style={{fontWeight: 'bold', color: theme.text}}>7.1 AniYu's IP:</Text> All rights, title, and interest in and to the AniYu Platform are the exclusive property of Aniyu Ventures.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>7.2 Third-Party Content:</Text> Licensed anime and manga titles are owned by third-party rights holders. You may not reproduce or distribute this content without authorisation.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>7.3 Feedback:</Text> If you provide feedback or ideas, you grant AniYu an unrestricted licence to use them without compensation.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>8. COPYRIGHT POLICY AND DMCA NOTICE</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu respects intellectual property rights and complies with the DMCA, the Nigerian Copyright Act, and applicable international frameworks. If you believe your work has been infringed, please provide our Designated Copyright Agent with a written notice including your signature, identification of the work, location of the material, contact info, and a good-faith statement of unauthorized use.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>Designated Copyright Agent:</Text> aniyuhq@gmail.com | Address: 7 Adeyemo Street, Ibadan, Oyo State, Nigeria{"\n\n"}
                    AniYu operates a repeat infringer policy and may terminate accounts of repeat violators.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>9. MONETISATION, SUBSCRIPTIONS, AND ADVERTISING</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    <Text style={{fontWeight: 'bold', color: theme.text}}>9.1 Free Tier:</Text> AniYu offers a free tier supported by third-party advertising. By using it, you consent to the display of advertisements.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>9.2 Premium Subscriptions:</Text> Subscriptions are charged to your Apple/Google account upon confirmation. They automatically renew unless disabled at least 24 hours before the end of the period. You may manage auto-renewal in your device settings. No refunds are provided for partial periods.{"\n\n"}
                    <Text style={{fontWeight: 'bold', color: theme.text}}>9.3 Price Changes:</Text> AniYu reserves the right to modify pricing with advance notice.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>10. PRIVACY AND DATA PROTECTION</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    Your privacy is important to us. Our collection and use of your data are governed by our Privacy Policy. AniYu processes data in compliance with NDPR, GDPR, CCPA, LGPD, PDPL, and other global regulations. Contact us at aniyuhq@gmail.com to exercise your data rights.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>11. THIRD-PARTY SERVICES</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    The Platform integrates with third-party services (Google AdMob, App Stores, etc.). Your use is subject to their respective terms. AniYu is not responsible for their practices.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>12. DISCLAIMERS AND LIMITATION OF LIABILITY</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    The Platform is provided "as is" and "as available". To the fullest extent permitted by law, AniYu shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform. We disclaim all liability arising from User Content.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>13. ACCOUNT SUSPENSION AND TERMINATION</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu reserves the right to suspend or terminate your account without notice for violating these Terms, engaging in harmful conduct, or extended inactivity. You may terminate your account at any time by contacting us.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>14. GOVERNING LAW AND DISPUTE RESOLUTION</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    These Terms shall be governed by the laws of the Federal Republic of Nigeria. Disputes will first be attempted to be resolved via good-faith negotiation, then referred to binding arbitration. Class action lawsuits are waived where permitted.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>15. CHANGES TO THESE TERMS</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu reserves the right to modify these Terms. Continued use of the Platform following changes constitutes acceptance.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>16. GENERAL PROVISIONS</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    These Terms constitute the entire agreement. If any provision is invalid, the remainder remains in effect. You may not assign these Terms. English is the governing language.
                </Text>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>17. CONTACT INFORMATION</Text>
                <Text style={[styles.termsText, { color: theme.subText }]}>
                    AniYu (Aniyu Ventures){"\n"}
                    Email: aniyuhq@gmail.com{"\n"}
                    Website: www.aniyu.site{"\n"}
                    Address: 7 Adeyemo Street, Ibadan, Oyo State, Nigeria
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