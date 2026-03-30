import { getToken } from 'firebase/app-check'; // ✅ ADDED APP CHECK
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getDocsFromCache,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  updateDoc,
  where
} from 'firebase/firestore';
import { appCheck, auth, db } from '../config/firebaseConfig'; // ✅ ADDED AUTH & APPCHECK
import { getContentRating } from './settingsService';

// ✅ Helper to get allowed ratings based on user settings
const getAllowedRatings = async () => {
    const userRating = await getContentRating(); 
    
    switch(userRating) {
        case '18+': return ['All', '12+', '16+', '18+'];
        case '16+': return ['All', '12+', '16+'];
        case '12+': return ['All', '12+'];
        default: return ['All'];
    }
};

// Fetch Top 50 Anime (Trending)
export const getTopAnime = async () => {
  try {
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    
    // ✅ BUG 11 FIX: Reduced limit from 100 to 60. 
    // This provides a safe buffer for filtering while saving 40 reads per call.
    const q = query(
        animeRef, 
        orderBy('views', 'desc'), 
        limit(60) 
    ); 
    
    let results: any[] = [];
    try {
        const snapshot = await getDocs(q);
        results = snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    } catch (networkError) {
        console.warn("Network failed, switching to Offline Cache...");
        const cachedSnapshot = await getDocsFromCache(q);
        results = cachedSnapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    }
    
    return results.filter((a: any) => allowed.includes(a.ageRating || 'All')).slice(0, 50);
  } catch (error) {
    console.error("Error fetching anime:", error);
    return [];
  }
};

// Fetch Upcoming Anime
export const getUpcomingAnime = async () => {
  try {
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    
    const q = query(
        animeRef, 
        where('status', '==', 'Upcoming'),
        limit(30)
    );
    
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    
    return results.filter((a: any) => allowed.includes(a.ageRating || 'All')).slice(0, 15);
  } catch (error) {
    console.error("Error fetching upcoming:", error);
    return [];
  }
};

