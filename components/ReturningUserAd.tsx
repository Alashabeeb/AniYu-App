import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useInterstitialAd } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

export default function ReturningUserAd({ onAppReady }: { onAppReady?: () => void }) {
  const [isReturningUser, setIsReturningUser] = useState(false);
  const hasShownColdStartAd = useRef(false);
  const isFirstLaunchSession = useRef(false);
  const readySignaled = useRef(false); // Ensures we only signal the Splash Screen to hide once!

  // Initialize the Ad hook
  const { isLoaded, isClosed, error, load, show } = useInterstitialAd(AdUnitIds.interstitial, {
    requestNonPersonalizedAdsOnly: true, // Safer for privacy compliance
  });

  // Helper to safely trigger the Splash Screen to hide
  const signalReady = () => {
    if (!readySignaled.current) {
      readySignaled.current = true;
      if (onAppReady) onAppReady();
    }
  };

  // ✅ THE FAILSAFE: If the internet is slow and the ad takes more than 3.5 seconds, let the user in!
  useEffect(() => {
    const timeout = setTimeout(() => {
      signalReady();
    }, 3500); 
    return () => clearTimeout(timeout);
  }, []);

  // 1. Check if the user has opened the app before
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const hasLaunched = await AsyncStorage.getItem('has_launched_before');
        
        if (hasLaunched === 'true') {
          // Returning user! Flag them and start loading the ad in the background
          setIsReturningUser(true);
          load(); 
        } else {
          // First time user! Mark them as a returning user for NEXT time, but don't load the ad today.
          isFirstLaunchSession.current = true;
          await AsyncStorage.setItem('has_launched_before', 'true');
          signalReady(); // ✅ First-time user: Drop Splash Screen immediately, no ads.
        }
      } catch (error) {
        console.error('AsyncStorage Error:', error);
        signalReady(); // Error reading storage, drop splash screen safely.
      }
    };
    checkUserStatus();
  }, [load]);

  // 2. Cold Start: Show the ad exactly once when it finishes loading initially
  useEffect(() => {
    if (isReturningUser && isLoaded && !hasShownColdStartAd.current && !isFirstLaunchSession.current) {
      show();
      hasShownColdStartAd.current = true; // Lock it so it never shows twice via this trigger
      signalReady(); // ✅ Ad is popping up! Drop the Splash Screen underneath it.
    }
  }, [isReturningUser, isLoaded, show]);

  // Handle Ad Load Error (e.g., No Ad Inventory or Bad Connection)
  useEffect(() => {
    if (error) {
       signalReady(); // ✅ Ad failed to load. Drop the Splash Screen so they aren't stuck.
    }
  }, [error]);

  // 3. Background Pre-loading: Load a fresh ad whenever the user closes the current one
  useEffect(() => {
    if (isClosed) {
      load(); // Silently get the next ad ready for when they leave and come back!
    }
  }, [isClosed, load]);

  // 4. Warm Start: Show the pre-loaded ad when they exit the app and come back!
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isReturningUser && isLoaded && !isFirstLaunchSession.current) {
         // App came back to foreground. Show the pre-loaded ad instantly!
         show();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isReturningUser, isLoaded, show]);

  return null;
}