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
          Welcome to AniYu ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit or use the AniYu mobile application (the "App").
          {'\n\n'}
          Please read this privacy notice carefully. If you do not agree with the terms of this privacy policy, please do not access the application.
        </Text>

        <Section title="1. Information We Collect" theme={theme}>
          We collect information that you voluntarily provide to us when you register on the App, express an interest in obtaining information about us or our products, or otherwise interact with the App.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Personal Information Provided by You:</Text> We may collect personal information such as your email address, username, and password when you create an account.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Profile and Social Data:</Text> If you choose to use our social features, we collect the information you upload, such as your profile picture (avatar), bio, comments, posts to the community feed, and your "favorites" or watch/read history.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Automatically Collected Information:</Text> When you access the App, we may automatically collect certain information about your device and usage. This includes your device's Internet Protocol (IP) address, operating system version, device manufacturer and model, language preferences, and diagnostic data (such as crash reports).
        </Section>

        <Section title="2. How We Use Your Information" theme={theme}>
          We use personal information collected via our App for a variety of business purposes described below:{'\n\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>To Facilitate Account Creation and Logon Process:</Text> We use your email and password to create your account and keep it secure.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>To Provide and Manage the Services:</Text> To deliver the requested content (anime and manga), sync your offline viewing cache, and manage your watch/read history.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>To Enable User-to-User Communications:</Text> To display your profile, posts, and comments to other users within the App's community feed.{'\n'}
          • <Text style={{fontWeight: 'bold', color: theme.text}}>To Improve Our App:</Text> To perform data analysis, identify usage trends, and evaluate and improve our App, products, services, and user experience.
        </Section>

        <Section title="3. How We Share Your Information" theme={theme}>
          We do not sell, rent, or trade your personal information to third parties for their marketing purposes. We may share your information in the following situations:{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Third-Party Service Providers:</Text> We may share your data with third-party vendors, service providers, contractors, or agents who perform services for us or on our behalf. Specifically, we utilize:{'\n'}
          {'   '}- <Text style={{fontWeight: 'bold', color: theme.text}}>Google Firebase:</Text> For user authentication, database hosting, and app analytics.{'\n'}
          {'   '}- <Text style={{fontWeight: 'bold', color: theme.text}}>Cloudflare (R2):</Text> For secure cloud storage and content delivery.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Legal Obligations:</Text> We may disclose your information where we are legally required to do so in order to comply with applicable law, governmental requests, a judicial proceeding, court order, or legal process.{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Vital Interests and Legal Rights:</Text> We may disclose your information where we believe it is necessary to investigate, prevent, or take action regarding potential violations of our policies, suspected fraud, situations involving potential threats to the safety of any person, and illegal activities.
        </Section>

        <Section title="4. Data Retention and Security" theme={theme}>
          We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy policy, unless a longer retention period is required or permitted by law.{'\n\n'}
          We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure. You transmit personal information to and from our App at your own risk.
        </Section>

        <Section title="5. Your Privacy Rights" theme={theme}>
          Depending on your location, you may have the right to:{'\n'}
          • Request access and obtain a copy of your personal information.{'\n'}
          • Request rectification of any inaccurate data.{'\n'}
          • Request the deletion of your personal information (often referred to as the "right to be forgotten").{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Account Deletion:</Text> You may review, change, or terminate your account at any time by logging into your account settings within the App or contacting us directly. Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases.
        </Section>

        <Section title="6. Policy Regarding Children" theme={theme}>
          We do not knowingly solicit data from or market to children under 13 years of age. By using the App, you represent that you are at least 13 or that you are the parent or guardian of such a minor and consent to such minor dependent’s use of the App. If we learn that personal information from users less than 13 years of age has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records.
        </Section>

        <Section title="7. Changes to This Privacy Policy" theme={theme}>
          We may update this privacy policy from time to time. The updated version will be indicated by an updated "Last Updated" date and the updated version will be effective as soon as it is accessible. We encourage you to review this privacy policy frequently to be informed of how we are protecting your information.
        </Section>

        <Section title="8. Contact Us" theme={theme}>
          If you have questions or comments about this policy, or if you wish to exercise your data rights, you may email us at:{'\n\n'}
          <Text style={{fontWeight: 'bold', color: theme.text}}>Email:</Text> aniyuhq@gmail.com
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