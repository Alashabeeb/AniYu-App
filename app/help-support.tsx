import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error("Link Error:", err);
      Alert.alert("Error", "Could not open this link.");
    }
  };

  // ✅ SURGICAL UPDATE: Navigate to the new Live Chat screen
  const handleLiveChat = () => {
      router.push('/live-chat');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Help & Support</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: theme.subText }]}>
            How would you like to contact us?
        </Text>

        {/* WhatsApp */}
        <TouchableOpacity 
            style={[styles.optionCard, { backgroundColor: theme.card }]}
            onPress={() => openLink('https://wa.me/08111542402')} 
        >
            <View style={[styles.iconBox, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={28} color="white" />
            </View>
            <View style={styles.textContainer}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>WhatsApp</Text>
                <Text style={[styles.optionDesc, { color: theme.subText }]}>Chat with our support team</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.subText} />
        </TouchableOpacity>

        {/* X (Twitter) */}
        <TouchableOpacity 
            style={[styles.optionCard, { backgroundColor: theme.card }]}
            onPress={() => openLink('https://x.com/AniYuApp')} 
        >
            <View style={[styles.iconBox, { backgroundColor: 'black' }]}>
                <Ionicons name="logo-twitter" size={28} color="white" />
            </View>
            <View style={styles.textContainer}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>X (Twitter)</Text>
                <Text style={[styles.optionDesc, { color: theme.subText }]}>Follow us for updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.subText} />
        </TouchableOpacity>

        {/* Live Chat */}
        <TouchableOpacity 
            style={[styles.optionCard, { backgroundColor: theme.card }]}
            onPress={handleLiveChat}
        >
            <View style={[styles.iconBox, { backgroundColor: theme.tint }]}>
                <Ionicons name="chatbubbles" size={28} color="white" />
            </View>
            <View style={styles.textContainer}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>Live Chat</Text>
                <Text style={[styles.optionDesc, { color: theme.subText }]}>Start a conversation now</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.subText} />
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20 },
  subtitle: { fontSize: 16, marginBottom: 20, textAlign: 'center' },
  optionCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2 },
  iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  textContainer: { flex: 1 },
  optionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  optionDesc: { fontSize: 14 }
});