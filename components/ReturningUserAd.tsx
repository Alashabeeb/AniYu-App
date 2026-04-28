import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useInterstitialAd } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

export default function ReturningUserAd({ onAppReady }: { onAppReady?: () => void }) {
  const [isReturningUser, setIsReturningUser] = useState(false);
  const hasShownColdStartAd = useRef(false);
  const isFirstLaunchSession = useRef(false);
  const readySignaled = useRef(false); 
  
  // ✅ ADDED: The Lock. This tracks if an ad is currently on the screen.
  const isShowingAd = useRef(false); 

  // Initialize the Ad hook
  const { isLoaded, isClosed, error, load, show } = useInterstitialAd(AdUnitIds.interstitial, {
    requestNonPersonalizedAdsOnly: true, 
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
          setIsReturningUser(true);
          load(); 
        } else {
          isFirstLaunchSession.current = true;
          await AsyncStorage.setItem('has_launched_before', 'true');
          signalReady(); 
        }
      } catch (error) {
        console.error('AsyncStorage Error:', error);
        signalReady(); 
      }
    };
    checkUserStatus();
  }, []); // ✅ FIX: Removed [load] to stop the infinite loop on returning users

  // 2. Cold Start: Show the ad exactly once when it finishes loading initially
  useEffect(() => {
    if (isReturningUser && isLoaded && !hasShownColdStartAd.current && !isFirstLaunchSession.current) {
      isShowingAd.current = true; // ✅ Lock the ad so AppState ignores the background transition
      show();
      hasShownColdStartAd.current = true; 
      signalReady(); 
    }
  }, [isReturningUser, isLoaded]); // ✅ FIX: Removed [show]

  // Handle Ad Load Error (e.g., No Ad Inventory or Bad Connection)
  useEffect(() => {
    if (error) {
       signalReady(); 
    }
  }, [error]);

  // 3. Background Pre-loading: Load a fresh ad whenever the user closes the current one
  useEffect(() => {
    if (isClosed) {
      isShowingAd.current = false; // ✅ Unlock the ad now that the user has fully closed it
      load(); 
    }
  }, [isClosed]); // ✅ FIX: Removed [load]

  // 4. Warm Start: Show the pre-loaded ad when they exit the app and come back!
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // ✅ ADDED check for !isShowingAd.current. If an ad is currently playing, do nothing!
      if (nextAppState === 'active' && isReturningUser && isLoaded && !isFirstLaunchSession.current && !isShowingAd.current) {
         isShowingAd.current = true; // ✅ Lock it
         show();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isReturningUser, isLoaded]); // ✅ FIX: Removed [show]

  return null;
}