import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useInterstitialAd } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

export default function ReturningUserAd() {
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [hasShownAd, setHasShownAd] = useState(false);
  
  // Initialize the Ad hook
  const { isLoaded, load, show } = useInterstitialAd(AdUnitIds.interstitial, {
    requestNonPersonalizedAdsOnly: true, // Safer for privacy compliance
  });

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
          await AsyncStorage.setItem('has_launched_before', 'true');
        }
      } catch (error) {
        console.error('AsyncStorage Error:', error);
      }
    };
    checkUserStatus();
  }, [load]);

  // 2. Show the ad exactly once when it finishes loading
  useEffect(() => {
    if (isReturningUser && isLoaded && !hasShownAd) {
      show();
      setHasShownAd(true); // Lock it so it never shows twice in the same session
    }
  }, [isReturningUser, isLoaded, hasShownAd, show]);

  // This is a "headless" component. It renders nothing to the screen.
  return null;
}