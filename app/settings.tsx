import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { deleteUser } from 'firebase/auth';
// ✅ SURGICAL FIX: Added Firestore imports for deep deletion
import { deleteDoc, doc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
// ✅ SURGICAL FIX: Imported db
import { auth, db } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';
import { clearHistory } from '../services/historyService';
import { getNotificationPreference, setNotificationPreference } from '../services/notificationService';
import { getContentRating, setContentRating } from '../services/settingsService';
import { getFriendlyErrorMessage } from '../utils/errorHandler'; // ✅ Imported Friendly Error Handler

// ✅ TRANSLATIONS
const TRANSLATIONS: any = {
    'English': {
        membership: "MEMBERSHIP", subscription: "Subscription", email: "Email", 
        appExp: "APP EXPERIENCE", streamCell: "Stream on Cellular", darkMode: "Dark Mode", quality: "Video Quality",
        langHeader: "LANGUAGE", appLang: "App Language", audioLang: "Audio Language", subtitles: "Subtitles",
        data: "DATA & STORAGE", notifs: "Pop-up Notifications", downloads: "Manage Downloads", clearHist: "Clear Watch History",
        privacy: "PRIVACY & SAFETY", restriction: "Content Restriction", blocked: "Blocked Users", delete: "Delete My Account",
        manage: "Manage", free: "Free Plan", premium: "Premium", premiumPlus: "Premium+",
        comingSoon: "(Coming Soon)", settings: "Settings"
    },
};

// ✅ OPTIONS CONFIGURATION
const SUBSCRIPTION_OPTS = [
    { id: 'Free Plan', name: 'Free Plan', price: '$0.00', features: 'Ads • 480p', active: true },
    { id: 'Premium', name: 'Premium', price: '$4.99/mo', features: 'No Ads • 1080p', active: false },
    { id: 'Premium+', name: 'Premium+', price: '$9.99/mo', features: '4K • Offline', active: false },
];

const RATING_OPTS = [
    { id: 'All Ages', name: 'All Ages', active: true },
    { id: '13+', name: '13+', active: false },
    { id: '16+', name: '16+', active: false },
    { id: '18+', name: '18+', active: false },
];

const QUALITY_OPTS = [
    { id: '480p', name: '480p', active: true },
    { id: '360p', name: '360p', active: false },
    { id: '720p', name: '720p', active: false },
    { id: '1080p', name: '1080p', active: false },
    { id: 'Auto', name: 'Auto', active: false },
];

const LANGUAGE_OPTS = [
    { id: 'English', name: 'English', active: true },
    { id: 'Spanish', name: 'Spanish', active: false },
    { id: 'French', name: 'French', active: false },
    { id: 'German', name: 'German', active: false },
    { id: 'Japanese', name: 'Japanese', active: false },
];

const AUDIO_OPTS = [
    { id: 'Japanese (Original)', name: 'Japanese (Original)', active: true },
    { id: 'English (Dub)', name: 'English (Dub)', active: false },
    { id: 'Spanish (Dub)', name: 'Spanish (Dub)', active: false },
];

const SUBTITLE_OPTS = [
    { id: 'English', name: 'English', active: true },
    { id: 'Spanish', name: 'Spanish', active: false },
    { id: 'None', name: 'None', active: false },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, toggleTheme, isDark } = useTheme();
  const user = auth.currentUser;
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [cellularEnabled, setCellularEnabled] = useState(true);
  
  const [subscription, setSubscription] = useState('Free Plan');
  const [videoQuality, setVideoQuality] = useState('480p');
  const [appLanguage, setAppLanguage] = useState('English');
  const [audioLanguage, setAudioLanguage] = useState('Japanese (Original)');
  const [subtitleLanguage, setSubtitleLanguage] = useState('English');
  const [contentRating, setContentRatingState] = useState('All Ages');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState(''); 
  const [loading, setLoading] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
      const enabled = await getNotificationPreference();
      setNotificationsEnabled(enabled);
      
      const savedRating = await getContentRating();
      const isValid = RATING_OPTS.find(r => r.id === savedRating && r.active);
      setContentRatingState(isValid ? savedRating : 'All Ages');
  };

  const toggleNotifications = async (value: boolean) => {
      setNotificationsEnabled(value);
      await setNotificationPreference(value);
  };

  const t = (key: string) => {
      const dict = TRANSLATIONS[appLanguage] || TRANSLATIONS['English'];
      return dict[key] || TRANSLATIONS['English'][key] || key;
  };

  const handleDeleteAccount = () => {
      // Keep native Alert for critical confirmations (Safety First)
      Alert.alert(t('delete'), "This is an irreversible action. Are you sure you want to permanently delete your account?", [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Delete", 
              style: "destructive", 
              onPress: async () => {
                  try {
                      setLoading(true);
                      
                      // ✅ SURGICAL FIX: Wipe data from Firestore BEFORE deleting Auth
                      if (user?.uid) {
                          await deleteDoc(doc(db, 'users', user.uid));
                      }
                      
                      await deleteUser(user!);
                      router.replace('/login');
                  } catch (e: any) { 
                      // ✅ UPDATED: Use Friendly Error
                      const friendlyMessage = getFriendlyErrorMessage(e);
                      showAlert('error', 'Delete Failed', friendlyMessage);
                  } 
                  finally { setLoading(false); }
              }
          }
      ]);
  };

  const handleClearHistory = async () => {
      try {
        await clearHistory(); 
        showAlert('success', 'History Cleared', 'Your watch history has been successfully removed.');
      } catch (e: any) {
         const friendlyMessage = getFriendlyErrorMessage(e);
         showAlert('error', 'Error', friendlyMessage);
      }
  };

  const openModal = (type: string) => {
      setModalType(type);
      setModalVisible(true);
  };

  const closeModal = () => {
      setModalVisible(false);
      setModalType('');
  };

  const handleSelection = async (value: string) => {
      if (modalType === 'quality') setVideoQuality(value);
      if (modalType === 'language') setAppLanguage(value);
      if (modalType === 'audio') setAudioLanguage(value);
      if (modalType === 'subtitle') setSubtitleLanguage(value);
      
      if (modalType === 'rating') {
          setContentRatingState(value);
          await setContentRating(value);
      }
      closeModal();
  };

  const renderSectionHeader = (title: string) => (
      <Text style={[styles.sectionTitle, { color: theme.tint }]}>{title}</Text>
  );

  const renderRow = (icon: any, label: string, value?: string | React.ReactNode, onPress?: () => void, isDestructive = false) => (
      <TouchableOpacity 
          style={[styles.row, { borderBottomColor: theme.border, borderBottomWidth: 1 }]} 
          onPress={onPress}
          disabled={!onPress}
      >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name={icon} size={22} color={isDestructive ? "#FF6B6B" : theme.text} style={{ marginRight: 15 }} />
              <Text style={[styles.rowLabel, { color: isDestructive ? "#FF6B6B" : theme.text }]}>{label}</Text>
          </View>
          {typeof value === 'string' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.subText, marginRight: 5, maxWidth: 150 }} numberOfLines={1}>{value}</Text>
                  {onPress && <Ionicons name="chevron-forward" size={18} color={theme.subText} />}
              </View>
          ) : (
              value
          )}
      </TouchableOpacity>
  );

  const renderOptions = (options: any[], currentVal: string, type: string) => (
      options.map(opt => (
          <TouchableOpacity 
              key={opt.id} 
              style={[styles.modalOption, { opacity: opt.active ? 1 : 0.5 }]} 
              onPress={() => { if (opt.active) handleSelection(opt.id); }}
              disabled={!opt.active}
          >
              <View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>
                      {opt.name} {!opt.active && <Text style={{color: theme.tint, fontSize: 12}}>(Coming Soon)</Text>}
                  </Text>
                  {opt.price && <Text style={{ color: theme.subText, fontSize: 12 }}>{opt.price} • {opt.features}</Text>}
              </View>
              {currentVal === opt.id && <Ionicons name="checkmark" size={20} color={theme.tint} />}
          </TouchableOpacity>
      ))
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('settings')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
        
        {/* 1. MEMBERSHIP */}
        {renderSectionHeader(t('membership'))}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
            {renderRow("card-outline", t('subscription'), subscription, () => openModal('subscription'))}
            {renderRow("mail-outline", t('email'), user?.email || "No Email", undefined)}
            {renderRow("shield-checkmark-outline", t('restriction'), contentRating, () => openModal('rating'))}
        </View>

        {/* 2. APP EXPERIENCE */}
        {renderSectionHeader(t('appExp'))}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
            <View style={[styles.row, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="cellular-outline" size={22} color={theme.text} style={{ marginRight: 15 }} />
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{t('streamCell')}</Text>
                </View>
                <Switch value={cellularEnabled} onValueChange={setCellularEnabled} trackColor={{ false: '#767577', true: theme.tint }} thumbColor={'white'} />
            </View>
            <View style={[styles.row, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="moon-outline" size={22} color={theme.text} style={{ marginRight: 15 }} />
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{t('darkMode')}</Text>
                </View>
                <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: '#767577', true: theme.tint }} thumbColor={'white'} />
            </View>
            {renderRow("videocam-outline", t('quality'), videoQuality, () => openModal('quality'))}
        </View>

        {/* 3. LANGUAGE */}
        {renderSectionHeader(t('langHeader'))}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
            {renderRow("language-outline", t('appLang'), appLanguage, () => openModal('language'))}
            {renderRow("mic-outline", t('audioLang'), audioLanguage, () => openModal('audio'))}
            {renderRow("chatbox-ellipses-outline", t('subtitles'), subtitleLanguage, () => openModal('subtitle'))}
        </View>

        {/* 4. DATA & STORAGE */}
        {renderSectionHeader(t('data'))}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
            {renderRow("notifications-outline", t('notifs'), <Switch value={notificationsEnabled} onValueChange={toggleNotifications} trackColor={{ false: '#767577', true: theme.tint }} thumbColor={'white'} />)}
            {renderRow("download-outline", t('downloads'), "", () => router.push('/downloads'))}
            {/* Updated clear history action */}
            {renderRow("time-outline", t('clearHist'), "", handleClearHistory, true)}
        </View>

        {/* 5. PRIVACY & SAFETY */}
        {renderSectionHeader(t('privacy'))}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
            {renderRow("person-remove-outline", t('blocked'), t('manage'), () => router.push('/blocked-users'))}
            {renderRow("trash-outline", t('delete'), "", handleDeleteAccount, true)}
        </View>

        {/* ✅ DYNAMIC VERSION DISPLAY */}
        <View style={{ marginTop: 30, alignItems: 'center' }}>
            <Text style={{ color: theme.subText }}>AniYu v{appVersion} (Beta)</Text>
        </View>

      </ScrollView>

      {/* MODAL */}
      <Modal transparent visible={modalVisible} animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={closeModal} activeOpacity={1}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Select</Text>
                    
                    <ScrollView style={{ maxHeight: 300 }}>
                        {modalType === 'subscription' && renderOptions(SUBSCRIPTION_OPTS, subscription, 'sub')}
                        {modalType === 'rating' && renderOptions(RATING_OPTS, contentRating, 'rating')}
                        {modalType === 'quality' && renderOptions(QUALITY_OPTS, videoQuality, 'quality')}
                        {modalType === 'language' && renderOptions(LANGUAGE_OPTS, appLanguage, 'lang')}
                        {modalType === 'audio' && renderOptions(AUDIO_OPTS, audioLanguage, 'audio')}
                        {modalType === 'subtitle' && renderOptions(SUBTITLE_OPTS, subtitleLanguage, 'subt')}
                    </ScrollView>
                </View>
              </TouchableWithoutFeedback>
          </TouchableOpacity>
      </Modal>

      {loading && (
        <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color={theme.tint} />
        </View>
      )}

      {/* ✅ Render Custom Alert */}
      <CustomAlert 
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 25, marginBottom: 8, marginLeft: 5, letterSpacing: 1 },
  section: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', borderRadius: 15, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }
});