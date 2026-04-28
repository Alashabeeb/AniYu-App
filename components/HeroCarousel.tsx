import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Carousel from 'react-native-reanimated-carousel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth } from '../config/firebaseConfig';

const { width } = Dimensions.get('window');

export default function HeroCarousel({ data }: { data: any[] }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const dailyHeroAnime = useMemo(() => {
      if (!data || data.length === 0) return [];

      const user = auth.currentUser;
      const today = new Date();
      const seedString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}-${user?.uid || 'guest'}`;
      
      let seed = 0;
      for (let i = 0; i < seedString.length; i++) {
          seed = (seed * 31 + seedString.charCodeAt(i)) % 1000000007;
      }

      const seededRandom = () => {
          const x = Math.sin(seed++) * 10000;
          return x - Math.floor(x);
      };

      const shuffled = [...data].sort(() => 0.5 - seededRandom());
      return shuffled.slice(0, 5);
  }, [data]); 

  if (dailyHeroAnime.length === 0) return null;

  return (
    // ✅ CHANGED: Height increased from 450 to 600
    <View style={{ height: 600, marginTop: insets.top }}>
      <Carousel
        loop
        width={width}
        height={600} // ✅ CHANGED: Height increased to 600
        autoPlay={true}
        data={dailyHeroAnime}
        scrollAnimationDuration={1000}
        renderItem={({ item }) => {
           const imageUrl = item.image || 
                            item.images?.jpg?.large_image_url || 
                            item.images?.jpg?.image_url ||
                            'https://via.placeholder.com/350x500'; 

           return (
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => router.push(`/anime/${item.mal_id}`)}
              style={{ flex: 1 }}
            >
                <Image 
                    source={{ uri: imageUrl }} 
                    style={styles.image} 
                    contentFit="contain" // ✅ CHANGED: "cover" to "contain" so the full image is visible
                    transition={500}
                />
                
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)', '#121212']}
                    style={styles.gradient}
                >
                    <View style={styles.content}>
                        <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
                        
                        <View style={styles.tags}>
                            <View style={styles.tag}>
                                <Text style={styles.tagText}>{item.year || 'N/A'}</Text>
                            </View>

                            <View style={styles.tag}>
                                <Text style={styles.tagText}>{item.type || 'TV'}</Text>
                            </View>
                            
                            {/* ✅ STATUS TAG (Hidden if Upcoming) */}
                            {item.status && item.status !== 'Upcoming' && (
                                <View style={[styles.tag, { backgroundColor: item.status === 'Completed' ? '#10b981' : '#3b82f6' }]}>
                                    <Text style={styles.tagText}>{item.status}</Text>
                                </View>
                            )}
                            
                            <View style={[styles.tag, { backgroundColor: '#FF6B6B' }]}>
                                <Ionicons name="star" size={10} color="white" />
                                <Text style={styles.tagText}> {item.score ? `${Number(item.score).toFixed(1)}/5` : 'N/A'}</Text>
                            </View>
                        </View>
                        
                        <Text numberOfLines={2} style={styles.synopsis}>
                            {item.synopsis || "No synopsis available."}
                        </Text>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        )}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', bottom: 0, width: '100%', height: 250, justifyContent: 'flex-end', paddingBottom: 20 },
  content: { paddingHorizontal: 20 },
  title: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 10, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 10 },
  tags: { flexDirection: 'row', marginBottom: 10, flexWrap: 'wrap' },
  tag: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  tagText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  synopsis: { color: '#ccc', fontSize: 14, lineHeight: 20 },
});