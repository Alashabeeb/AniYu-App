import {
  collection,
  doc, // ✅ NEW IMPORT
  DocumentSnapshot // ✅ NEW IMPORT
  ,
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
import { db } from '../config/firebaseConfig';
import { getContentRating, isContentAllowed } from './settingsService';

// ✅ Helper to filter manga based on user settings
const filterContent = async (data: any[]) => {
    const userRating = await getContentRating();
    return data.filter(item => isContentAllowed(item.rating, item.genres, userRating));
};

// 1. Get Top Manga
export const getTopManga = async () => {
  try {
    const mangaRef = collection(db, 'manga');
    const q = query(mangaRef, orderBy('views', 'desc'), limit(50));
    
    let results = [];
    try {
        const snapshot = await getDocs(q);
        results = snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    } catch (networkError) {
        console.warn("Network failed, switching to Offline Cache...");
        const cachedSnapshot = await getDocsFromCache(q);
        results = cachedSnapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));
    }
    return await filterContent(results);
  } catch (error) {
    console.error("Error fetching top manga:", error);
    return [];
  }
};

// 2. Get All Manga (Optimized Limit)
export const getAllManga = async () => {
  try {
    const mangaRef = collection(db, 'manga');
    const q = query(mangaRef, orderBy('updatedAt', 'desc'), limit(50)); // ✅ Reduced limit to 50
    
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(doc => ({ mal_id: doc.id, ...doc.data() }));

    return await filterContent(results);
  } catch (error) {
    console.error("Error fetching all manga:", error);
    return [];
  }
};

// 3. Search Manga (Optimized Prefix Search)
export const searchManga = async (queryText: string) => {
  if (!queryText) return [];
  try {
    const mangaRef = collection(db, 'manga');
    // ✅ OPTIMIZED: Uses Firestore query instead of client-side filtering
    const q = query(
        mangaRef, 
        where('title', '>=', queryText),
        where('title', '<=', queryText + '\uf8ff'),
        limit(20)
    );
    
    const snapshot = await getDocs(q);
    const matches = snapshot.docs.map(doc => ({
      mal_id: doc.id,
      ...doc.data()
    }));
    
    return await filterContent(matches);
  } catch (error) {
    console.error("Error searching manga:", error);
    return [];
  }
};

// 4. Get Manga Details
export const getMangaDetails = async (id: string) => {
  try {
    const docRef = doc(db, 'manga', id);
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

// 5. Get Chapters (Paginated)
export const getMangaChapters = async (id: string, lastVisible: DocumentSnapshot | null = null) => {
  try {
    const chaptersRef = collection(db, 'manga', id, 'chapters');
    // ✅ PAGINATION: Fetch 50 at a time
    let q = query(chaptersRef, orderBy('number', 'asc'), limit(50));
    
    if (lastVisible) {
        q = query(q, startAfter(lastVisible));
    }

    const snapshot = await getDocs(q);
    
    return {
        data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        lastVisible: snapshot.docs[snapshot.docs.length - 1] || null
    };
  } catch (error) {
    console.error("Error fetching chapters:", error);
    return { data: [], lastVisible: null };
  }
};

// ✅ NEW: Get Single Adjacent Chapter (Next/Prev)
export const getAdjacentChapter = async (mangaId: string, currentNumber: number, direction: 'next' | 'prev') => {
    try {
        const chaptersRef = collection(db, 'manga', mangaId, 'chapters');
        const op = direction === 'next' ? '>' : '<';
        const sortOrder = direction === 'next' ? 'asc' : 'desc';
        
        const q = query(
            chaptersRef, 
            where('number', op, currentNumber),
            orderBy('number', sortOrder),
            limit(1) // ✅ Only fetch ONE document
        );
        
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching adjacent chapter:", error);
        return null;
    }
};

// 6. Increment View
export const incrementMangaView = async (id: string) => {
  try {
    const docRef = doc(db, 'manga', id);
    await updateDoc(docRef, {
      views: increment(1)
    });
  } catch (error) {
    console.error("Error updating manga view count:", error);
  }
};

// 7. Add Manga Review
export const addMangaReview = async (mangaId: string, userId: string, userName: string, rating: number) => {
    try {
        const mangaRef = doc(db, 'manga', mangaId);
        const reviewRef = doc(db, 'manga', mangaId, 'reviews', userId); 

        await runTransaction(db, async (transaction) => {
            const mangaDoc = await transaction.get(mangaRef);
            const reviewDoc = await transaction.get(reviewRef);

            if (!mangaDoc.exists()) throw "Manga does not exist!";

            const data = mangaDoc.data();
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

            transaction.update(mangaRef, {
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

// 8. Get Reviews
export const getMangaReviews = async (mangaId: string) => {
    try {
        const q = query(collection(db, 'manga', mangaId, 'reviews'), orderBy('createdAt', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching reviews:", e);
        return [];
    }
};