// Fetch details for a specific anime
export const getAnimeDetails = async (id: string) => {
  try {
    const docRef = doc(db, 'anime', id);
    const snapshot = await getDoc(docRef);
    
    if (snapshot.exists()) {
      return { mal_id: snapshot.id, ...snapshot.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching details:", error);
    return null;
  }
};

// Calculate Rank using getCountFromServer
export const getAnimeRank = async (currentViews: number) => {
  try {
    const animeRef = collection(db, 'anime');
    const q = query(animeRef, where('views', '>', currentViews));
    
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count + 1;
  } catch (error) {
    console.error("Error fetching rank:", error);
    return 'N/A';
  }
};

// Fetch Similar Anime based on Genres
export const getSimilarAnime = async (genres: string[], currentId: string) => {
  try {
    if (!genres || genres.length === 0) return [];
    
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    const searchGenres = genres.slice(0, 10); 
    
    const q = query(
        animeRef, 
        where('genres', 'array-contains-any', searchGenres),
        limit(40)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs
        .map(doc => ({ mal_id: doc.id, ...doc.data() }))
        .filter((a: any) => allowed.includes(a.ageRating || 'All') && String(a.mal_id) !== String(currentId))
        .slice(0, 20);

  } catch (error) {
    console.error("Error fetching similar anime:", error);
    return [];
  }
};

// Get Recommended Anime based on User Genres
export const getRecommendedAnime = async (userGenres: string[]) => {
  try {
    if (!userGenres || userGenres.length === 0) {
        return getTopAnime(); 
    }

    const allowed = await getAllowedRatings();
    const searchGenres = userGenres.slice(0, 5); 

    const animeRef = collection(db, 'anime');
    
    // ✅ BUG 35 FIX: Reduced limit from 100 to 60 to prevent read waste.
    const q = query(
        animeRef, 
        where('genres', 'array-contains-any', searchGenres), 
        limit(60)
    );
    
    const snapshot = await getDocs(q);
    
    let results = snapshot.docs.map(doc => ({
        mal_id: doc.id,
        ...doc.data()
    })) as any[];

    results = results.filter((a: any) => allowed.includes(a.ageRating || 'All'));
    return results.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 50);

  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return [];
  }
};

// Increment View Count
export const incrementAnimeView = async (id: string) => {
  try {
    const docRef = doc(db, 'anime', id);
    await updateDoc(docRef, {
      views: increment(1)
    });
  } catch (error) {
    console.error("Error updating view count:", error);
  }
};

// Fetch Anime Episodes with Pagination
export const getAnimeEpisodes = async (id: string, lastVisibleDoc: any = null) => {
  try {
    const episodesRef = collection(db, 'anime', id, 'episodes');
    
    let q = query(episodesRef, orderBy('number', 'asc'), limit(50));
    
    if (lastVisibleDoc) {
        q = query(episodesRef, orderBy('number', 'asc'), startAfter(lastVisibleDoc), limit(50));
    }

    const snapshot = await getDocs(q);
    
    const episodes = snapshot.docs.map(doc => ({
      mal_id: doc.id,
      title: doc.data().title,
      number: doc.data().number,
      url: doc.data().videoUrl,
      thumbnail: doc.data().thumbnailUrl,
      subtitles: doc.data().subtitles || [],
      downloads: doc.data().downloads || 0,
      size: doc.data().size || 0
    }));

    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return {
        episodes,
        lastDoc,
        hasMore: snapshot.docs.length === 50 
    };

  } catch (error) {
    console.error("Error fetching episodes:", error);
    return { episodes: [], lastDoc: null, hasMore: false };
  }
};

// Search Anime
export const searchAnime = async (queryText: string) => {
  try {
    if(!queryText) return [];
    
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    
    const searchTerm = queryText.toLowerCase().trim().split(/\s+/)[0]; 

    const q = query(
        animeRef, 
        where('keywords', 'array-contains', searchTerm),
        limit(40) 
    );
    
    const snapshot = await getDocs(q);
    
    const results = snapshot.docs.map(doc => ({
      mal_id: doc.id,
      ...doc.data()
    }));
    
    return results.filter((a: any) => allowed.includes(a.ageRating || 'All')).slice(0, 20);

  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
};

// =========================================================================
// 🔐 SECURED: Cloud Function Endpoints for Ratings & Comments
// =========================================================================

const REVIEW_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/submitMediaReview";
const COMMENT_URL = "https://us-central1-aniyu-b841b.cloudfunctions.net/submitMediaComment";

// Add Rating (Secured)
export const addAnimeReview = async (animeId: string, userId: string, userName: string, rating: number) => {
    try {
        const idToken = await auth.currentUser?.getIdToken();
        const appCheckToken = await getToken(appCheck, false);

        const response = await fetch(REVIEW_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${idToken}`,
                'X-Firebase-AppCheck': appCheckToken.token
            },
            body: JSON.stringify({ targetType: 'anime', targetId: animeId, rating, userName }) 
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to submit rating.");
        
        return { success: true };
    } catch (error: any) {
        console.error("Error adding rating:", error);
        return { success: false, error: error.message };
    }
};

// Get Reviews
export const getAnimeReviews = async (animeId: string) => {
    try {
        const q = query(collection(db, 'anime', animeId, 'reviews'), orderBy('createdAt', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching reviews:", e);
        return [];
    }
};

// Toggle Like/Dislike
export const toggleAnimeReaction = async (animeId: string, userId: string, reaction: 'like' | 'dislike') => {
    try {
        const animeRef = doc(db, 'anime', animeId);
        const userInteractRef = doc(db, 'anime', animeId, 'interactions', userId);

        await runTransaction(db, async (transaction) => {
            const animeDoc = await transaction.get(animeRef);
            const interactDoc = await transaction.get(userInteractRef);

            // ✅ BUG 31 FIX: Throw a proper Error object here as well.
            if (!animeDoc.exists()) throw new Error("Anime not found");

            const currentData = interactDoc.exists() ? interactDoc.data() : {};
            const oldReaction = currentData.reaction; 

            let likesInc = 0;
            let dislikesInc = 0;

            if (oldReaction === reaction) {
                transaction.delete(userInteractRef);
                if (reaction === 'like') likesInc = -1;
                if (reaction === 'dislike') dislikesInc = -1;
            } else {
                transaction.set(userInteractRef, { reaction, userId, updatedAt: new Date().toISOString() });
                if (reaction === 'like') {
                    likesInc = 1;
                    if (oldReaction === 'dislike') dislikesInc = -1; 
                } else {
                    dislikesInc = 1;
                    if (oldReaction === 'like') likesInc = -1; 
                }
            }

            transaction.update(animeRef, {
                likes: increment(likesInc),
                dislikes: increment(dislikesInc)
            });
        });
        return true;
    } catch (error) {
        console.error("Error toggling reaction:", error);
        return false;
    }
};

// Get User's Reaction Status
export const getUserReaction = async (animeId: string, userId: string) => {
    try {
        const docRef = doc(db, 'anime', animeId, 'interactions', userId);
        const snapshot = await getDoc(docRef);
        return snapshot.exists() ? snapshot.data().reaction : null;
    } catch (error) {
        return null;
    }
};

// Submit Comment (Secured)
export const addAnimeComment = async (animeId: string, userId: string, userName: string, text: string) => {
    try {
        const idToken = await auth.currentUser?.getIdToken();
        const appCheckToken = await getToken(appCheck, false);

        const response = await fetch(COMMENT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${idToken}`,
                'X-Firebase-AppCheck': appCheckToken.token
            },
            body: JSON.stringify({ targetType: 'anime', targetId: animeId, text, userName })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to submit comment.");
        
        return { success: true };
    } catch (error: any) {
        console.error("Error adding comment:", error);
        return { success: false, error: error.message };
    }
};