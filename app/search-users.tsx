import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';

// 🔐 SECURITY: Max search length
const MAX_SEARCH_CHARS = 15;

export default function SearchUsersScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔍 USER-ONLY SEARCH LOGIC
  const handleSearch = async () => {
      if (!searchText.trim()) return;
      // 🔐 SECURITY: Validate search length
      if (searchText.trim().length > MAX_SEARCH_CHARS) return;
      // 🔐 SECURITY: Strip special characters before Firestore range query
      const sanitizedText = searchText.trim().toLowerCase().replace(/[^\w]/gi, '');
      if (!sanitizedText) return;

      setLoading(true);
      setResults([]);

      try {
          // Firestore doesn't have full-text search, so we search by exact/prefix username
          // Note: This searches for usernames starting with the search text
          const usersRef = collection(db, 'users');
          const q = query(
              usersRef, 
              where('username', '>=', sanitizedText), 
              where('username', '<=', sanitizedText + '\uf8ff'),
              limit(20)
          );

          const snapshot = await getDocs(q);
          const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setResults(users);
      } catch (error) {
          console.error("Search error:", error);
      } finally {
          setLoading(false);
      }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Search Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          
          <View style={[styles.searchBar, { backgroundColor: theme.card }]}>
              <Ionicons name="search" size={20} color={theme.subText} />
              <TextInput 
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Search users..."
                  placeholderTextColor={theme.subText}
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoCapitalize="none"
                  maxLength={MAX_SEARCH_CHARS}
              />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchText(''); setResults([]); }}>
                      <Ionicons name="close-circle" size={18} color={theme.subText} />
                  </TouchableOpacity>
              )}
          </View>
      </View>

      {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} size="large" color={theme.tint} />
      ) : (
          <FlatList 
              data={results}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 15 }}
              ListEmptyComponent={
                  !loading && searchText.length > 0 ? (
                      <Text style={{ textAlign: 'center', color: theme.subText, marginTop: 20 }}>
                          No users found matching "{searchText}"
                      </Text>
                  ) : null
              }
              renderItem={({ item }) => (
                  <TouchableOpacity 
                      style={[styles.userCard, { backgroundColor: theme.card }]}
                      onPress={() => router.push({ pathname: '/feed-profile', params: { userId: item.id } })}
                  >
                      <Image 
                          source={{ uri: item.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anime' }} 
                          style={styles.avatar} 
                      />
                      <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: theme.text }]}>{item.displayName}</Text>
                          <Text style={[styles.username, { color: theme.subText }]}>@{item.username}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.subText} />
                  </TouchableOpacity>
              )}
          />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 40, borderRadius: 20 },
  input: { flex: 1, marginLeft: 10, fontSize: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  name: { fontSize: 16, fontWeight: 'bold' },
  username: { fontSize: 14 }
});