import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface CustomAlertProps {
  visible: boolean;
  type?: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
}

const THEMES = {
  success: {
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.15)',
    badge: '#d1fae5',
    badgeText: '#065f46',
    emoji: '✅',
    tag: 'MISSION COMPLETE',
  },
  error: {
    accent: '#E84C2A',
    glow: 'rgba(232, 76, 42, 0.15)',
    badge: '#fee2e2',
    badgeText: '#7f1d1d',
    emoji: '💥',
    tag: 'CRITICAL ERROR',
  },
  warning: {
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.15)',
    badge: '#fef3c7',
    badgeText: '#78350f',
    emoji: '⚠️',
    tag: 'WARNING',
  },
  info: {
    accent: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.15)',
    badge: '#dbeafe',
    badgeText: '#1e3a8a',
    emoji: '📢',
    tag: 'NOTICE',
  },
};

export default function CustomAlert({
  visible,
  type = 'info',
  title,
  message,
  onClose,
  secondaryButtonText,
  onSecondaryPress,
}: CustomAlertProps) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const theme = THEMES[type];

  useEffect(() => {
    if (visible) {
      // Reset
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      overlayOpacity.setValue(0);

      // Animate in
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 120,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Error shake after entry
        if (type === 'error') {
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
          ]).start();
        }
      });
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { scale: scaleAnim },
                { translateX: shakeAnim },
              ],
              opacity: opacityAnim,
              shadowColor: theme.accent,
            },
          ]}
        >
          {/* Top accent bar */}
          <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />

          {/* Tag badge */}
          <View style={[styles.tagBadge, { backgroundColor: theme.badge }]}>
            <Text style={[styles.tagText, { color: theme.badgeText }]}>{theme.tag}</Text>
          </View>

          {/* Emoji */}
          <View style={[styles.emojiWrapper, { backgroundColor: theme.glow }]}>
            <Text style={styles.emoji}>{theme.emoji}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Got it!</Text>
          </TouchableOpacity>

          {secondaryButtonText && onSecondaryPress && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                handleClose();
                onSecondaryPress();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>{secondaryButtonText}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#161B22',
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    paddingBottom: 24,
  },
  accentBar: {
    width: '100%',
    height: 4,
    marginBottom: 20,
  },
  tagBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    marginBottom: 16,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  emojiWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emoji: {
    fontSize: 34,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E6EDF3',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 24,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 14,
    color: '#8B949E',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  divider: {
    width: '85%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },
  primaryBtn: {
    width: '85%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  primaryBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 8,
    width: '85%',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#8B949E',
    fontSize: 14,
    fontWeight: '600',
  },
});