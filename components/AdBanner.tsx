import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

export default function AdBanner() {
  const [hasError, setHasError] = useState(false);

  // If the ad completely fails (e.g., no internet), hide the space
  if (hasError) return null; 

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={AdUnitIds.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true, // Safer for privacy compliance
        }}
        onAdFailedToLoad={(error) => {
          console.error('Banner Ad failed to load: ', error.message);
          setHasError(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    // ✅ SURGICAL FIX: Give it a minimum height so Google can calculate the adaptive size!
    minHeight: 50, 
    paddingVertical: 10,
  }
});