import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import mobileAds, { AdEventType, AppOpenAd } from 'react-native-google-mobile-ads';
import GlobalGatekeeper from '../components/GlobalGatekeeper';
import { AdConfig } from '../config/adConfig';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { useUserHeartbeat } from '../hooks/useUserHeartbeat';
// ✅ IMPORT THE LISTENER
import NotificationListener from '../components/NotificationListener';

const appOpenAd = AppOpenAd.createForAdRequest(AdConfig.appOpen, {
  requestNonPersonalizedAdsOnly: true,
});

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdClosed, setIsAdClosed] = useState(false);

  useUserHeartbeat();

  useEffect(() => {
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        appOpenAd.load();
      });

    const unsubscribeLoaded = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      appOpenAd.show();
    });

    const unsubscribeClosed = appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      setIsAdClosed(true);
    });

    const unsubscribeError = appOpenAd.addAdEventListener(AdEventType.ERROR, (error) => {
      setIsAdClosed(true); 
    });

    return () => {
      unsubscribeLoaded();
      unsubscribeClosed();
      unsubscribeError();
    };
  }, []);
  
  useEffect(() => {
    if (loading || !isAdClosed) return;
    if (!user) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(tabs)');
    }
  }, [user, loading, isAdClosed]);

  if (loading || !isAdClosed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      {/* 1. Wrap with ToastProvider */}
      <ToastProvider>
        
        {/* 2. Activate the Listener */}
        <NotificationListener /> 
        
        <GlobalGatekeeper />
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="anime/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="chapter-read" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}