import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// ⚠️ REPLACE THESE WITH YOUR REAL AD UNIT IDS FROM ADMOB LATER
const REAL_BANNER_ANDROID = 'ca-app-pub-9826157970378029/5111670223';
const REAL_BANNER_IOS = 'ca-app-pub-9826157970378029/9119562954';

const REAL_INTERSTITIAL_ANDROID = 'ca-app-pub-9826157970378029/2745726295';
const REAL_INTERSTITIAL_IOS = 'ca-app-pub-9826157970378029/4386111023';

const REAL_REWARDED_ANDROID = 'ca-app-pub-9826157970378029/3208760725';
const REAL_REWARDED_IOS = 'ca-app-pub-9826157970378029/2726512591';

export const AdUnitIds = {
  banner: __DEV__ 
    ? TestIds.BANNER 
    : Platform.OS === 'ios' ? REAL_BANNER_IOS : REAL_BANNER_ANDROID,
    
  interstitial: __DEV__ 
    ? TestIds.INTERSTITIAL 
    : Platform.OS === 'ios' ? REAL_INTERSTITIAL_IOS : REAL_INTERSTITIAL_ANDROID,

  // ✅ ADDED: Smart Toggle for Rewarded Ads
  rewarded: __DEV__ 
    ? TestIds.REWARDED 
    : Platform.OS === 'ios' ? REAL_REWARDED_IOS : REAL_REWARDED_ANDROID,
};