import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';

import CustomAlert from '../../components/CustomAlert';
import TrendingRail from '../../components/TrendingRail';
import { getFavorites } from '../../services/favoritesService';

// ✅ RANKING SYSTEM CONFIGURATION
const RANKS = [
    { name: 'GENIN', min: 0, max: 4 },
    { name: 'CHUNIN', min: 5, max: 19 },
    { name: 'JONIN', min: 20, max: 49 },
    { name: 'ANBU', min: 50, max: 99 },
    { name: 'KAGE', min: 100, max: Infinity },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [favorites, setFavorites] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null); 
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Track previous rank to detect upgrades
  const prevRankRef = useRef<string | null>(null);

  // ✅ New State for Custom Alert
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  // Load data whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => { 
        loadProfileData(); 
    }, [])
  );

  // ✅ EFFECT: Check for Rank Up
  useEffect(() => {
    if (userData?.rank) {
        if (prevRankRef.current && prevRankRef.current !== userData.rank) {
            // Rank Changed! Show Celebration Alert
            showAlert(
                'success', 
                '🎉 RANK PROMOTION!', 
                `Congratulations! You have been promoted to ${userData.rank}. Keep watching to reach the next level!`
            );
        }
        prevRankRef.current = userData.rank;
    }
  }, [userData?.rank]);

  const loadProfileData = async () => {
    setRefreshing(true);
    try {
        const favs = await getFavorites();
        setFavorites(favs);

        const user = auth.currentUser;
        if (user) {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    // Keep native alert for Logout (Safety: allows Cancel option)
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut(auth) }
    ]);
  };

  const followingCount = userData?.following?.length || 0;
  const followersCount = userData?.followers?.length || 0;
  
  // Get "Watched" count from DB
  const completedCount = userData?.completedAnimeCount || 0;
  const userRank = userData?.rank || "GENIN";

  // Progress Bar Logic
  const currentRankIndex = RANKS.findIndex(r => r.name === userRank);
  const nextRank = RANKS[currentRankIndex + 1];
  const currentRankMin = RANKS[currentRankIndex]?.min || 0;
  
  let progressPercent = 0;
  let nextRankName = "MAX";

  if (nextRank) {
      const totalNeeded = nextRank.min - currentRankMin;
      const currentProgress = completedCount - currentRankMin;
      progressPercent = Math.min(Math.max(currentProgress / totalNeeded, 0), 1);
      nextRankName = nextRank.name;
  } else {
      progressPercent = 1; // Max Level
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadProfileData} tintColor={theme.tint} />}
      >
        
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
             <Image 
                source={{ uri: userData?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' }} 
                style={[styles.avatar, { borderColor: theme.tint }]} 
             />
             {/* Dynamic Rank Badge */}
             <View style={[styles.rankBadge, { borderColor: theme.background, backgroundColor: '#FFD700' }]}>
                 <Text style={styles.rankText}>{userRank}</Text>
             </View>
          </View>
          
          <Text style={[styles.displayName, { color: theme.text }]}>
            {userData?.displayName || "New User"}
          </Text>
          <Text style={[styles.username, { color: theme.subText }]}>
            @{userData?.username || "username"}
          </Text>
          
          <Text style={[styles.bio, { color: theme.subText }]}>
            {userData?.bio || "No bio yet."}
          </Text>

          <TouchableOpacity 
            style={[styles.editBtn, { borderColor: theme.border }]}
            onPress={() => router.push('/edit-profile')}
          >
            <Text style={{ color: theme.text, fontWeight: '600' }}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={[styles.statsRow, { backgroundColor: theme.card }]}>
            
            <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push({ pathname: '/user-list', params: { type: 'following' } })}
            >
                <Text style={[styles.statNum, { color: theme.text }]}>{followingCount}</Text>
                <Text style={[styles.statLabel, { color: theme.subText }]}>Following</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            
            <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push({ pathname: '/anime-list', params: { type: 'watched' } })}
            >
                <Text style={[styles.statNum, { color: theme.text }]}>{completedCount}</Text>
                <Text style={[styles.statLabel, { color: theme.subText }]}>Watched</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push({ pathname: '/anime-list', params: { type: 'favorites' } })}
            >
                <Text style={[styles.statNum, { color: theme.text }]}>{favorites.length}</Text>
                <Text style={[styles.statLabel, { color: theme.subText }]}>Favorites</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            
            <TouchableOpacity 
                style={styles.statItem}
                onPress={() => router.push({ pathname: '/user-list', params: { type: 'followers' } })}
            >
                <Text style={[styles.statNum, { color: theme.text }]}>{followersCount}</Text>
                <Text style={[styles.statLabel, { color: theme.subText }]}>Followers</Text>
            </TouchableOpacity>
        </View>

        {/* Progress Bar UI */}
        <View style={{ paddingHorizontal: 20, marginTop: 15 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ color: theme.tint, fontWeight: 'bold', fontSize: 12 }}>{userRank}</Text>
                <Text style={{ color: theme.subText, fontSize: 12, fontWeight: 'bold' }}>{nextRankName}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: theme.card, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ 
                    height: '100%', 
                    width: `${progressPercent * 100}%`, 
                    backgroundColor: theme.tint,
                    borderRadius: 4 
                }} />
            </View>
        </View>

        {/* See All Favorites */}
        <View style={{ marginTop: 20 }}>
            {favorites.length > 0 && (
                <TrendingRail 
                    title="My Favorites ❤️" 
                    data={favorites} 
                    onMore={() => router.push('/anime-list?type=favorites')}
                />
            )}
        </View>

        {/* Menu */}
        <View style={styles.menuContainer}>
            <MenuItem icon="settings-outline" label="Settings" theme={theme} onPress={() => router.push('/settings')} isLink />
            <MenuItem icon="download-outline" label="Downloads" theme={theme} onPress={() => router.push('/downloads')} isLink />
            <MenuItem icon="notifications-outline" label="Notifications" theme={theme} onPress={() => router.push('/notifications')} isLink />
            
            {/* ✅ ADDED: Privacy Policy Button */}
            <MenuItem icon="shield-checkmark-outline" label="Privacy & Terms" theme={theme} onPress={() => router.push('/privacy-policy')} isLink />
            
            <MenuItem icon="help-circle-outline" label="Help & Support" theme={theme} onPress={() => router.push('/help-support')} isLink />
            
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 107, 107, 0.1)' }]}>
                    <Ionicons name="log-out-outline" size={22} color={theme.tint} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.tint }]}>Log Out</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.subText} />
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ✅ Render Custom Alert */}
      <CustomAlert 
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, theme, onPress }: any) {
    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress}>
            <View style={[styles.iconBox, { backgroundColor: theme.card }]}>
                <Ionicons name={icon} size={22} color={theme.text} />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.subText} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { alignItems: 'center', marginTop: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3 },
  rankBadge: { 
      position: 'absolute', 
      bottom: 0, 
      right: 0, 
      paddingHorizontal: 8, 
      paddingVertical: 2, 
      borderRadius: 10, 
      borderWidth: 2,
      minWidth: 50,
      alignItems: 'center'
  },
  rankText: { fontSize: 10, fontWeight: 'bold', color: 'black' },
  displayName: { fontSize: 22, fontWeight: 'bold', marginTop: 12 },
  username: { fontSize: 14, marginTop: 2 },
  bio: { marginTop: 8, textAlign: 'center', paddingHorizontal: 40, fontSize: 13, lineHeight: 18 },
  editBtn: { marginTop: 15, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 25, paddingVertical: 20, marginHorizontal: 20, borderRadius: 16 },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 11 },
  divider: { width: 1, height: '80%', alignSelf: 'center' },
  menuContainer: { marginTop: 30, paddingHorizontal: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
});