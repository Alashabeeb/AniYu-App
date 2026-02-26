import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  limit,
  orderBy, query, serverTimestamp,
  startAfter,
  updateDoc, where
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Eye,
  File as FileIcon,
  FileImage,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw, // ✅ IMPORTED REFRESH ICON
  Trash2,
  Unlock
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth, db, storage } from './firebase';
import { uploadToR2 } from './utils/r2Storage';

const GENRES_LIST = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", 
  "Horror", "Magic", "Mecha", "Music", "Mystery", 
  "Psychological", "Romance", "Sci-Fi", "Slice of Life", 
  "Sports", "Supernatural", "Thriller", "Isekai"
];

const STATUS_OPTIONS = ["Pending", "Ongoing", "Completed", "Hiatus"];

export default function MangaUpload() {
  const [view, setView] = useState('list');
  const [mangaList, setMangaList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [libraryTab, setLibraryTab] = useState('Ongoing');
  
  const [currentUser, setCurrentUser] = useState(null);

  // Pagination states
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(''); 
  const [createdMangaId, setCreatedMangaId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [notifyUsers, setNotifyUsers] = useState(true);

  const [selectedManga, setSelectedManga] = useState(null);
  const [selectedMangaChapters, setSelectedMangaChapters] = useState([]);
  const [selectedMangaComments, setSelectedMangaComments] = useState([]);

  // HEADER STATE
  const [mangaCover, setMangaCover] = useState(null); 
  const [existingCoverUrl, setExistingCoverUrl] = useState(''); 
  const [mangaTitle, setMangaTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [releaseYear, setReleaseYear] = useState(''); 
  const [synopsis, setSynopsis] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [mangaStatus, setMangaStatus] = useState('Ongoing'); 
  
  // ✅ NEW: READING RIGHTS STATE
  const [hasReadingRights, setHasReadingRights] = useState(true);

  // BODY STATE
  const [chapters, setChapters] = useState([]);
  const [deletedChapters, setDeletedChapters] = useState([]);

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

  // ✅ SURGICAL UPDATE: Removed `libraryTab` dependency so it doesn't fetch on tab switch
  useEffect(() => {
    if (currentUser) {
        fetchMangaList();
    }
  }, [currentUser]);

  // ✅ SURGICAL UPDATE: Added Session Caching logic
  const fetchMangaList = async (isLoadMore = false, forceRefresh = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoadingList(true);

    try {
      const CACHE_KEY = `admin_manga_cache_${currentUser.uid}`;

      // 1. Return Instant Cache (0 bandwidth, 0 reads)
      if (!isLoadMore && !forceRefresh) {
          const cachedData = sessionStorage.getItem(CACHE_KEY);
          if (cachedData) {
              setMangaList(JSON.parse(cachedData));
              setLoadingList(false);
              return; 
          }
      }

      let q;
      const listRef = collection(db, 'manga');
      
      if (currentUser.role === 'manga_producer') {
          q = query(listRef, where('uploaderId', '==', currentUser.uid), limit(50));
          if (isLoadMore && lastVisible) q = query(listRef, where('uploaderId', '==', currentUser.uid), startAfter(lastVisible), limit(50));
      } else {
          q = query(listRef, orderBy('views', 'desc'), limit(50));
          if (isLoadMore && lastVisible) q = query(listRef, orderBy('views', 'desc'), startAfter(lastVisible), limit(50));
      }

      const snapshot = await getDocs(q);
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (snapshot.docs.length > 0) setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      if (snapshot.docs.length < 50) setHasMore(false);
      else setHasMore(true);

      setMangaList(prev => {
          let newList;
          if (isLoadMore) {
              const combined = [...prev, ...list];
              newList = Array.from(new Map(combined.map(item => [item.id, item])).values());
          } else {
              newList = list;
          }
          // 2. Save new fetch to session cache
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(newList));
          return newList;
      });
    } catch (error) { 
        console.error("Error fetching list:", error); 
    } finally { 
        setLoadingList(false);
        setLoadingMore(false);
    }
  };

  const sendAutoNotification = async (title, body, targetId = null) => {
      try {
          await addDoc(collection(db, "announcements"), {
              title, body, targetId, type: 'manga_release', createdAt: serverTimestamp()
          });
      } catch (e) { console.error("Notification failed:", e); }
  };

  const handleApprove = async (manga) => {
      if (!window.confirm(`Approve "${manga.title}"? It will go live immediately.`)) return;
      try {
          await updateDoc(doc(db, 'manga', manga.id), { status: 'Ongoing' });
          await sendAutoNotification(`New Manga: ${manga.title}`, `Read ${manga.title} now on AniYu!`, manga.id);
          alert("Approved & Published!");
          
          // ✅ SURGICAL UPDATE: Wipe cache and force refresh
          sessionStorage.removeItem(`admin_manga_cache_${currentUser.uid}`);
          fetchMangaList(false, true);
      } catch (e) { alert(e.message); }
  };

  const handleReject = async (manga) => {
      if (!window.confirm(`Reject and delete "${manga.title}"?`)) return;
      handleDelete(manga);
  };

  const handleCreateNew = () => {
    setCreatedMangaId(null);
    setIsEditMode(false);
    setMangaTitle(''); setAuthor(''); setReleaseYear(''); setSynopsis(''); setSelectedGenres([]); setExistingCoverUrl(''); setMangaCover(null);
    
    if (currentUser?.role === 'manga_producer') setMangaStatus('Pending'); else setMangaStatus('Ongoing'); 
    setHasReadingRights(true); // ✅ Set default to true
    setChapters([{ id: Date.now(), number: 1, title: '', chapterFile: null, existingFileUrl: null, isNew: true }]);
    setDeletedChapters([]);
    setNotifyUsers(true);
    setView('form');
  };

  const handleEdit = async (manga) => {
    setCreatedMangaId(manga.id);
    setIsEditMode(true);
    setMangaTitle(manga.title);
    setAuthor(manga.author || '');
    setReleaseYear(manga.year || ''); 
    setSynopsis(manga.synopsis);
    setSelectedGenres(manga.genres || []);
    setExistingCoverUrl(manga.coverUrl || manga.images?.jpg?.image_url || '');
    setMangaCover(null);
    setNotifyUsers(true);
    setMangaStatus(manga.status || 'Ongoing');
    
    // ✅ Load existing reading rights status
    setHasReadingRights(manga.hasReadingRights !== false);

    setDeletedChapters([]);
    setStatus('Fetching chapters...');
    try {
      const q = query(collection(db, 'manga', manga.id, 'chapters'), orderBy('number', 'asc'));
      const chSnap = await getDocs(q);
      const fetchedChaps = chSnap.docs.map(doc => ({
        id: doc.id, 
        number: doc.data().number, 
        title: doc.data().title,
        existingFileUrl: (doc.data().pages && doc.data().pages.length > 0) ? doc.data().pages[0] : null, 
        chapterFile: null, 
        isNew: false
      }));
      setChapters(fetchedChaps.length > 0 ? fetchedChaps : [{ id: Date.now(), number: 1, title: '', chapterFile: null, existingFileUrl: null, isNew: true }]);
      setView('form');
    } catch (e) { alert(e.message); }
    setStatus('');
  };

  const handleViewDetails = async (manga) => {
    setSelectedManga(manga);
    setView('details');
    try {
      const qCh = query(collection(db, 'manga', manga.id, 'chapters'), orderBy('number', 'asc'));
      const chSnap = await getDocs(qCh);
      setSelectedMangaChapters(chSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (manga) => {
    if (currentUser.role === 'manga_producer' && manga.uploaderId !== currentUser.uid) return alert("You can only delete your own uploads.");
    if (!window.confirm(`WARNING: This will permanently delete "${manga.title}".\n\nAre you sure?`)) return;
    
    setMangaList(prev => prev.filter(m => m.id !== manga.id));
    if (view === 'details') setView('list');

    try {
      if (manga.coverUrl || manga.images?.jpg?.image_url) {
        try { await deleteObject(ref(storage, manga.coverUrl || manga.images.jpg.image_url)); } catch (e) {}
      }

      const chSnapshot = await getDocs(collection(db, 'manga', manga.id, 'chapters'));
      const deletePromises = chSnapshot.docs.map(async (docSnap) => {
          const ch = docSnap.data();
          if (ch.pages) {
              for (const pageUrl of ch.pages) {
                  if (pageUrl && pageUrl.includes('firebasestorage')) {
                      try { await deleteObject(ref(storage, pageUrl)); } catch (e) {}
                  }
              }
          }
          return deleteDoc(doc(db, 'manga', manga.id, 'chapters', docSnap.id));
      });

      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'manga', manga.id));
      
      // ✅ SURGICAL UPDATE: Wipe cache and force refresh
      sessionStorage.removeItem(`admin_manga_cache_${currentUser.uid}`);
      fetchMangaList(false, true);
      alert(`"${manga.title}" has been deleted.`);
    } catch (e) { fetchMangaList(false, true); }
  };

  const addChapterForm = () => {
    const nextNum = chapters.length > 0 ? Number(chapters[chapters.length - 1].number) + 1 : 1;
    setChapters([...chapters, { id: Date.now(), number: nextNum, title: '', chapterFile: null, existingFileUrl: null, isNew: true }]);
  };

  const removeChapterForm = (index) => {
    const chToRemove = chapters[index];
    if (!chToRemove.isNew && chToRemove.id) setDeletedChapters(prev => [...prev, chToRemove]);
    const newChaps = [...chapters]; newChaps.splice(index, 1); setChapters(newChaps); 
  };

  const updateChapterState = (index, field, value) => { const newChaps = [...chapters]; newChaps[index][field] = value; setChapters(newChaps); };

  const handleChapterFileUpload = (index, file) => {
      const newChaps = [...chapters];
      newChaps[index].chapterFile = file; 
      setChapters(newChaps);
  };

  const removeChapterFile = (index, isExisting) => {
      const newChaps = [...chapters];
      if (isExisting) newChaps[index].existingFileUrl = null;
      else newChaps[index].chapterFile = null;
      setChapters(newChaps);
  };

  const handleFileChange = (e, setter) => { 
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return alert("Invalid file type. Please upload an image for the cover.");
      setter(file); 
  };
  
  const uploadFile = async (file, path) => {
    if (!file) return null;
    return await uploadToR2(file, path, (p) => { 
        if (path.includes('pages') || path.includes('covers')) setProgress(p); 
    });
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!mangaTitle) return alert("Title is required.");
    if (!isEditMode && !mangaCover) return alert("Cover is required.");
    
    setLoading(true); setStatus('Saving Manga Details...'); setProgress(0);

    try {
      const coverResult = mangaCover ? await uploadFile(mangaCover, 'manga_covers') : null;
      const finalCoverUrl = coverResult?.url || coverResult || existingCoverUrl;
      
      let mangaId = createdMangaId;
      let finalStatus = mangaStatus;
      if (currentUser?.role === 'manga_producer' && !isEditMode) finalStatus = 'Pending';

      const keywords = mangaTitle.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      keywords.push(mangaTitle.toLowerCase());

      const mangaData = {
        title: mangaTitle, 
        keywords: [...new Set(keywords)],
        author: author || 'Unknown', 
        year: releaseYear || 'N/A', 
        synopsis, 
        genres: selectedGenres, 
        coverUrl: finalCoverUrl,
        images: { jpg: { image_url: finalCoverUrl } }, 
        type: 'Manga', 
        status: finalStatus,
        hasReadingRights, // ✅ Write reading rights status to DB
        uploaderId: currentUser.uid,
        updatedAt: serverTimestamp()
      };

      if (isEditMode && mangaId) {
        await updateDoc(doc(db, 'manga', mangaId), mangaData);
      } else {
        const ref = await addDoc(collection(db, 'manga'), { ...mangaData, createdAt: serverTimestamp(), views: 0, likes: 0, dislikes: 0, score: 0 });
        mangaId = ref.id;
        setCreatedMangaId(mangaId);
      }

      if (deletedChapters.length > 0) {
          setStatus('Removing deleted chapters...');
          for (const delCh of deletedChapters) { await deleteDoc(doc(db, 'manga', mangaId, 'chapters', delCh.id)); }
      }

      const totalOps = chapters.length;
      let completedOps = 0;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        setStatus(`Uploading Chapter ${ch.number} file...`);
        let finalFileUrl = ch.existingFileUrl;

        if (ch.chapterFile) {
            const result = await uploadFile(ch.chapterFile, `manga_pages/${mangaId}/ch_${ch.number}`);
            finalFileUrl = result?.url || result; 
        }

        const finalPages = finalFileUrl ? [finalFileUrl] : [];
        const chData = {
          title: ch.title || `Chapter ${ch.number}`, 
          number: Number(ch.number),
          pages: finalPages, 
          updatedAt: serverTimestamp()
        };

        if (ch.isNew) await addDoc(collection(db, 'manga', mangaId, 'chapters'), { ...chData, createdAt: serverTimestamp() });
        else await updateDoc(doc(db, 'manga', mangaId, 'chapters', ch.id), chData);
        
        completedOps++;
        setProgress(Math.round((completedOps / totalOps) * 100));
      }

      setStatus('Success!');
      if (notifyUsers && finalStatus !== 'Pending') {
          await sendAutoNotification(isEditMode ? `New Chapter: ${mangaTitle}` : `New Manga: ${mangaTitle}`, `Read ${mangaTitle} now on AniYu!`, mangaId);
      }

      alert(finalStatus === 'Pending' ? "Submitted for Review! Waiting for Admin approval." : "Published!");
      setView('list'); setLibraryTab(finalStatus);

      // ✅ SURGICAL UPDATE: Wipe cache and force refresh
      sessionStorage.removeItem(`admin_manga_cache_${currentUser.uid}`);
      fetchMangaList(false, true);

    } catch (error) { console.error(error); alert('Error: ' + error.message); } finally { setLoading(false); }
  };

  if (view === 'details' && selectedManga) return (
    <div className="container">
        <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, marginBottom: 20 }}>
            <ArrowLeft size={18} /> Back to Library
        </button>
        <div className="card">
            <div className="card-header blue"><span>{selectedManga.title} - Chapters</span></div>
            <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
                    {selectedMangaChapters.map(ch => (
                        <div key={ch.id} style={{ padding: 15, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                            <div style={{ fontWeight: 700, marginBottom: 5 }}>Chapter {ch.number}</div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{(ch.pages && ch.pages.length > 0) ? "File Uploaded" : "No File"}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );

  if (view === 'list') {
    const filteredMangaList = mangaList.filter(item => {
        const itemStatus = item.status === 'Released' ? 'Ongoing' : (item.status || 'Ongoing');
        return itemStatus === libraryTab;
    });
    
    return (
      <div className="container">
        <div className="card" style={{ marginBottom: 30, background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', border: 'none' }}>
           <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 20px', textAlign: 'center' }}>
              <div style={{ color: 'white', marginBottom: 15 }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>Manga Studio</h1>
                <p style={{ opacity: 0.9, marginTop: 5 }}>Manage your manga library and chapters</p>
              </div>
              <button onClick={handleCreateNew} className="btn-publish" style={{ width: 'auto', padding: '15px 40px', background: 'white', color: '#ec4899', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}><Plus size={24} /> UPLOAD NEW MANGA</button>
           </div>
        </div>

        {/* ✅ SURGICAL UPDATE: ADDED REFRESH BUTTON NEXT TO TABS */}
        <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 20, alignItems: 'center' }}>
            {STATUS_OPTIONS.map(status => (
                <button 
                  key={status} onClick={() => setLibraryTab(status)}
                  style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: libraryTab === status ? (status === 'Pending' ? '#f59e0b' : '#ec4899') : 'transparent', color: libraryTab === status ? 'white' : '#6b7280', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    {status}
                </button>
            ))}

            <button 
                onClick={() => fetchMangaList(false, true)}
                disabled={loadingList}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ec4899', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 'bold' }}
            >
                <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} /> Refresh
            </button>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {filteredMangaList.length === 0 && <div style={{textAlign:'center', color:'#9ca3af', padding:40}}>No manga found.</div>}
          {filteredMangaList.map((manga, index) => (
            <div key={manga.id} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: 20, gap: 20 }}>
                <div style={{ width: 60, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, position:'relative' }}>
                    <img src={manga.images?.jpg?.image_url || manga.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', fontWeight: 700 }}>{manga.title}</h3>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={14} /> {manga.views || 0}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                   {libraryTab === 'Pending' && currentUser?.role !== 'manga_producer' && (
                       <>
                           <button onClick={() => handleApprove(manga)} style={{ padding: '8px 12px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 'bold', border: '1px solid #bbf7d0', cursor:'pointer' }}>Approve</button>
                           <button onClick={() => handleReject(manga)} style={{ padding: '8px 12px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca', cursor:'pointer' }}>Reject</button>
                       </>
                   )}
                   <button onClick={() => handleViewDetails(manga)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 600 }}>View</button>
                   <button onClick={() => handleEdit(manga)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                   <button onClick={() => handleDelete(manga)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Load More Button */}
        {!loadingList && hasMore && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
                <button 
                    onClick={() => fetchMangaList(true)} 
                    disabled={loadingMore}
                    style={{
                        padding: '10px 20px', background: '#f3f4f6', border: '1px solid #e5e7eb',
                        borderRadius: '8px', color: '#4b5563', fontWeight: 'bold', cursor: 'pointer'
                    }}
                >
                    {loadingMore ? <Loader2 className="animate-spin" size={16}/> : "Load More"}
                </button>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, marginBottom: 20 }}>
        <ArrowLeft size={18} /> Back to List
      </button>

      <div className="page-header">
        <div className="page-title"><h1>{isEditMode ? "Manage Manga" : "New Manga Upload"}</h1></div>
        {!loading && (
           <div style={{display:'flex', gap: 15, alignItems:'center'}}>
               <div onClick={() => setNotifyUsers(!notifyUsers)} style={{display:'flex', alignItems:'center', gap: 8, cursor:'pointer', background:'white', padding:'10px 15px', borderRadius:10, border: notifyUsers ? '1px solid #db2777' : '1px solid #e5e7eb'}}>
                   <Bell size={18} className={notifyUsers ? "text-pink-600 fill-current" : "text-gray-400"} />
                   <span style={{fontWeight:700, fontSize:'0.9rem', color: notifyUsers ? '#db2777' : '#6b7280'}}>Notify Users</span>
               </div>
               <button onClick={handlePublish} className="btn-publish" style={{ width: 'auto', padding: '12px 30px', fontSize: '1rem', background: '#db2777' }}>
                   {currentUser?.role === 'manga_producer' ? "Submit for Review" : "Save All Changes"}
               </button>
           </div>
        )}
      </div>

      <form onSubmit={handlePublish}>
        <div className="card">
          <div className="card-header blue" style={{justifyContent:'space-between', background:'#fce7f3', color:'#831843'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}><BookOpen size={24} /> <span>Header: Manga Details</span></div>
              
              {/* ✅ READING RIGHTS TOGGLE & STATUS */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                  <div 
                    onClick={() => setHasReadingRights(!hasReadingRights)}
                    style={{
                        display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                        background: hasReadingRights ? '#dcfce7' : '#fee2e2',
                        padding:'6px 12px', borderRadius:20, border: hasReadingRights ? '1px solid #bbf7d0' : '1px solid #fecaca'
                    }}
                  >
                      {hasReadingRights ? <Unlock size={16} color="#166534"/> : <Lock size={16} color="#991b1b"/>}
                      <span style={{fontWeight:700, fontSize:'0.85rem', color: hasReadingRights ? '#166534' : '#991b1b'}}>
                          {hasReadingRights ? "Reading Active" : "No License (Hidden)"}
                      </span>
                  </div>

                  {currentUser?.role !== 'manga_producer' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background:'white', padding:'5px 15px', borderRadius:12, border:'1px solid #fbcfe8' }}>
                          <select value={mangaStatus} onChange={(e) => setMangaStatus(e.target.value)} style={{border:'none', fontWeight:700, outline:'none', fontSize:'0.95rem', color:'#db2777'}}>
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                  ) : (
                      <div style={{ background: '#fffbeb', color: '#d97706', padding: '5px 15px', borderRadius: 12, fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #fcd34d' }}>
                          {mangaStatus === 'Pending' ? "Waiting for Approval" : mangaStatus}
                      </div>
                  )}
              </div>
          </div>
          <div className="card-body">
            <div className="grid-12">
              <div>
                <span className="form-label">Cover</span>
                <input type="file" accept="image/*" className="hidden" id="mangaCover" onChange={(e) => handleFileChange(e, setMangaCover)} />
                <label htmlFor="mangaCover" className={`upload-zone ${mangaCover ? 'active' : ''}`}>
                  {mangaCover ? <img src={URL.createObjectURL(mangaCover)} /> : existingCoverUrl ? <img src={existingCoverUrl} /> : <div style={{textAlign:'center', color:'#9ca3af'}}><ImageIcon size={30}/> Upload</div>}
                </label>
              </div>
              <div>
                <div className="grid-3" style={{marginBottom:0, display:'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 20}}>
                    <div className="form-group"><span className="form-label">Title</span><input type="text" className="input-field" value={mangaTitle} onChange={e => setMangaTitle(e.target.value)} /></div>
                    <div className="form-group"><span className="form-label">Author</span><input type="text" className="input-field" value={author} onChange={e => setAuthor(e.target.value)} /></div>
                    <div className="form-group"><span className="form-label">Year</span><input type="number" className="input-field" placeholder="2024" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} /></div>
                </div>
                <div className="form-group"><span className="form-label">Synopsis</span><textarea className="textarea-field" value={synopsis} onChange={e => setSynopsis(e.target.value)}></textarea></div>
                <div className="form-group"><span className="form-label">Genres</span><div className="chips-container">{GENRES_LIST.map(g => <div key={g} className={`chip ${selectedGenres.includes(g) ? 'selected' : ''}`} onClick={() => { if(selectedGenres.includes(g)) setSelectedGenres(prev=>prev.filter(x=>x!==g)); else if(selectedGenres.length<3) setSelectedGenres([...selectedGenres, g]); }}>{g}</div>)}</div></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 10 }}><Layers color="#db2777" /> Chapters ({chapters.length})</h2>
          {chapters.map((ch, index) => (
            <div key={ch.id} className="card" style={{ border: '2px solid #f3f4f6' }}>
              <div className="card-header" style={{ padding: '15px 20px', background: '#fdf2f8', display: 'flex', justifyContent: 'space-between', color:'#831843' }}>
                <span style={{ fontSize: '1rem', fontWeight:700 }}>Chapter {ch.number} Form</span>
                {chapters.length > 1 && <button type="button" onClick={() => removeChapterForm(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>}
              </div>
              <div className="card-body" style={{ padding: 20 }}>
                <div className="grid-2">
                   <div>
                      <div className="form-group">
                         <span className="form-label">File Upload (CBZ, PDF, ZIP)</span>
                         <input type="file" className="hidden" id={`pages-${ch.id}`} onChange={(e) => handleChapterFileUpload(index, e.target.files[0])} />
                         <label htmlFor={`pages-${ch.id}`} className="upload-zone" style={{ minHeight: 120 }}>
                            <div style={{textAlign:'center', color:'#db2777'}}><FileImage size={30}/> {ch.chapterFile ? "Replace File" : "Upload Chapter File"}</div>
                         </label>
                      </div>
                      <div style={{display:'flex', gap:10}}>
                         <div style={{width:80}}><span className="form-label">No.</span><input type="number" className="input-field" value={ch.number} onChange={(e) => updateChapterState(index, 'number', e.target.value)} /></div>
                         <div style={{flex:1}}><span className="form-label">Title</span><input type="text" className="input-field" value={ch.title} onChange={(e) => updateChapterState(index, 'title', e.target.value)} /></div>
                      </div>
                   </div>
                   
                   <div style={{ background: '#f8fafc', padding: 10, borderRadius: 10, maxHeight: 300, overflowY: 'auto' }}>
                       <span className="form-label">File Preview</span>
                       <div style={{ display: 'flex', flexDirection:'column', gap: 10 }}>
                           {ch.existingFileUrl && (
                               <div style={{position:'relative', width: '100%', height: 100, background:'#e5e7eb', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:5, padding:5, border:'1px solid #d1d5db'}}>
                                   <FileIcon size={32} className="text-gray-500" />
                                   <span style={{fontSize:11, textAlign:'center', marginTop: 5, color:'#4b5563', fontWeight:600}}>Existing Chapter File</span>
                                   <div onClick={() => removeChapterFile(index, true)} style={{position:'absolute', top:5, right:5, background:'#ef4444', color:'white', borderRadius:'50%', width:20, height:20, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 5px rgba(0,0,0,0.2)'}}>x</div>
                               </div>
                           )}
                           {ch.chapterFile && (
                               <div style={{position:'relative', width: '100%', height: 100, background:'#fce7f3', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:5, padding:5, border:'1px solid #fbcfe8'}}>
                                   <FileIcon size={32} className="text-pink-600" />
                                   <span style={{fontSize:11, wordBreak:'break-all', textAlign:'center', marginTop: 5, color:'#831843', fontWeight:600}}>{ch.chapterFile.name.length > 20 ? ch.chapterFile.name.substring(0, 20) + '...' : ch.chapterFile.name}</span>
                                   <span style={{fontSize:9, color:'#db2777'}}>{(ch.chapterFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                   <div onClick={() => removeChapterFile(index, false)} style={{position:'absolute', top:5, right:5, background:'#ef4444', color:'white', borderRadius:'50%', width:20, height:20, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 5px rgba(0,0,0,0.2)'}}>x</div>
                               </div>
                           )}
                           {!ch.existingFileUrl && !ch.chapterFile && (
                               <div style={{color:'#9ca3af', fontStyle:'italic', fontSize:'0.85rem', textAlign:'center', padding:20}}>No file selected.</div>
                           )}
                       </div>
                   </div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addChapterForm} className="btn-publish" style={{ background: '#f3f4f6', color: '#4b5563', border: '2px dashed #d1d5db', boxShadow: 'none' }}><Plus size={24} /> ADD CHAPTER</button>
        </div>

        {loading && (
            <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 600, background: 'white', padding: 20, borderRadius: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', zIndex: 100 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}><Loader2 className="animate-spin" color="#db2777" /><div><div style={{ fontWeight: 800, color: '#1f2937' }}>{status}</div></div></div>
                <div style={{ fontWeight: 900, color: '#db2777', fontSize: '1.2rem' }}>{progress}%</div>
              </div>
              <div style={{ width: '100%', height: 8, background: '#fce7f3', borderRadius: 10, overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: '#db2777', transition: 'width 0.3s ease' }}></div></div>
            </div>
        )}
      </form>
    </div>
  );
}