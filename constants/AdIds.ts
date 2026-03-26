import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// ✅ SURGICAL FIX: Use an explicit manual toggle instead of __DEV__
// KEEP THIS AS 'true' WHILE TESTING YOUR APK.
// Change it to 'false' ONLY when you are ready to upload the final AAB to the Play Store.
const USE_TEST_ADS = true; 

// Your Real AdMob Unit IDs
const REAL_BANNER_ANDROID = 'ca-app-pub-9826157970378029/5111670223';
const REAL_BANNER_IOS = 'ca-app-pub-9826157970378029/9119562954';

const REAL_INTERSTITIAL_ANDROID = 'ca-app-pub-9826157970378029/2745726295';
const REAL_INTERSTITIAL_IOS = 'ca-app-pub-9826157970378029/4386111023';

const REAL_REWARDED_ANDROID = 'ca-app-pub-9826157970378029/3208760725';
const REAL_REWARDED_IOS = 'ca-app-pub-9826157970378029/2726512591';

export const AdUnitIds = {
  banner: USE_TEST_ADS 
    ? TestIds.BANNER 
    : Platform.OS === 'ios' ? REAL_BANNER_IOS : REAL_BANNER_ANDROID,
    
  interstitial: USE_TEST_ADS 
    ? TestIds.INTERSTITIAL 
    : Platform.OS === 'ios' ? REAL_INTERSTITIAL_IOS : REAL_INTERSTITIAL_ANDROID,

  rewarded: USE_TEST_ADS 
    ? TestIds.REWARDED 
    : Platform.OS === 'ios' ? REAL_REWARDED_IOS : REAL_REWARDED_ANDROID,
};