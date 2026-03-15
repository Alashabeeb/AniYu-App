import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AdUnitIds } from '../constants/AdIds';

export default function AdBanner() {
  const [isAdLoaded, setIsAdLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // If the ad fails to load (e.g. no internet), hide the space completely so the UI looks clean
  if (hasError) return null; 

  return (
    <View style={[styles.container, !isAdLoaded && styles.hidden]}>
      <BannerAd
        unitId={AdUnitIds.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true, // Safer for privacy compliance
        }}
        onAdLoaded={() => setIsAdLoaded(true)}
        onAdFailedToLoad={(error) => {
          console.error('Ad failed to load: ', error);
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
    paddingVertical: 10,
  },
  hidden: {
    display: 'none',
  }
});