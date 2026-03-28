import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import GlobalGatekeeper from '../components/GlobalGatekeeper';
import NotificationListener from '../components/NotificationListener';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { useUserHeartbeat } from '../hooks/useUserHeartbeat';

// ✅ IMPORT ADMOB
import mobileAds from 'react-native-google-mobile-ads';
import ReturningUserAd from '../components/ReturningUserAd';

// ✅ SENTRY CONFIGURATION (Must be initialized outside of the component tree to catch startup crashes)
import * as Sentry from '@sentry/react-native';

Sentry.init({
  // ✅ SURGICAL FIX: Your live production DSN is now active
  dsn: 'https://5a364c138d092be43d0a8920e2547102@o4511123795869696.ingest.us.sentry.io/4511123856031744', 
  // Captures 20% of sessions for performance monitoring
  tracesSampleRate: 0.2, 
  // Tags every error with the app version automatically
  release: 'com.aniyu.app@1.0.6', 
});

// ✅ EXPO FOREGROUND NOTIFICATION HANDLER
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false, 
    shouldShowList: false,   
    shouldPlaySound: false,  
    shouldSetBadge: true,    
  }),
});

async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('social-updates', {
      name: 'Social Interactions',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6', 
    });
    
    await Notifications.setNotificationChannelAsync('admin-broadcasts', {
      name: 'Announcements',
      importance: Notifications.AndroidImportance.HIGH, 
      vibrationPattern: [0, 500],
      lightColor: '#ef4444',
    });
  }
}
setupNotificationChannels();

// ✅ 1. Freeze the splash screen while Firebase and AdMob boot up
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments(); 

  useUserHeartbeat();

  // Initialize AdMob exactly ONCE on app boot
  useEffect(() => {
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        console.log('AdMob SDK Initialized');
      });
  }, []);

  useEffect(() => {
    // If Firebase is still checking local storage, do absolutely nothing.
    if (loading) return;
    
    // Check if the user is currently sitting inside the (auth) folder
    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }

    // ✅ SURGICAL FIX: We REMOVED the Splash Screen hide command from here!
    // It is now strictly controlled by the ReturningUserAd component below.

  }, [user, loading, segments]);

  // ✅ SURGICAL FIX: The callback function to finally drop the Splash Screen
  const handleAppReady = useCallback(() => {
    SplashScreen.hideAsync();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        {/* Because the Splash Screen is still frozen, users won't even see this spinner! */}
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <NotificationListener /> 
        <GlobalGatekeeper />
        {/* ✅ Pass the callback so the Ad knows it controls the Splash Screen */}
        <ReturningUserAd onAppReady={handleAppReady} /> 
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="anime/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="manga/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="chapter-read" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
          
          <Stack.Screen name="post-details" options={{ headerShown: false }} />
          <Stack.Screen name="feed-profile" options={{ headerShown: false }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal', title: 'Create Post' }} />
          <Stack.Screen name="search-users" options={{ headerShown: false }} />
          
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="live-chat" options={{ headerShown: false }} />
          <Stack.Screen name="help-support" options={{ headerShown: false }} />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}

// ✅ SENTRY FIX: Wrap the entire RootLayout in Sentry to catch all React rendering errors!
function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

export default Sentry.wrap(RootLayout);