import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
  ArrowLeft,
  Bell,
  Captions,
  CheckCircle,
  Download,
  Eye,
  FileVideo,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  X,
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth, db, storage } from './firebase';
// ✅ IMPORT R2 UPLOADER
import { uploadToR2 } from './utils/r2Storage';

const GENRES_LIST = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", 
  "Horror", "Magic", "Mecha", "Music", "Mystery", 
  "Psychological", "Romance", "Sci-Fi", "Slice of Life", 
  "Sports", "Supernatural", "Thriller", "Isekai"
];

const AGE_RATINGS = ["All", "12+", "16+", "18+"];
const LANGUAGES = ["English", "Spanish", "Portuguese", "French", "German", "Indonesian", "Arabic", "Russian", "Japanese", "Chinese"];
const STATUS_OPTIONS = ["Pending", "Ongoing", "Completed", "Upcoming"];

export default function AnimeUpload() {
  // --- GLOBAL STATE ---
  const [view, setView] = useState('list');
  const [animeList, setAnimeList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [libraryTab, setLibraryTab] = useState('Ongoing'); 
  
  // --- USER ROLE STATE ---
  const [currentUser, setCurrentUser] = useState(null);

  // --- FORM STATE ---
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(''); 
  const [createdAnimeId, setCreatedAnimeId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [notifyUsers, setNotifyUsers] = useState(true);

  // --- DETAILS VIEW STATE ---
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [selectedAnimeEpisodes, setSelectedAnimeEpisodes] = useState([]);
  const [selectedAnimeComments, setSelectedAnimeComments] = useState([]); 

  // HEADER STATE (Anime Form)
  const [animeCover, setAnimeCover] = useState(null); 
  const [existingCoverUrl, setExistingCoverUrl] = useState(''); 
  const [animeTitle, setAnimeTitle] = useState('');
  const [totalEpisodes, setTotalEpisodes] = useState('');
  const [releaseYear, setReleaseYear] = useState(''); 
  const [synopsis, setSynopsis] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedAge, setSelectedAge] = useState('12+');
  const [animeStatus, setAnimeStatus] = useState('Ongoing'); 

  // BODY STATE (Episode Form)
  const [episodes, setEpisodes] = useState([]);
  const [deletedEpisodes, setDeletedEpisodes] = useState([]);

  // --- 1. FETCH USER ROLE ON MOUNT ---
  useEffect(() => {
    const fetchUser = async () => {
        if (auth.currentUser) {
            const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
            if (userSnap.exists()) {
                setCurrentUser({ uid: auth.currentUser.uid, ...userSnap.data() });
            }
        }
    };
    fetchUser();
  }, []);

  // --- 2. FETCH LIST (DEPENDS ON USER ROLE & TAB) ---
  useEffect(() => {
    if (currentUser) {
        fetchAnimeList();
    }
  }, [currentUser, libraryTab]); 

  const fetchAnimeList = async () => {
    setLoadingList(true);
    try {
      let q;
      const listRef = collection(db, 'anime');

      if (currentUser.role === 'anime_producer') {
          // PRODUCER: Only show MY anime
          q = query(listRef, where('uploaderId', '==', currentUser.uid));
      } else {
          // ADMIN: Show ALL anime (Admin Review Queue)
          q = query(listRef, orderBy('views', 'desc'));
      }

      const snapshot = await getDocs(q);
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side Filter by Tab
      list = list.filter(a => (a.status || 'Ongoing') === libraryTab);

      setAnimeList(list);
    } catch (error) { 
        console.error("Error fetching list:", error); 
    } finally { 
        setLoadingList(false); 
    }
  };

  const sendAutoNotification = async (title, body, targetId = null) => {
      try {
          await addDoc(collection(db, "announcements"), {
              title,
              body,
              targetId,
              type: 'anime_release',
              createdAt: serverTimestamp()
          });
      } catch (e) { console.error("Notification failed:", e); }
  };

  // --- ACTIONS ---

  const handleApprove = async (anime) => {
      if (!window.confirm(`Approve "${anime.title}"? It will go live immediately.`)) return;
      try {
          await updateDoc(doc(db, 'anime', anime.id), { status: 'Ongoing' });
          
          await sendAutoNotification(
              `New Release: ${anime.title}`,
              `${anime.title} has just been released! Watch it now on AniYu.`,
              anime.id
          );

          alert("Anime Approved & Published!");
          fetchAnimeList();
      } catch (e) { alert(e.message); }
  };

  const handleReject = async (anime) => {
      if (!window.confirm(`Reject "${anime.title}"? This will DELETE the anime permanently.`)) return;
      handleDelete(anime);
  };

  const handleCreateNew = () => {
    setCreatedAnimeId(null);
    setIsEditMode(false);
    setAnimeTitle(''); setTotalEpisodes(''); setReleaseYear(''); setSynopsis(''); setSelectedGenres([]); setExistingCoverUrl(''); setAnimeCover(null);
    
    if (currentUser?.role === 'anime_producer') {
        setAnimeStatus('Pending');
    } else {
        setAnimeStatus('Ongoing'); 
    }
    
    setEpisodes([{ id: Date.now(), number: 1, title: '', videoFile: null, thumbFile: null, subtitles: [], isNew: true }]);
    setDeletedEpisodes([]);
    setNotifyUsers(true); 
    setView('form');
  };

  const handleEdit = async (anime) => {
    setCreatedAnimeId(anime.id);
    setIsEditMode(true);
    setAnimeTitle(anime.title);
    setTotalEpisodes(anime.totalEpisodes || '');
    setReleaseYear(anime.year || ''); 
    setSynopsis(anime.synopsis);
    setSelectedGenres(anime.genres || []);
    setSelectedAge(anime.ageRating || '12+');
    setExistingCoverUrl(anime.images?.jpg?.image_url || '');
    setAnimeCover(null);
    setNotifyUsers(true); 
    setAnimeStatus(anime.status || 'Ongoing');

    setDeletedEpisodes([]);
    
    setStatus('Fetching episodes...');
    try {
      const q = query(collection(db, 'anime', anime.id, 'episodes'), orderBy('number', 'asc'));
      const epSnap = await getDocs(q);
      const fetchedEps = epSnap.docs.map(doc => ({
        id: doc.id, 
        number: doc.data().number, 
        title: doc.data().title,
        existingVideoUrl: doc.data().videoUrl, 
        existingThumbUrl: doc.data().thumbnailUrl,
        existingSubtitles: doc.data().subtitles || [],
        existingSize: doc.data().size || 0, 
        downloads: doc.data().downloads || 0,
        subtitles: (doc.data().subtitles || []).map((sub, idx) => ({ id: Date.now() + idx, language: sub.language, url: sub.url, file: null })),
        videoFile: null, 
        thumbFile: null, 
        isNew: false
      }));
      setEpisodes(fetchedEps.length > 0 ? fetchedEps : [{ id: Date.now(), number: 1, title: '', videoFile: null, thumbFile: null, subtitles: [], isNew: true }]);
      setView('form');
    } catch (e) { alert(e.message); }
    setStatus('');
  };

  const handleViewDetails = async (anime) => {
    setSelectedAnime(anime);
    setView('details');
    try {
      const qEp = query(collection(db, 'anime', anime.id, 'episodes'), orderBy('number', 'asc'));
      const epSnap = await getDocs(qEp);
      setSelectedAnimeEpisodes(epSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const qComm = query(collection(db, 'anime', anime.id, 'comments'), orderBy('createdAt', 'desc'));
      const commSnap = await getDocs(qComm);
      setSelectedAnimeComments(commSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { console.error(e); }
  };

  const handleDeleteComment = async (commentId) => {
      if(!window.confirm("Are you sure you want to delete this comment?")) return;
      try {
          await deleteDoc(doc(db, 'anime', selectedAnime.id, 'comments', commentId));
          setSelectedAnimeComments(prev => prev.filter(c => c.id !== commentId));
      } catch (e) { alert("Error deleting comment: " + e.message); }
  };

  const handleDelete = async (anime) => {
    if (currentUser.role === 'anime_producer' && anime.uploaderId !== currentUser.uid) {
        return alert("You can only delete your own uploads.");
    }

    if (!window.confirm(`WARNING: This will permanently delete "${anime.title}" along with ALL its episodes and files.\n\nAre you sure?`)) return;
    
    setAnimeList(prev => prev.filter(a => a.id !== anime.id));
    if (view === 'details') setView('list');

    try {
      // Note: We cannot programmatically delete from R2 easily without a backend key. 
      // Manual cleanup on Cloudflare dashboard might be needed for R2 files, or implement a cleanup script.
      if (anime.images?.jpg?.image_url) {
        try { await deleteObject(ref(storage, anime.images.jpg.image_url)); } catch (e) { console.warn("Cover not found"); }
      }

      const epSnapshot = await getDocs(collection(db, 'anime', anime.id, 'episodes'));
      const deletePromises = epSnapshot.docs.map(async (docSnap) => {
          const ep = docSnap.data();
          if (ep.videoUrl && ep.videoUrl.includes('firebasestorage')) {
             try { await deleteObject(ref(storage, ep.videoUrl)); } catch (e) {}
          }
          return deleteDoc(doc(db, 'anime', anime.id, 'episodes', docSnap.id));
      });

      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'anime', anime.id));
      alert(`"${anime.title}" has been deleted.`);

    } catch (e) { 
        alert("Error during deletion: " + e.message); 
        fetchAnimeList();
    }
  };

  // --- FORM HELPERS ---
  const addEpisodeForm = () => {
    const nextNum = episodes.length > 0 ? Number(episodes[episodes.length - 1].number) + 1 : 1;
    setEpisodes([...episodes, { id: Date.now(), number: nextNum, title: '', videoFile: null, thumbFile: null, subtitles: [], isNew: true }]);
  };

  const removeEpisodeForm = (index) => {
    const epToRemove = episodes[index];
    if (!epToRemove.isNew && epToRemove.id) {
        setDeletedEpisodes(prev => [...prev, epToRemove]);
    }
    const newEps = [...episodes]; 
    newEps.splice(index, 1); 
    setEpisodes(newEps); 
  };

  const updateEpisodeState = (index, field, value) => { 
      if (field === 'thumbFile' && value && !value.type.startsWith('image/')) {
          alert("Invalid file type. Please upload an image file (JPG, PNG, etc) for the thumbnail.");
          return;
      }
      if (field === 'videoFile' && value && !value.type.startsWith('video/')) {
          alert("Warning: The file type detected is not a standard video format. If this is a valid video file, you may proceed, otherwise please check the file.");
      }
      const newEps = [...episodes]; 
      newEps[index][field] = value; 
      setEpisodes(newEps); 
  };

  const addSubtitle = (epIndex) => {
    const newEps = [...episodes];
    newEps[epIndex].subtitles.push({ id: Date.now(), language: 'English', file: null, url: '' });
    setEpisodes(newEps);
  };
  const removeSubtitle = (epIndex, subIndex) => {
    const newEps = [...episodes];
    newEps[epIndex].subtitles.splice(subIndex, 1);
    setEpisodes(newEps);
  };
  const updateSubtitle = (epIndex, subIndex, field, value) => {
    const newEps = [...episodes];
    newEps[epIndex].subtitles[subIndex][field] = value;
    setEpisodes(newEps);
  };

  const handleFileChange = (e, setter, requiredType = 'image') => { 
      const file = e.target.files[0];
      if (!file) return;

      if (requiredType === 'image' && !file.type.startsWith('image/')) {
          alert("Invalid file type. Please upload a valid image file.");
          e.target.value = null; 
          return;
      }
      setter(file); 
  };
  
  // ✅ MODIFIED UPLOAD FUNCTION: Routes Video to R2, Images to Firebase
  const uploadFile = async (file, path) => {
    if (!file) return null;

    // 1. If it's a VIDEO -> Upload to Cloudflare R2 (Free Bandwidth)
    if (file.type.startsWith('video/')) {
       return await uploadToR2(file, path, (p) => {
           if (path.includes('episodes')) setProgress(p);
       });
    }

    // 2. If it's an IMAGE/SUBTITLE -> Upload to Firebase (Easy Optimization)
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on('state_changed', 
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (path.includes('episodes')) setProgress(Math.round(p));
        },
        (error) => reject(error),
        async () => { 
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ url, size: uploadTask.snapshot.totalBytes });
        }
      );
    });
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!animeTitle) { alert("Anime Title is required."); return; }
    if (!isEditMode && !animeCover) { alert("Cover Image is required."); return; }
    
    setLoading(true);
    setStatus('Saving Anime Details...');
    setProgress(0);

    try {
      const coverResult = await uploadFile(animeCover, 'covers');
      const finalCoverUrl = coverResult?.url || existingCoverUrl;
      let animeId = createdAnimeId;

      let finalStatus = animeStatus;
      if (currentUser?.role === 'anime_producer' && !isEditMode) {
          finalStatus = 'Pending';
      }

      const animeData = {
        title: animeTitle, 
        totalEpisodes: totalEpisodes || 'Unknown', 
        year: releaseYear || 'N/A', 
        synopsis, 
        genres: selectedGenres, 
        ageRating: selectedAge,
        images: { jpg: { image_url: finalCoverUrl } }, 
        type: 'TV', 
        status: finalStatus,
        uploaderId: currentUser.uid, 
        updatedAt: serverTimestamp()
      };

      if (isEditMode && animeId) {
        await updateDoc(doc(db, 'anime', animeId), animeData);
      } else {
        const ref = await addDoc(collection(db, 'anime'), { 
          ...animeData, 
          createdAt: serverTimestamp(), 
          views: 0, 
          likes: 0, 
          dislikes: 0, 
          rating: 0 
        });
        animeId = ref.id;
        setCreatedAnimeId(animeId);
      }

      if (deletedEpisodes.length > 0) {
          setStatus('Removing deleted episodes...');
          for (const delEp of deletedEpisodes) {
              try {
                  await deleteDoc(doc(db, 'anime', animeId, 'episodes', delEp.id));
                  // Only delete from Firebase if it was a firebase URL. R2 cleanup is manual/separate.
                  if (delEp.existingVideoUrl && delEp.existingVideoUrl.includes('firebasestorage')) {
                      await deleteObject(ref(storage, delEp.existingVideoUrl)).catch(e => {});
                  }
                  if (delEp.existingThumbUrl) await deleteObject(ref(storage, delEp.existingThumbUrl)).catch(e => {});
              } catch (e) { console.error("Error deleting episode:", e); }
          }
      }

      const totalOps = episodes.length;
      let completedOps = 0;

      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        setStatus(`Uploading Episode ${ep.number} media & subtitles...`);
        
        if (!ep.videoFile && !ep.existingVideoUrl) continue;

        const vidResult = await uploadFile(ep.videoFile, `anime/${animeId}/episodes`);
        const thumbResult = await uploadFile(ep.thumbFile, 'episode_thumbnails');

        const finalSubtitles = [];
        for (const sub of ep.subtitles) {
            const subResult = await uploadFile(sub.file, 'subtitles');
            finalSubtitles.push({
                language: sub.language,
                url: subResult?.url || sub.url
            });
        }

        const epData = {
          title: ep.title || `Episode ${ep.number}`, 
          number: Number(ep.number),
          videoUrl: vidResult?.url || ep.existingVideoUrl,
          thumbnailUrl: thumbResult?.url || ep.existingThumbUrl || finalCoverUrl,
          size: vidResult?.size || ep.existingSize || 0,
          subtitles: finalSubtitles,
          updatedAt: serverTimestamp()
        };

        if (ep.isNew) {
           await addDoc(collection(db, 'anime', animeId, 'episodes'), { ...epData, downloads: 0, createdAt: serverTimestamp() });
        } else {
           await updateDoc(doc(db, 'anime', animeId, 'episodes', ep.id), epData);
        }
        completedOps++;
        setProgress(Math.round((completedOps / totalOps) * 100));
      }

      setStatus('Success!');
      
      if (notifyUsers && finalStatus !== 'Pending') {
          if (isEditMode) {
             const newEpCount = episodes.filter(e => e.isNew).length;
             if (newEpCount > 0) {
                 await sendAutoNotification(
                     `New Episode: ${animeTitle}`,
                     `${newEpCount} new episode(s) added to ${animeTitle}. Watch now!`,
                     animeId
                 );
             }
          } else {
             await sendAutoNotification(
                 `New Anime Arrived! 🌟`,
                 `${animeTitle} is now available on AniYu. Check it out!`,
                 animeId
             );
          }
      }

      alert(finalStatus === 'Pending' ? "Submitted for Review! Waiting for Admin approval." : "Published Successfully!");
      
      setView('list'); 
      setLibraryTab(finalStatus); 

    } catch (error) { console.error(error); alert('Error: ' + error.message); } finally { setLoading(false); }
  };

  // --- RENDER: DETAILS VIEW ---
  if (view === 'details' && selectedAnime) {
    return (
      <div className="container">
        <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, marginBottom: 20 }}>
          <ArrowLeft size={18} /> Back to Library
        </button>

        <div className="grid-12">
          {/* HEADER (LEFT SIDEBAR) */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header blue">
              <Film size={20} />
              <span>Anime Details</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 15, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', position:'relative' }}>
                <img src={selectedAnime.images?.jpg?.image_url} alt={selectedAnime.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                
                <div style={{position:'absolute', top:10, right:10, background: selectedAnime.status === 'Completed' ? '#10b981' : selectedAnime.status === 'Upcoming' ? '#eab308' : '#3b82f6', color:'white', padding:'5px 10px', borderRadius:8, fontWeight:'bold', fontSize:'0.8rem'}}>
                    {selectedAnime.status || 'Ongoing'}
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div>
                   <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', margin: 0 }}>{selectedAnime.title}</h1>
                   <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                      {selectedAnime.genres?.map(g => <span key={g} className="chip" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>{g}</span>)}
                   </div>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: '1.5' }}>
                  {selectedAnime.synopsis || "No synopsis available."}
                </div>
                
                <div style={{ background: '#f9fafb', padding: 15, borderRadius: 12, border: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                  <div>
                      <div style={{fontSize:'0.75rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Views</div>
                      <div style={{fontSize:'1.1rem', fontWeight:800, color:'#111827', display:'flex', alignItems:'center', gap:5}}>
                          <Eye size={16}/> {selectedAnime.views || 0}
                      </div>
                  </div>
                  <div>
                      <div style={{fontSize:'0.75rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Rating</div>
                      <div style={{fontSize:'1.1rem', fontWeight:800, color:'#eab308', display:'flex', alignItems:'center', gap:5}}>
                          <Star size={16} fill="#eab308"/> {selectedAnime.score ? `${Number(selectedAnime.score).toFixed(1)}` : "N/A"}
                      </div>
                  </div>
                  
                  <div>
                      <div style={{fontSize:'0.75rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Likes</div>
                      <div style={{fontSize:'1.1rem', fontWeight:800, color:'#10b981', display:'flex', alignItems:'center', gap:5}}>
                          <ThumbsUp size={16}/> {selectedAnime.likes || 0}
                      </div>
                  </div>
                  <div>
                      <div style={{fontSize:'0.75rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Dislikes</div>
                      <div style={{fontSize:'1.1rem', fontWeight:800, color:'#ef4444', display:'flex', alignItems:'center', gap:5}}>
                          <ThumbsDown size={16}/> {selectedAnime.dislikes || 0}
                      </div>
                  </div>
                  
                  <div style={{ gridColumn: 'span 2' }}>
                      <div style={{fontSize:'0.75rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Total Comments</div>
                      <div style={{fontSize:'1.1rem', fontWeight:800, color:'#3b82f6', display:'flex', alignItems:'center', gap:5}}>
                          <MessageSquare size={16}/> {selectedAnimeComments.length}
                      </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
             {/* COMMENTS SECTION */}
             <div className="card" style={{ maxHeight: 400, display: 'flex', flexDirection: 'column' }}>
                 <div className="card-header blue" style={{ padding: '15px 20px', borderBottom: '1px solid #e5e7eb', fontSize: '1rem' }}>
                    <MessageSquare size={18} /> Community Comments ({selectedAnimeComments.length})
                 </div>
                 <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>
                     {selectedAnimeComments.length === 0 ? (
                         <div style={{ textAlign: 'center', color: '#9ca3af', padding: 20, fontStyle: 'italic' }}>No comments yet.</div>
                     ) : (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                             {selectedAnimeComments.map(comment => (
                                 <div key={comment.id} style={{ background: '#f9fafb', padding: 15, borderRadius: 12, border: '1px solid #e5e7eb' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                         <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1f2937' }}>{comment.userName || 'Anonymous'}</div>
                                         <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : 'N/A'}</div>
                                     </div>
                                     <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563', lineHeight: '1.4' }}>{comment.text}</p>
                                     <button 
                                        onClick={() => handleDeleteComment(comment.id)}
                                        style={{ marginTop: 10, border: 'none', background: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                     >
                                         <Trash2 size={12} /> Delete Comment
                                     </button>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
             </div>

             {/* EPISODES LIST */}
             <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <PlayCircle className="text-purple-600"/> Episodes List
             </h2>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
                {selectedAnimeEpisodes.map(ep => (
                  <div key={ep.id} className="card" style={{ marginBottom: 0, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ width: '100%', height: 140, backgroundColor: '#000', position: 'relative' }}>
                      <img src={ep.thumbnailUrl || selectedAnime.images?.jpg?.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                      <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700 }}>EP {ep.number}</div>
                    </div>
                    <div style={{ padding: 15 }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 10px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#2563eb', fontWeight: 600 }}>
                            <Captions size={14} /> <span>{(ep.subtitles || []).length} Subs</span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280' }}>
                            <Download size={14} /> <span>{ep.downloads || 0}</span>
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: LIST VIEW ---
  if (view === 'list') {
    const filteredAnimeList = animeList.filter(item => {
        const itemStatus = item.status === 'Released' ? 'Ongoing' : (item.status || 'Ongoing');
        return itemStatus === libraryTab;
    });

    return (
      <div className="container">
        <div className="card" style={{ marginBottom: 30, background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', border: 'none' }}>
           <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 20px', textAlign: 'center' }}>
              <div style={{ color: 'white', marginBottom: 15 }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>Anime Studio</h1>
                <p style={{ opacity: 0.9, marginTop: 5 }}>Manage your library and upload new content</p>
              </div>
              <button onClick={handleCreateNew} className="btn-publish" style={{ width: 'auto', padding: '15px 40px', background: 'white', color: '#4f46e5', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}><Plus size={24} /> UPLOAD NEW ANIME</button>
           </div>
        </div>

        {/* TAB SWITCHER */}
        <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 20 }}>
            {STATUS_OPTIONS.map(status => (
                <button 
                  key={status}
                  onClick={() => setLibraryTab(status)}
                  style={{
                      padding: '8px 20px',
                      borderRadius: 20,
                      border: 'none',
                      background: libraryTab === status ? (status === 'Pending' ? '#f59e0b' : '#4f46e5') : 'transparent',
                      color: libraryTab === status ? 'white' : '#6b7280',
                      fontWeight: 700,
                      cursor: 'pointer'
                  }}
                >
                    {status}
                </button>
            ))}
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {filteredAnimeList.length === 0 && <div style={{textAlign:'center', color:'#9ca3af', padding:40}}>No anime found in {libraryTab}.</div>}
          
          {filteredAnimeList.map((anime, index) => (
            <div key={anime.id} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: 20, gap: 20 }}>
                <div style={{ width: 60, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, position:'relative' }}>
                    <img src={anime.images?.jpg?.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{position:'absolute', bottom:0, width:'100%', background: anime.status === 'Completed' ? 'rgba(16, 185, 129, 0.9)' : anime.status === 'Upcoming' ? 'rgba(234, 179, 8, 0.9)' : 'rgba(59, 130, 246, 0.9)', color:'white', fontSize:'0.5rem', textAlign:'center', fontWeight:'bold', textTransform:'uppercase'}}>
                        {anime.status || 'Ongoing'}
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', fontWeight: 700 }}>{anime.title}</h3>
                  <div style={{ display: 'flex', gap: 12, alignItems:'center', marginTop: 5 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4f46e5' }}>#{index + 1}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                         <Eye size={14} /> {anime.views || 0}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                         <ThumbsUp size={14} /> {anime.likes || 0}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                         <ThumbsDown size={14} /> {anime.dislikes || 0}
                      </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                   {/* ✅ ADMIN APPROVAL BUTTONS */}
                   {libraryTab === 'Pending' && currentUser?.role !== 'anime_producer' && (
                       <>
                           <button onClick={() => handleApprove(anime)} style={{ padding: '8px 12px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 'bold', border: '1px solid #bbf7d0', display:'flex', gap:5, cursor:'pointer' }}><CheckCircle size={16}/> Approve</button>
                           <button onClick={() => handleReject(anime)} style={{ padding: '8px 12px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca', display:'flex', gap:5, cursor:'pointer' }}><XCircle size={16}/> Reject</button>
                       </>
                   )}
                   
                   <button onClick={() => handleViewDetails(anime)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 600 }}>View</button>
                   <button onClick={() => handleEdit(anime)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                   <button onClick={() => handleDelete(anime)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- RENDER: FORM VIEW (BULK UPLOAD/EDIT) ---
  return (
    <div className="container">
      <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, marginBottom: 20 }}>
        <ArrowLeft size={18} /> Back to List
      </button>

      <div className="page-header">
        <div className="page-title"><h1>{isEditMode ? "Manage Series" : "New Series Upload"}</h1></div>
        
        {!loading && (
           <div style={{display:'flex', gap: 15, alignItems:'center'}}>
               <div 
                 onClick={() => setNotifyUsers(!notifyUsers)}
                 style={{display:'flex', alignItems:'center', gap: 8, cursor:'pointer', background:'white', padding:'10px 15px', borderRadius:10, border: notifyUsers ? '1px solid #2563eb' : '1px solid #e5e7eb'}}
               >
                   <Bell size={18} className={notifyUsers ? "text-blue-600 fill-current" : "text-gray-400"} />
                   <span style={{fontWeight:700, fontSize:'0.9rem', color: notifyUsers ? '#2563eb' : '#6b7280'}}>Notify Users</span>
               </div>

               {/* ✅ BUTTON TEXT FOR PRODUCER */}
               <button onClick={handlePublish} className="btn-publish" style={{ width: 'auto', padding: '12px 30px', fontSize: '1rem' }}>
                   {currentUser?.role === 'anime_producer' ? "Submit for Review" : "Save All Changes"}
               </button>
           </div>
        )}
      </div>

      <form onSubmit={handlePublish}>
        {/* HEADER: ANIME DETAILS */}
        <div className="card">
          <div className="card-header blue" style={{justifyContent:'space-between'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}><Film size={24} /> <span>Header: Anime Details</span></div>
              
              {/* ✅ HIDE STATUS FOR PRODUCER */}
              {currentUser?.role !== 'anime_producer' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background:'white', padding:'5px 15px', borderRadius:12, border:'1px solid #bfdbfe' }}>
                      <span style={{fontSize:'0.85rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase'}}>Status:</span>
                      <select 
                        value={animeStatus} 
                        onChange={(e) => setAnimeStatus(e.target.value)}
                        style={{border:'none', fontWeight:700, color: animeStatus === 'Completed' ? '#10b981' : animeStatus === 'Upcoming' ? '#eab308' : '#3b82f6', outline:'none', fontSize:'0.95rem'}}
                      >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                  </div>
              ) : (
                  <div style={{ background: '#fffbeb', color: '#d97706', padding: '5px 15px', borderRadius: 12, fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #fcd34d' }}>
                      {animeStatus === 'Pending' ? "Waiting for Approval" : animeStatus}
                  </div>
              )}
          </div>
          <div className="card-body">
            <div className="grid-12">
              <div>
                <span className="form-label">Cover</span>
                {/* ✅ ADDED accept="image/*" and validation logic */}
                <input type="file" accept="image/*" className="hidden" id="animeCover" onChange={(e) => handleFileChange(e, setAnimeCover, 'image')} />
                <label htmlFor="animeCover" className={`upload-zone ${animeCover ? 'active' : ''}`}>
                  {animeCover ? <img src={URL.createObjectURL(animeCover)} /> : existingCoverUrl ? <img src={existingCoverUrl} /> : <div style={{textAlign:'center', color:'#9ca3af'}}><ImageIcon size={30}/> Upload</div>}
                </label>
              </div>
              <div>
                <div className="grid-3" style={{marginBottom:0, display:'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 20}}>
                    <div className="form-group"><span className="form-label">Title</span><input type="text" className="input-field" value={animeTitle} onChange={e => setAnimeTitle(e.target.value)} /></div>
                    <div className="form-group"><span className="form-label">Total Eps</span><input type="number" className="input-field" placeholder="12" value={totalEpisodes} onChange={e => setTotalEpisodes(e.target.value)} /></div>
                    <div className="form-group"><span className="form-label">Year</span><input type="number" className="input-field" placeholder="2024" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} /></div>
                </div>
                <div className="form-group"><span className="form-label">Synopsis</span><textarea className="textarea-field" value={synopsis} onChange={e => setSynopsis(e.target.value)}></textarea></div>
                <div className="form-group"><span className="form-label">Genres</span><div className="chips-container">{GENRES_LIST.map(g => <div key={g} className={`chip ${selectedGenres.includes(g) ? 'selected' : ''}`} onClick={() => { if(selectedGenres.includes(g)) setSelectedGenres(prev=>prev.filter(x=>x!==g)); else if(selectedGenres.length<3) setSelectedGenres([...selectedGenres, g]); }}>{g}</div>)}</div></div>
                <div className="form-group"><span className="form-label">Age Rating</span><div className="chips-container">{AGE_RATINGS.map(r => <div key={r} className={`chip ${selectedAge === r ? 'selected' : ''}`} onClick={() => setSelectedAge(r)}>{r}</div>)}</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* BODY: EPISODE LIST */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 10 }}><PlayCircle color="#8b5cf6" /> Episodes ({episodes.length})</h2>
          {episodes.map((ep, index) => (
            <div key={ep.id} className="card" style={{ border: '2px solid #f3f4f6' }}>
              <div className="card-header purple" style={{ padding: '15px 20px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1rem' }}>Episode {ep.number} Form</span>
                {episodes.length > 1 && <button type="button" onClick={() => removeEpisodeForm(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>}
              </div>
              <div className="card-body" style={{ padding: 20 }}>
                <div className="grid-2">
                   <div>
                      <div className="form-group">
                         <span className="form-label">Thumbnail</span>
                         {/* ✅ ADDED accept="image/*" and validation logic */}
                         <input type="file" accept="image/*" className="hidden" id={`thumb-${ep.id}`} onChange={(e) => updateEpisodeState(index, 'thumbFile', e.target.files[0])} />
                         <label htmlFor={`thumb-${ep.id}`} className="upload-zone upload-zone-small">
                            {ep.thumbFile ? <img src={URL.createObjectURL(ep.thumbFile)} /> : ep.existingThumbUrl ? <img src={ep.existingThumbUrl} /> : <div style={{textAlign:'center', color:'#9ca3af'}}><ImageIcon /> Thumb</div>}
                         </label>
                      </div>
                      <div style={{display:'flex', gap:10}}>
                         <div style={{width:80}}><span className="form-label">No.</span><input type="number" className="input-field" value={ep.number} onChange={(e) => updateEpisodeState(index, 'number', e.target.value)} /></div>
                         <div style={{flex:1}}><span className="form-label">Title</span><input type="text" className="input-field" value={ep.title} onChange={(e) => updateEpisodeState(index, 'title', e.target.value)} /></div>
                      </div>
                   </div>
                   <div>
                      <div className="form-group">
                         <span className="form-label">Video File {ep.existingVideoUrl && "(Uploaded)"}</span>
                         {/* ✅ ADDED expanded accept attribute as requested */}
                         <input type="file" accept="video/*, .mkv, .mp4, .avi, .mov, .flv, .wmv, .webm" className="hidden" id={`vid-${ep.id}`} onChange={(e) => updateEpisodeState(index, 'videoFile', e.target.files[0])} />
                         <label htmlFor={`vid-${ep.id}`} className={`upload-zone ${ep.videoFile ? 'active' : ''}`} style={{ minHeight: 180 }}>
                            {ep.videoFile ? <div style={{textAlign:'center', color:'#7c3aed'}}><FileVideo size={40}/><div>{ep.videoFile.name}</div></div> : ep.existingVideoUrl ? <div style={{textAlign:'center', color:'#10b981'}}><FileVideo size={40}/><div>Video Exists</div><div style={{fontSize:10}}>Click to Replace</div></div> : <div style={{textAlign:'center', color:'#9ca3af'}}><Upload size={40}/> Upload Video</div>}
                         </label>
                      </div>
                      <div className="form-group" style={{marginTop: 20, background: '#f8fafc', padding: 15, borderRadius: 12, border: '1px dashed #e2e8f0'}}>
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:10}}>
                             <span className="form-label" style={{marginBottom:0}}>Subtitles ({ep.subtitles.length})</span>
                             <button type="button" onClick={() => addSubtitle(index)} style={{fontSize:'0.75rem', fontWeight:700, color:'#2563eb', background:'none', border:'none', cursor:'pointer'}}>+ Add Language</button>
                          </div>
                          <div style={{display:'flex', flexDirection:'column', gap:10}}>
                             {ep.subtitles.map((sub, subIdx) => (
                                <div key={sub.id} style={{display:'flex', gap:10, alignItems:'center'}}>
                                   <select className="input-field" style={{padding:'8px', fontSize:'0.85rem', width:120}} value={sub.language} onChange={(e) => updateSubtitle(index, subIdx, 'language', e.target.value)}>
                                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                   </select>
                                   <div style={{flex:1, position:'relative'}}>
                                      <input type="file" className="hidden" id={`sub-${sub.id}`} onChange={(e) => updateSubtitle(index, subIdx, 'file', e.target.files[0])} />
                                      <label htmlFor={`sub-${sub.id}`} style={{display:'block', padding:'8px 12px', background:'white', border:'1px solid #cbd5e1', borderRadius:8, fontSize:'0.85rem', cursor:'pointer', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                         {sub.file ? sub.file.name : sub.url ? "Existing Subtitle" : "Select .SRT File"}
                                      </label>
                                   </div>
                                   <button type="button" onClick={() => removeSubtitle(index, subIdx)} style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer'}}><X size={16}/></button>
                                </div>
                             ))}
                             {ep.subtitles.length === 0 && <div style={{fontSize:'0.8rem', color:'#94a3b8', fontStyle:'italic'}}>No subtitles added.</div>}
                          </div>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addEpisodeForm} className="btn-publish" style={{ background: '#f3f4f6', color: '#4b5563', border: '2px dashed #d1d5db', boxShadow: 'none' }}><Plus size={24} /> ADD MORE EPISODE</button>
        </div>

        {loading && (
            <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 600, background: 'white', padding: 20, borderRadius: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', zIndex: 100 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                  <Loader2 className="animate-spin" color="#4f46e5" />
                  <div>
                    <div style={{ fontWeight: 800, color: '#1f2937' }}>{status}</div>
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Please do not close this tab.</div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, color: '#4f46e5', fontSize: '1.2rem' }}>{progress}%</div>
              </div>
              <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#4f46e5', transition: 'width 0.3s ease' }}></div>
              </div>
            </div>
        )}

      </form>
    </div>
  );
}