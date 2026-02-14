import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { getContentRating } from './settingsService';

// ✅ Helper to get allowed ratings based on user settings
const getAllowedRatings = async () => {
    const userRating = await getContentRating(); // e.g., '12+', '16+', '18+'
    
    // Logic: If user can see '16+', they can also see '12+' and 'All'.
    // We explicitly list all allowed rating strings for the 'IN' query.
    switch(userRating) {
        case '18+': return ['All', '12+', '16+', '18+'];
        case '16+': return ['All', '12+', '16+'];
        case '12+': return ['All', '12+'];
        default: return ['All'];
    }
};

// Fetch Top 50 Anime (Trending) - Optimized
export const getTopAnime = async () => {
  try {
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    
    // ✅ Server-Side Filtering: Only fetch allowed content
    // Note: You may need a composite index for 'ageRating' + 'views'.
    const q = query(
        animeRef, 
        where('ageRating', 'in', allowed),
        orderBy('views', 'desc'), 
        limit(50)
    ); 
    
    let results = [];
    try {
        const snapshot = await getDocs(q);
        results = snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    } catch (networkError) {
        console.warn("Network failed, switching to Offline Cache...");
        const cachedSnapshot = await getDocsFromCache(q);
        results = cachedSnapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    }
    return results;
  } catch (error) {
    console.error("Error fetching anime:", error);
    return [];
  }
};

// Fetch Upcoming Anime - Optimized
export const getUpcomingAnime = async () => {
  try {
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    const q = query(
        animeRef, 
        where('status', '==', 'Upcoming'),
        where('ageRating', 'in', allowed),
        limit(15)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
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

// Calculate Rank based on Views
export const getAnimeRank = async (currentViews: number) => {
  try {
    const animeRef = collection(db, 'anime');
    const q = query(animeRef, where('views', '>', currentViews));
    const snapshot = await getDocs(q);
    return snapshot.size + 1;
  } catch (error) {
    console.error("Error fetching rank:", error);
    return 'N/A';
  }
};

// Fetch Similar Anime based on Genres - Optimized
export const getSimilarAnime = async (genres: string[], currentId: string) => {
  try {
    if (!genres || genres.length === 0) return [];
    
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    const searchGenres = genres.slice(0, 10); 
    
    const q = query(
        animeRef, 
        where('genres', 'array-contains-any', searchGenres),
        where('ageRating', 'in', allowed),
        limit(20)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs
        .map(doc => ({ mal_id: doc.id, ...doc.data() }))
        .filter((a: any) => String(a.mal_id) !== String(currentId));

  } catch (error) {
    console.error("Error fetching similar anime:", error);
    return [];
  }
};

// Get Recommended Anime based on User Genres - Optimized
export const getRecommendedAnime = async (userGenres: string[]) => {
  try {
    if (!userGenres || userGenres.length === 0) {
        return getTopAnime(); 
    }

    const allowed = await getAllowedRatings();
    const searchGenres = userGenres.slice(0, 5); 

    const animeRef = collection(db, 'anime');
    const q = query(
        animeRef, 
        where('genres', 'array-contains-any', searchGenres), 
        where('ageRating', 'in', allowed),
        limit(50)
    );
    
    const snapshot = await getDocs(q);
    
    const results = snapshot.docs.map(doc => ({
        mal_id: doc.id,
        ...doc.data()
    })) as any[];

    return results.sort((a, b) => (b.views || 0) - (a.views || 0));

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

// Fetch episodes
export const getAnimeEpisodes = async (id: string) => {
  try {
    const episodesRef = collection(db, 'anime', id, 'episodes');
    const q = query(episodesRef, orderBy('number', 'asc'), limit(50));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      mal_id: doc.id,
      title: doc.data().title,
      number: doc.data().number,
      url: doc.data().videoUrl,
      thumbnail: doc.data().thumbnailUrl,
      subtitles: doc.data().subtitles || [],
      downloads: doc.data().downloads || 0,
      size: doc.data().size || 0
    }));
  } catch (error) {
    console.error("Error fetching episodes:", error);
    return [];
  }
};

// ✅ OPTIMIZED: Search using 'keywords' + 'rating' in DB
export const searchAnime = async (queryText: string) => {
  try {
    if(!queryText) return [];
    
    const allowed = await getAllowedRatings();
    const animeRef = collection(db, 'anime');
    
    // Convert input to lowercase token
    const searchTerm = queryText.toLowerCase().trim().split(/\s+/)[0]; 

    const q = query(
        animeRef, 
        where('keywords', 'array-contains', searchTerm),
        where('ageRating', 'in', allowed),
        limit(20) // Only pay for 20 reads, not 1000!
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      mal_id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
};

// Add Rating
export const addAnimeReview = async (animeId: string, userId: string, userName: string, rating: number) => {
    try {
        const animeRef = doc(db, 'anime', animeId);
        const reviewRef = doc(db, 'anime', animeId, 'reviews', userId); 

        await runTransaction(db, async (transaction) => {
            const animeDoc = await transaction.get(animeRef);
            const reviewDoc = await transaction.get(reviewRef);

            if (!animeDoc.exists()) throw "Anime does not exist!";

            const data = animeDoc.data();
            let currentScore = data.score || 0;
            let currentCount = data.scored_by || 0;
            
            let totalPoints = currentScore * currentCount;

            if (reviewDoc.exists()) {
                const oldRating = reviewDoc.data().rating || 0;
                totalPoints = totalPoints - oldRating + rating;
            } else {
                totalPoints = totalPoints + rating;
                currentCount = currentCount + 1; 
            }

            const newScore = currentCount > 0 ? (totalPoints / currentCount) : 0;

            transaction.update(animeRef, {
                score: parseFloat(newScore.toFixed(1)), 
                scored_by: currentCount
            });

            transaction.set(reviewRef, {
                userId,
                userName: userName || 'Anonymous',
                rating,
                createdAt: new Date().toISOString()
            });
        });

        return true;
    } catch (error) {
        console.error("Error adding rating:", error);
        return false;
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

            if (!animeDoc.exists()) throw "Anime not found";

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

// Submit Comment
export const addAnimeComment = async (animeId: string, userId: string, userName: string, text: string) => {
    try {
        const commentsRef = collection(db, 'anime', animeId, 'comments');
        await addDoc(commentsRef, {
            userId,
            userName,
            text,
            createdAt: new Date().toISOString(),
            isPrivate: true 
        });
        return true;
    } catch (error) {
        console.error("Error adding comment:", error);
        return false;
    }
};