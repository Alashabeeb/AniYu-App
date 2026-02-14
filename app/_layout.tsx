import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import GlobalGatekeeper from '../components/GlobalGatekeeper';
import NotificationListener from '../components/NotificationListener';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { useUserHeartbeat } from '../hooks/useUserHeartbeat';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useUserHeartbeat();

  useEffect(() => {
    if (loading) return;
    
    // Simple redirect logic without waiting for ads
    if (!user) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(tabs)');
    }
  }, [user, loading]);

  if (loading) {
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