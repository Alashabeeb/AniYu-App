import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import GlobalGatekeeper from '../components/GlobalGatekeeper';
import NotificationListener from '../components/NotificationListener';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { useUserHeartbeat } from '../hooks/useUserHeartbeat';

// ✅ EXPO FOREGROUND NOTIFICATION HANDLER
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false, // 🛑 FALSE: Prevents the drop-down OS banner while app is open
    shouldShowList: false,   // 🛑 FALSE: Prevents it from cluttering the notification center while active
    shouldPlaySound: false,  // 🛑 FALSE: No loud ding while they are already in the app
    shouldSetBadge: true,    // ✅ TRUE: Still updates the red unread badge count on the app icon
  }),
});
// ✅ CREATE ANDROID CHANNELS FOR GROUPING
// Run this once when the app starts to enable the "Drop Down" stack effect on Android
async function setupNotificationChannels() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('social-updates', {
      name: 'Social Interactions',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6', // Matches your theme
    });
    
    await Notifications.setNotificationChannelAsync('admin-broadcasts', {
      name: 'Announcements',
      importance: Notifications.AndroidImportance.HIGH, // High priority for admin messages
      vibrationPattern: [0, 500],
      lightColor: '#ef4444',
    });
  }
}
setupNotificationChannels();

// ✅ 1. Freeze the splash screen while Firebase checks the user's token
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments(); // Tracks the current folder path (e.g., '(auth)' or '(tabs)')

  useUserHeartbeat();

  useEffect(() => {
    // If Firebase is still checking local storage, do absolutely nothing.
    if (loading) return;
    
    // Check if the user is currently sitting inside the (auth) folder
    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // User is logged out, but trying to view the app. Send them to login.
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // User is logged in, but stuck on the login screen. Send them to tabs.
      router.replace('/(tabs)');
    }

    // ✅ 2. Once the routing decision is made, gracefully hide the Splash Screen
    SplashScreen.hideAsync();

  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
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
          
          {/* Social / Feed Screens */}
          <Stack.Screen name="post-details" options={{ headerShown: false }} />
          <Stack.Screen name="feed-profile" options={{ headerShown: false }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal', title: 'Create Post' }} />
          <Stack.Screen name="search-users" options={{ headerShown: false }} />
          
          {/* Support / Notifications */}
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="live-chat" options={{ headerShown: false }} />
          <Stack.Screen name="help-support" options={{ headerShown: false }} />
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