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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Privacy & Terms</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lastUpdated, { color: theme.subText }]}>Last Updated: February 2026</Text>

        <Section title="1. Introduction" theme={theme}>
          Welcome to AniYu. We are committed to protecting your personal information and your right to privacy. By using our app, you agree to the collection and use of information in accordance with this policy.
        </Section>

        <Section title="2. Information We Collect" theme={theme}>
          We collect information that you provide to us directly, such as when you create an account, update your profile, or post comments. This includes:
          {'\n'}• Username and Email address
          {'\n'}• Profile pictures
          {'\n'}• Watch history and Favorites
        </Section>

        <Section title="3. How We Use Your Information" theme={theme}>
          We use your information to:
          {'\n'}• Provide and maintain our service
          {'\n'}• Monitor the usage of our service
          {'\n'}• Detect, prevent, and address technical issues
          {'\n'}• Provide customer support
        </Section>

        <Section title="4. User Generated Content" theme={theme}>
          You are responsible for the comments and content you post. We reserve the right to remove content that violates our community guidelines, including hate speech, harassment, or spam.
        </Section>

        <Section title="5. Contact Us" theme={theme}>
          If you have any questions about this Privacy Policy, please contact us at:
          {'\n'}support@aniyu.app
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
  lastUpdated: { fontSize: 12, marginBottom: 20, fontStyle: 'italic' },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  sectionText: { fontSize: 14, lineHeight: 22 },
});