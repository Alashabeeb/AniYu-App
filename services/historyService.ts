import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'; // ✅ Added Firestore imports
import { auth, db } from '../config/firebaseConfig'; // ✅ Added db import

const HISTORY_BASE_KEY = 'watch_history';
const MANGA_HISTORY_BASE_KEY = 'manga_history';
const READ_CHAPTERS_BASE_KEY = 'read_chapters_list';

// ✅ INCREASED TO 20 so we can filter into two separate 5-item lists on the Home Screen
const MAX_HISTORY_LENGTH = 20;

const getUserKey = (baseKey: string) => {
  const userId = auth.currentUser?.uid || 'guest';
  return `user_${userId}_${baseKey}`;
};

export interface HistoryItem {
  mal_id: number;
  title: string;
  image: string;
  episode: string;      
  episodeId: string;    
  date: number;
  genres?: string[];
  progress: number;     
  totalDuration: number;
}

export interface MangaHistoryItem {
  mal_id: string;
  title: string;
  image: string;
  chapterTitle: string;
  chapterId: string;
  chapterNum: number;
  page: number; 
  date: number;
}

let historySavePromise = Promise.resolve();
let mangaSavePromise = Promise.resolve();

// --- ANIME HISTORY ---
export const getContinueWatching = async (): Promise<HistoryItem[]> => {
  try {
    const key = getUserKey(HISTORY_BASE_KEY);
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    return [];
  }
};

export const saveWatchProgress = (
    anime: any, 
    episode: any, 
    progress: number, 
    totalDuration: number
) => {
  historySavePromise = historySavePromise.then(async () => {
      try {
        const current = await getContinueWatching();
        const validHistory = Array.isArray(current) ? current : [];
        const filtered = validHistory.filter((item) => String(item.mal_id) !== String(anime.mal_id));

        const imageUrl = anime.images?.jpg?.large_image_url || 
                        anime.images?.jpg?.image_url || 
                        'https://via.placeholder.com/150';

        const newItem: HistoryItem = {
          mal_id: anime.mal_id,
          title: anime.title,
          image: imageUrl,
          episode: episode.title || `Episode ${episode.number}`,
          episodeId: String(episode.id || episode.mal_id),
          date: Date.now(),
          genres: anime.genres || [],
          progress,
          totalDuration
        };

        // 1. Save to Local Storage (Fast Loading)
        const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY_LENGTH);
        const key = getUserKey(HISTORY_BASE_KEY);
        await AsyncStorage.setItem(key, JSON.stringify(newHistory));

        // 2. ✅ SURGICAL ADDITION: Save to Firestore (For Admin Panel Tracker)
        // Uses "Overwrite, Don't Stack" strategy by making the document ID the anime.mal_id
        if (auth.currentUser?.uid && String(anime.mal_id) !== 'preview') {
            const historyRef = doc(db, 'users', auth.currentUser.uid, 'history', String(anime.mal_id));
            await setDoc(historyRef, {
                type: 'anime',
                mal_id: String(anime.mal_id),
                title: anime.title,
                lastEpisode: episode.number || episode.title,
                episodeId: String(episode.id || episode.mal_id),
                updatedAt: serverTimestamp()
            }, { merge: true }); // Merge ensures we just update the existing doc
        }

      } catch (error) {
        console.error("Error saving progress:", error);
      }
  });
  return historySavePromise;
};

// --- MANGA CONTINUE READING ---
export const getMangaHistory = async (): Promise<MangaHistoryItem[]> => {
  try {
    const key = getUserKey(MANGA_HISTORY_BASE_KEY);
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    return [];
  }
};

export const saveReadProgress = (manga: any, chapter: any, page: number) => {
  mangaSavePromise = mangaSavePromise.then(async () => {
      try {
        const current = await getMangaHistory();
        const validHistory = Array.isArray(current) ? current : [];
        const filtered = validHistory.filter((item) => String(item.mal_id) !== String(manga.mal_id));

        const imageUrl = manga.images?.jpg?.large_image_url || 
                        manga.images?.jpg?.image_url || 
                        'https://via.placeholder.com/150';

        const newItem: MangaHistoryItem = {
          mal_id: String(manga.mal_id),
          title: manga.title,
          image: imageUrl,
          chapterTitle: chapter.title || `Chapter ${chapter.number}`,
          chapterId: String(chapter.id || chapter.number),
          chapterNum: chapter.number,
          page,
          date: Date.now(),
        };

        // 1. Save to Local Storage
        const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY_LENGTH); 
        const key = getUserKey(MANGA_HISTORY_BASE_KEY);
        await AsyncStorage.setItem(key, JSON.stringify(newHistory));

        await markChapterAsRead(manga.mal_id, String(chapter.id || chapter.number));

        // 2. ✅ SURGICAL ADDITION: Save to Firestore (For Admin Panel Tracker)
        // Uses "Overwrite, Don't Stack" strategy by making the document ID the manga.mal_id
        if (auth.currentUser?.uid) {
            const historyRef = doc(db, 'users', auth.currentUser.uid, 'history', String(manga.mal_id));
            await setDoc(historyRef, {
                type: 'manga',
                mal_id: String(manga.mal_id),
                title: manga.title,
                lastChapter: chapter.number || chapter.title,
                chapterId: String(chapter.id || chapter.number),
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

      } catch (error) {
        console.error("Error saving manga progress:", error);
      }
  });
  return mangaSavePromise;
};

export const getReadChapterIds = async (): Promise<string[]> => {
    try {
        const key = getUserKey(READ_CHAPTERS_BASE_KEY); 
        const json = await AsyncStorage.getItem(key);
        return json ? JSON.parse(json) : [];
    } catch { return []; }
};

export const markChapterAsRead = async (mangaId: string | number, chapterId: string) => {
    try {
        const current = await getReadChapterIds();
        const keyVal = `${mangaId}_${chapterId}`;
        if (!current.includes(keyVal)) {
            const updated = [...current, keyVal];
            const storageKey = getUserKey(READ_CHAPTERS_BASE_KEY);
            await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
        }
    } catch (e) { console.error(e); }
};

export const clearHistory = async () => {
  try {
    await AsyncStorage.removeItem(getUserKey(HISTORY_BASE_KEY));
    await AsyncStorage.removeItem(getUserKey(MANGA_HISTORY_BASE_KEY));
    await AsyncStorage.removeItem(getUserKey(READ_CHAPTERS_BASE_KEY));
  } catch (e) {
    console.error("Error clearing history:", e);
  }
};