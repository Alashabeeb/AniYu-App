import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lastUpdated, { color: theme.subText }]}>Last Updated: March 2026</Text>

        <Text style={[styles.introText, { color: theme.subText }]}>
          Welcome to AniYu ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the AniYu mobile application and associated services (collectively, the "Platform").
          {'\n\n'}
          AniYu is developed and operated by Aniyu Ventures, a business registered under the Companies and Allied Matters Act 2020 in the Federal Republic of Nigeria (Business Name Registration No. 9158767). AniYu operates globally and this Privacy Policy is designed to comply with applicable data protection laws across all jurisdictions in which we operate, including but not limited to Nigeria, the European Union, the United States, Brazil, the United Arab Emirates, Saudi Arabia, and Southeast Asian territories.
          {'\n\n'}
          Please read this Privacy Policy carefully. If you do not agree with its terms, please discontinue use of the Platform immediately.
        </Text>

        <Section title="1. INFORMATION WE COLLECT" theme={theme}>
          <Text style={{fontWeight: 'bold', color: theme.text}}>1.1 Information You Provide Directly:</Text> We collect information that you voluntarily provide when you register on the Platform, interact with its features, or contact us. This includes Account Information (email, username, password), Profile Information (avatar, bio), Community Content (posts, comments, reactions), Reading and Viewing History, and Communications.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>1.2 Information Collected Automatically:</Text> When you access or use the Platform, we automatically collect certain technical and usage information, including Device Information (IP address, device type, OS), Usage Data (pages accessed, time spent), Language and Location Preferences, and Diagnostic Data (crash reports).{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>1.3 Information from Third-Party Services:</Text> We integrate with third-party services that may collect or process your information: Google Firebase (authentication, database, analytics), Cloudflare R2 (storage), Google AdMob (advertising), and Apple/Google App Stores.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>1.4 Tracking Technologies:</Text> We and our third-party partners use cookies, SDKs, and advertising identifiers to collect usage information, deliver advertising, and improve the Platform. You may manage your advertising preferences through your device settings.
        </Section>

        <Section title="2. HOW WE USE YOUR INFORMATION" theme={theme}>
          <Text style={{fontWeight: 'bold', color: theme.text}}>2.1 Purposes of Processing:</Text> Account Creation, Service Delivery (anime/manga access, downloads), Community Features, Personalisation, Advertising (via AdMob on free tier), Analytics, Communications, Legal Compliance, and Safety/Security.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>2.2 Legal Basis for Processing (GDPR):</Text> For users in applicable jurisdictions, we process data based on Contractual Necessity, Legitimate Interests, Consent, and Legal Obligation. You may withdraw consent at any time.
        </Section>

        <Section title="3. HOW WE SHARE YOUR INFORMATION" theme={theme}>
          We do not sell, rent, or trade your personal information. We may share it in these circumstances:{'\n\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>Third-Party Service Providers:</Text> Trusted vendors like Google Firebase, Cloudflare, Google AdMob, Apple, and Google.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>Independent Content Creators:</Text> Aggregated, non-personally identifiable engagement metrics.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>Legal Requirements:</Text> To comply with applicable laws, court orders, or protect rights and safety.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>Business Transfers:</Text> In the event of a merger, acquisition, or sale of assets.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>With Your Consent:</Text> When you give explicit consent.
        </Section>

        <Section title="4. INTERNATIONAL DATA TRANSFERS" theme={theme}>
          AniYu operates globally. Your data may be transferred to and processed in countries other than your residence (e.g., the US via Google Firebase/Cloudflare). We implement appropriate safeguards like Standard Contractual Clauses (SCCs) and data processing agreements to ensure data remains protected.
        </Section>

        <Section title="5. DATA RETENTION" theme={theme}>
          We retain your personal information only as long as necessary. Account info and community content are kept for the duration of your account and deleted within 30-90 days of termination. Analytics data is kept up to 24 months, and legal/compliance records up to 7 years.
        </Section>

        <Section title="6. DATA SECURITY" theme={theme}>
          We use industry-standard encryption, secure cloud infrastructure, and access controls to protect your data. However, no electronic storage is 100% secure. You transmit information at your own risk.
        </Section>

        <Section title="7. YOUR PRIVACY RIGHTS" theme={theme}>
          Depending on your location (e.g., EU GDPR, Nigerian NDPR, California CCPA, Brazil LGPD, Middle East, Southeast Asia), you may have rights to:{'\n'}
          • Access, correct, or delete your personal data.{'\n'}
          • Restrict processing or request data portability.{'\n'}
          • Withdraw consent or object to certain processing.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Account Deletion:</Text> You may review, update, or delete your account through the app settings or by contacting us. We will process deletion within 90 days.
        </Section>

        <Section title="8. CHILDREN'S PRIVACY" theme={theme}>
          AniYu is not directed to children under 13, and we do not knowingly collect their data without parental consent (complying with COPPA). If we learn of unauthorized data collection from a child under 13, we will immediately deactivate the account and delete the data.
        </Section>

        <Section title="9. ADVERTISING AND YOUR CHOICES" theme={theme}>
          Our free tier is supported by Google AdMob, which may use identifiers to serve personalized ads. You can opt out of personalized tracking via your Android or iOS device settings (e.g., "Opt out of Ads Personalization" or "Allow Apps to Request to Track"). Non-personalized ads will still be displayed.
        </Section>

        <Section title="10. THIRD-PARTY LINKS AND SERVICES" theme={theme}>
          The Platform may contain links to third-party websites or services. This Privacy Policy does not apply to them, and AniYu is not responsible for their privacy practices.
        </Section>

        <Section title="11. DATA PROTECTION AND CONTACT" theme={theme}>
          For privacy-related enquiries or data rights requests, contact our privacy team:{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Email:</Text> aniyuhq@gmail.com (Subject: Privacy Enquiry / Data Rights Request){'\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Address:</Text> 7 Adeyemo Street, Ibadan, Oyo State, Nigeria{'\n'}
          We aim to respond within 30 days.
        </Section>

        <Section title="12. CHANGES TO THIS PRIVACY POLICY" theme={theme}>
          We may update this policy periodically. Material changes will be communicated via in-app notifications, email, or updating the "Last Updated" date. Continued use constitutes acceptance.
        </Section>

        <Section title="13. GOVERNING LAW" theme={theme}>
          This Privacy Policy is governed by the laws of the Federal Republic of Nigeria, including the NDPR, without limiting mandatory data protection laws in your jurisdiction (e.g., GDPR, CCPA).
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({ title, children, theme }: any) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.sectionText, { color: theme.subText }]}>{children}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  lastUpdated: { fontSize: 12, marginBottom: 20, fontStyle: 'italic', fontWeight: 'bold' },
  introText: { fontSize: 14, lineHeight: 22, marginBottom: 25 },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  sectionText: { fontSize: 14, lineHeight: 22 },
});