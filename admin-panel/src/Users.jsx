import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { addDoc, arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, startAfter, updateDoc, where } from 'firebase/firestore';
import {
    ArrowLeft, Ban, CheckCircle, Clock, Copy, Download, ExternalLink, History as HistoryIcon, Loader2, Mail, Plus, Save, Search, Shield, ShieldAlert, Smartphone, Trash2, User, Users as UsersIcon, X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth, db, firebaseConfig } from './firebase';

// --- HELPER: SMART TIME FORMATTING ---
const formatLastActive = (timestamp) => {
    if (!timestamp) return <span style={{color: '#9ca3af', fontStyle: 'italic'}}>Never</span>;
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 300) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: '#dcfce7', color: '#15803d' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span> Active Now
            </span>
        );
    }

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Users() {
  const location = useLocation(); 
  const [view, setView] = useState('list'); 
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter States
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  // ✅ SURGICAL UPDATE: Added new filter states
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterVersion, setFilterVersion] = useState('all');

  const [myRole, setMyRole] = useState(null);

  // Pagination states
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', username: '', role: 'user' });

  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', bio: '', rank: 'GENIN', role: 'user', isBanned: false });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  
  const [historyList, setHistoryList] = useState([]);
  const [downloadsList, setDownloadsList] = useState([]);

  const [loadingSocials, setLoadingSocials] = useState(false);
  const [socialTab, setSocialTab] = useState('device'); 

  // ✅ AUTO-OPEN USER FROM NAVIGATION STATE
  useEffect(() => {
      const targetId = location.state?.targetUserId;
      if (targetId) {
          window.history.replaceState({}, document.title);
          fetchAndOpenUser(targetId);
      }
  }, [location]);

  const fetchAndOpenUser = async (uid) => {
      try {
          const docRef = doc(db, "users", uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              handleViewUser({ id: docSnap.id, ...docSnap.data() });
          } else {
              alert("User not found or deleted.");
          }
      } catch (e) { console.error("Error opening user:", e); }
  };

  const fetchUsers = async (isLoadMore = false) => {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
          let q = query(collection(db, "users"), limit(50));
          if (isLoadMore && lastVisible) {
              q = query(collection(db, "users"), startAfter(lastVisible), limit(50));
          }

          const snapshot = await getDocs(q);
          const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          if (snapshot.docs.length > 0) setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          if (snapshot.docs.length < 50) setHasMore(false);
          else setHasMore(true);

          setUsers(prev => {
              const combined = isLoadMore ? [...prev, ...usersData] : usersData;
              combined.sort((a, b) => {
                  const timeA = a.lastActiveAt?.toDate ? a.lastActiveAt.toDate() : new Date(0);
                  const timeB = b.lastActiveAt?.toDate ? b.lastActiveAt.toDate() : new Date(0);
                  return timeB - timeA; 
              });
              return combined;
          });
      } catch (error) {
          console.error("Error fetching users:", error);
      } finally {
          setLoading(false);
          setLoadingMore(false);
      }
  };

  useEffect(() => {
    const fetchMyRole = async () => {
        if (auth.currentUser) {
            try {
                const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (snap.exists()) setMyRole(snap.data().role);
            } catch (e) { console.error("Error fetching my role", e); }
        }
    };
    fetchMyRole();
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
      e.preventDefault();
      if(!newUser.email || !newUser.password || !newUser.username) return alert("Please fill all fields");
      
      if ((newUser.role === 'admin' || newUser.role === 'super_admin') && myRole !== 'super_admin') {
          return alert("⛔ ACCESS DENIED: Only the Super Admin (Owner) can create other Staff/Admins.");
      }

      setCreating(true);
      let secondaryApp = null; 

      try {
          secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
          const secondaryAuth = getAuth(secondaryApp);

          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
          const uid = userCredential.user.uid;

          await setDoc(doc(db, "users", uid), {
              username: newUser.username,
              email: newUser.email,
              role: newUser.role, 
              rank: 'GENIN',
              createdAt: serverTimestamp(),
              lastActiveAt: serverTimestamp(),
              isBanned: false,
              searchKeywords: [newUser.username.toLowerCase(), newUser.email.toLowerCase()]
          });

          await signOut(secondaryAuth);
          
          alert(`Success! Created ${newUser.role} account for "${newUser.username}".`);
          setShowCreateModal(false);
          setNewUser({ email: '', password: '', username: '', role: 'user' });
          fetchUsers(); // Refresh

      } catch (error) {
          alert("Error creating user: " + error.message);
      } finally {
          setCreating(false);
      }
  };
  
  const handleViewUser = async (user) => {
      setSelectedUser(user);
      setEditForm({
          username: user.username || '',
          bio: user.bio || '',
          rank: user.rank || 'GENIN',
          role: user.role || 'user',
          isBanned: user.isBanned || false
      });
      setView('details');
      
      setLoadingSocials(true);
      setFollowersList([]);
      setFollowingList([]);
      setHistoryList([]);
      setDownloadsList([]);
      setSocialTab('device'); 
      
      try {
          if (user.followers && user.followers.length > 0) {
              const idsToFetch = user.followers.slice(0, 50);
              const promises = idsToFetch.map(uid => getDoc(doc(db, "users", uid)));
              const snaps = await Promise.all(promises);
              setFollowersList(snaps.map(s => s.exists() ? { id: s.id, ...s.data() } : { id: s.id, username: 'Unknown User' }));
          }

          if (user.following && user.following.length > 0) {
              const idsToFetch = user.following.slice(0, 50);
              const promises = idsToFetch.map(uid => getDoc(doc(db, "users", uid)));
              const snaps = await Promise.all(promises);
              setFollowingList(snaps.map(s => s.exists() ? { id: s.id, ...s.data() } : { id: s.id, username: 'Unknown User' }));
          }

      } catch (e) {
          console.error("Error loading socials:", e);
      } finally {
          setLoadingSocials(false);
      }
  };

  useEffect(() => {
      if (!selectedUser) return;
      const fetchExtraData = async () => {
          try {
              if (socialTab === 'history' && historyList.length === 0) {
                  setLoadingSocials(true);
                  const q = query(collection(db, "users", selectedUser.id, "history"), limit(50));
                  const snap = await getDocs(q);
                  setHistoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                  setLoadingSocials(false);
              }
              if (socialTab === 'downloads' && downloadsList.length === 0) {
                  setLoadingSocials(true);
                  const q = query(collection(db, "users", selectedUser.id, "downloads"), limit(50));
                  const snap = await getDocs(q);
                  setDownloadsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                  setLoadingSocials(false);
              }
          } catch (e) {
              console.error("Error fetching extra data:", e);
              setLoadingSocials(false);
          }
      };
      fetchExtraData();
  }, [socialTab, selectedUser]);

  const handleSaveChanges = async (e) => {
      e.preventDefault();
      if(!selectedUser) return;

      if (selectedUser.role === 'super_admin' && myRole !== 'super_admin') {
          return alert("⛔ ACCESS DENIED: You cannot edit the Super Admin account.");
      }

      setSaving(true);

      try {
          const userRef = doc(db, "users", selectedUser.id);
          
          const updates = {
              username: editForm.username,
              bio: editForm.bio,
              rank: editForm.rank,
              role: editForm.role,
              isBanned: editForm.isBanned
          };

          if (editForm.isBanned && !selectedUser.isBanned) {
              if (selectedUser.role === 'super_admin') throw new Error("You cannot ban the Owner.");

              const currentCount = selectedUser.banCount || 0;
              const newCount = currentCount + 1;
              
              let durationHours = newCount >= 4 ? 168 : 24;
              let durationText = newCount >= 4 ? "7 Days" : "24 Hours";

              const banExpiresAt = new Date();
              banExpiresAt.setHours(banExpiresAt.getHours() + durationHours);

              updates.banCount = newCount;
              updates.banExpiresAt = banExpiresAt;

              await addDoc(collection(db, "users", selectedUser.id, "notifications"), {
                  title: "Account Suspended ⛔",
                  body: `Your account has been suspended for ${durationText}. Access will be restored on ${banExpiresAt.toLocaleString()}.`,
                  read: false,
                  createdAt: serverTimestamp(),
                  type: 'system'
              });

              alert(`⛔ Banning User (Strike #${newCount})\nDuration: ${durationText}\nExpires: ${banExpiresAt.toLocaleString()}`);
          } 
          else if (!editForm.isBanned && selectedUser.isBanned) {
              updates.banExpiresAt = null;
              await addDoc(collection(db, "users", selectedUser.id, "notifications"), {
                  title: "Account Restored ✅",
                  body: "Your account suspension has been lifted. Welcome back!",
                  read: false,
                  createdAt: serverTimestamp(),
                  type: 'system'
              });
          }

          await updateDoc(userRef, updates);

          const updatedUser = { ...selectedUser, ...updates };
          setSelectedUser(updatedUser);
          setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          
          alert("User profile updated successfully!");
      } catch (error) {
          alert("Error updating user: " + error.message);
      } finally {
          setSaving(false);
      }
  };

  const handleDeleteUser = async () => {
    if (selectedUser.role === 'super_admin') {
        return alert("⛔ ACCESS DENIED: The Super Admin cannot be deleted.");
    }

    if (selectedUser.role === 'admin' && myRole !== 'super_admin') {
        return alert("⛔ ACCESS DENIED: You cannot delete another Administrator.");
    }

    const confirmMsg = `⚠️ DANGER ZONE ⚠️\n\nThis will PERMANENTLY DELETE user "${selectedUser.username}".\n\nAre you sure you want to proceed?`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    const targetUid = selectedUser.id;

    try {
        if (selectedUser.followers && selectedUser.followers.length > 0) {
            const updates = selectedUser.followers.map(followerId => 
                updateDoc(doc(db, "users", followerId), { following: arrayRemove(targetUid) }).catch(e => {})
            );
            await Promise.all(updates);
        }

        if (selectedUser.following && selectedUser.following.length > 0) {
            const updates = selectedUser.following.map(followingId => 
                updateDoc(doc(db, "users", followingId), { followers: arrayRemove(targetUid) }).catch(e => {})
            );
            await Promise.all(updates);
        }

        const postsQuery = query(collection(db, 'posts'), where('userId', '==', targetUid));
        const postsSnap = await getDocs(postsQuery);
        const postDeletes = postsSnap.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(postDeletes);

        await deleteDoc(doc(db, "users", targetUid));

        alert(`User "${selectedUser.username}" has been deleted.`);
        setUsers(prev => prev.filter(u => u.id !== targetUid));
        setView('list');

    } catch (error) {
        console.error(error);
        alert("Error deleting user: " + error.message);
    } finally {
        setDeleting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("UID Copied!");
  };

  // ✅ SURGICAL UPDATE: Added App Version and Location filtering logic
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'banned' && user.isBanned) || 
                          (filterStatus === 'active' && !user.isBanned);

    const matchesLocation = filterLocation === 'all' || user.deviceInfo?.location === filterLocation;
    
    const matchesVersion = filterVersion === 'all' || user.deviceInfo?.appVersion === filterVersion;

    return matchesSearch && matchesRole && matchesStatus && matchesLocation && matchesVersion;
  });

  // ✅ SURGICAL UPDATE: Dynamically extract unique locations and versions for the dropdown menus
  const uniqueLocations = [...new Set(users.map(u => u.deviceInfo?.location).filter(Boolean))].sort();
  const uniqueVersions = [...new Set(users.map(u => u.deviceInfo?.appVersion).filter(Boolean))].sort();

  return (
    <>
    <style>{`
        .users-page { padding: 24px; }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 15px; }
        .header-title { font-size: 1.5rem; font-weight: bold; display: flex; align-items: center; gap: 8px; margin: 0; }
        .controls-container { display: flex; gap: 10px; flex-wrap: wrap; }
        .search-box { position: relative; }
        .search-icon { position: absolute; left: 12px; top: 10px; color: #9ca3af; }
        .search-input { padding: 8px 8px 8px 36px; border: 1px solid #e5e7eb; border-radius: 8px; width: 250px; outline: none; }
        .search-input:focus { border-color: #2563eb; ring: 2px solid #2563eb; }
        .filter-select { padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; background: white; color: #4b5563; font-weight: 500; cursor: pointer; }
        
        .btn-create { background-color: #2563eb; color: white; padding: 8px 16px; border-radius: 8px; font-weight: bold; display: flex; align-items: center; gap: 8px; border: none; cursor: pointer; transition: background-color 0.2s; }
        .btn-create:hover { background-color: #1d4ed8; }

        /* Modal */
        .modal-overlay { position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .modal-content { background-color: white; padding: 30px; border-radius: 16px; width: 100%; max-width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-title { margin: 0; font-size: 1.2rem; font-weight: 800; }
        .form-group { margin-bottom: 15px; }
        .form-label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 5px; }
        .form-input { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; }
        .btn-submit { width: 100%; padding: 10px; background-color: #2563eb; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        .btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Table */
        .table-container { background-color: white; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; overflow-x: auto; }
        .users-table { width: 100%; text-align: left; border-collapse: collapse; white-space: nowrap; }
        .users-table th { padding: 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563; }
        .users-table td { padding: 16px; border-bottom: 1px solid #f3f4f6; }
        .users-table tr:hover { background-color: #f9fafb; transition: background-color 0.2s; }
        
        .user-profile-cell { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .avatar-circle { width: 40px; height: 40px; border-radius: 50%; background-color: #eff6ff; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: bold; color: #2563eb; overflow: hidden; flex-shrink: 0; }
        .avatar-img { width: 100%; height: 100%; object-fit: cover; }
        .user-name { font-weight: 600; color: #1f2937; font-size: 0.875rem; margin: 0; }
        .user-name:hover { color: #2563eb; }
        .user-email { font-size: 0.75rem; color: #6b7280; margin: 0; }
        
        .uid-badge { font-family: monospace; font-size: 0.75rem; color: #6b7280; background-color: #f3f4f6; padding: 2px 8px; border-radius: 4px; border: 1px solid #e5e7eb; cursor: pointer; }
        .role-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
        .role-super-admin { background-color: #f3e8ff; color: #7e22ce; }
        .role-admin { background-color: #dbeafe; color: #1d4ed8; }
        .role-producer { background-color: #ffedd5; color: #c2410c; }
        .role-user { background-color: #f3f4f6; color: #374151; }
        
        .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
        .status-banned { background-color: #fee2e2; color: #991b1b; }
        .status-active { background-color: #dcfce7; color: #166534; }
        
        .btn-details { padding: 8px; color: #2563eb; background: none; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.875rem; display: flex; align-items: center; gap: 4px; }
        .btn-details:hover { background-color: #eff6ff; }

        /* Details View */
        .details-container { max-width: 1200px; margin: 0 auto; }
        .btn-back { display: flex; align-items: center; gap: 5px; border: none; background: none; cursor: pointer; color: #6b7280; font-weight: 600; margin-bottom: 20px; }
        .details-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .details-header { padding: 30px; background-color: #eff6ff; display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #bfdbfe; }
        .header-avatar { width: 80px; height: 80px; border-radius: 50%; background-color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; color: #2563eb; border: 2px solid #bfdbfe; overflow: hidden; flex-shrink: 0; }
        .header-info { flex: 1; }
        .header-username { margin: 0; font-size: 1.8rem; font-weight: 800; color: #1e3a8a; }
        .header-meta { display: flex; align-items: center; gap: 15px; margin-top: 5px; color: #6b7280; font-size: 0.9rem; flex-wrap: wrap; }
        .btn-delete { background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 8px; transition: all 0.2s; white-space: nowrap; }
        
        .details-body { padding: 30px; }
        .grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .section-title { font-size: 1.2rem; font-weight: 800; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: #374151; }
        .status-toggle { display: flex; gap: 10px; flex-wrap: wrap; }
        .toggle-btn { flex: 1; text-align: center; padding: 10px; border: 1px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; }
        .toggle-btn.active-selected { background-color: #10b981; color: white; border-color: #10b981; }
        .toggle-btn.ban-selected { background-color: #ef4444; color: white; border-color: #ef4444; }
        
        .stats-box { background-color: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px; }
        .stat-row { display: flex; justify-content: space-between; align-items: center; }
        .stat-label { font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; }
        .stat-value { font-weight: 600; color: #374151; font-size: 0.9rem; text-align: right; }
        
        .socials-card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        .socials-tabs { display: flex; border-bottom: 1px solid #e5e7eb; overflow-x: auto; scrollbar-width: none; }
        .socials-tabs::-webkit-scrollbar { display: none; }
        .tab-btn { flex: 1; padding: 15px; background: #f9fafb; border: none; font-weight: 700; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; min-width: 90px; }
        .tab-btn.active { background: white; color: #2563eb; border-bottom-color: #2563eb; }
        
        .socials-list { padding: 0; max-height: 300px; overflow-y: auto; }
        .social-item { display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-bottom: 1px solid #f3f4f6; }
        .mini-avatar { width: 30px; height: 30px; border-radius: 50%; background-color: #eff6ff; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; color: #2563eb; overflow: hidden; flex-shrink: 0; }
        .social-username { font-size: 0.9rem; font-weight: 600; color: #374151; margin-bottom: 2px; }
        .social-rank { font-size: 0.7rem; color: #9ca3af; }

        @media (max-width: 768px) {
            .users-page { padding: 16px; }
            .grid-layout { grid-template-columns: 1fr; gap: 20px; }
            .details-header { flex-direction: column; text-align: center; padding: 20px; }
            .header-meta { justify-content: center; }
            .details-body { padding: 20px; }
            .btn-delete { width: 100%; justify-content: center; margin-top: 15px; }
            .search-input { width: 100%; }
            .controls-container { width: 100%; }
            .search-box { width: 100%; }
        }
    `}</style>

    <div className="users-page">
      {/* HEADER */}
      {view === 'list' && (
        <div className="page-header">
            <h1 className="header-title">
                <Shield size={28} style={{ color: '#2563eb' }} /> 
                User Management
            </h1>
            <div className="controls-container">
                <div className="search-box">
                    <Search className="search-icon" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search users..." 
                        className="search-input"
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                {/* Role Filter */}
                <select 
                    className="filter-select" 
                    value={filterRole} 
                    onChange={e => setFilterRole(e.target.value)}
                >
                    <option value="all">All Roles</option>
                    <option value="user">User</option>
                    <option value="anime_producer">Anime Producer</option>
                    <option value="manga_producer">Manga Producer</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                </select>

                {/* Status Filter */}
                <select 
                    className="filter-select" 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="banned">Banned</option>
                </select>

                {/* ✅ SURGICAL UPDATE: Added Location Filter dynamically extracted */}
                <select 
                    className="filter-select" 
                    value={filterLocation} 
                    onChange={e => setFilterLocation(e.target.value)}
                >
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>

                {/* ✅ SURGICAL UPDATE: Added App Version Filter dynamically extracted */}
                <select 
                    className="filter-select" 
                    value={filterVersion} 
                    onChange={e => setFilterVersion(e.target.value)}
                >
                    <option value="all">All Versions</option>
                    {uniqueVersions.map(ver => <option key={ver} value={ver}>v{ver}</option>)}
                </select>

                <button 
                    onClick={() => setShowCreateModal(true)} 
                    className="btn-create"
                >
                    <Plus size={20}/> Create Staff
                </button>
            </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
          <div className="modal-overlay">
              <div className="modal-content">
                  <div className="modal-header">
                      <h2 className="modal-title">Create New Account</h2>
                      <button onClick={() => setShowCreateModal(false)} style={{background:'none', border:'none', cursor:'pointer'}}><X/></button>
                  </div>
                  <form onSubmit={handleCreateUser}>
                      <div className="form-group">
                          <span className="form-label">Email</span>
                          <input type="email" required className="form-input" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                      </div>
                      <div className="form-group">
                          <span className="form-label">Password</span>
                          <input type="password" required className="form-input" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                      </div>
                      <div className="form-group">
                          <span className="form-label">Username</span>
                          <input type="text" required className="form-input" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                      </div>
                      <div className="form-group">
                          <span className="form-label">Account Role</span>
                          <select className="form-input" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                              <option value="user">Regular User</option>
                              <option value="anime_producer">Anime Producer (Upload Only)</option>
                              <option value="manga_producer">Manga Producer (Upload Only)</option>
                              {myRole === 'super_admin' && <option value="admin">Admin (Moderator)</option>}
                          </select>
                      </div>
                      <button type="submit" disabled={creating} className="btn-submit">
                          {creating ? <Loader2 className="animate-spin" style={{margin: '0 auto'}}/> : "Create Account"}
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* TABLE VIEW */}
      {view === 'list' && (
      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>User Profile</th>
              <th>UID</th>
              <th>Role</th>
              <th>Device</th>
              <th>App Version</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>Loading users...</td></tr>
            ) : filteredUsers.length === 0 ? (
               <tr><td colSpan="10" style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>No users found.</td></tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="user-profile-cell" onClick={() => handleViewUser(user)}>
                      <div className="avatar-circle">
                        {user.avatar ? <img src={user.avatar} className="avatar-img"/> : (user.username ? user.username[0].toUpperCase() : "U")}
                      </div>
                      <div>
                        <p className="user-name">{user.username || "Unknown"}</p>
                        <p className="user-email">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="uid-badge" onClick={() => copyToClipboard(user.id)} title="Copy">
                        {user.id.substring(0, 8)}...
                    </span>
                  </td>
                  <td>
                      <span className={`role-badge ${
                          user.role === 'super_admin' ? 'role-super-admin' :
                          user.role === 'admin' ? 'role-admin' :
                          user.role?.includes('producer') ? 'role-producer' :
                          'role-user'
                      }`}>
                          {user.role === 'super_admin' && <ShieldAlert size={12} style={{marginRight:4, display:'inline'}}/>}
                          {user.role || 'user'}
                      </span>
                  </td>
                  
                  <td>
                      <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>
                          {user.deviceInfo?.deviceName || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>N/A</span>}
                      </span>
                  </td>
                  <td>
                      <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>
                          {user.deviceInfo?.appVersion ? `v${user.deviceInfo.appVersion}` : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>N/A</span>}
                      </span>
                  </td>
                  <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#4b5563', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                          {user.deviceInfo?.ipAddress || 'N/A'}
                      </span>
                  </td>
                  <td>
                      <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 500 }}>
                          {user.deviceInfo?.location || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>N/A</span>}
                      </span>
                  </td>

                  <td style={{ fontSize: '0.875rem', fontWeight: 500, color: '#4b5563' }}>
                      {formatLastActive(user.lastActiveAt)}
                  </td>
                  
                  <td>
                    {user.isBanned ? (
                      <span className="status-badge status-banned">Banned</span>
                    ) : (
                      <span className="status-badge status-active">Active</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => handleViewUser(user)} className="btn-details">
                      <UsersIcon size={16}/> Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Load More Button */}
        {!loading && hasMore && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
                <button 
                    onClick={() => fetchUsers(true)} 
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
      )}

      {/* DETAILS VIEW */}
      {view === 'details' && selectedUser && (
        <div className="details-container">
            <button onClick={() => setView('list')} className="btn-back">
                <ArrowLeft size={18} /> Back to Users
            </button>

            <div className="details-card">
                <div className="details-header">
                    <div className="header-avatar">
                        {selectedUser.avatar ? <img src={selectedUser.avatar} className="avatar-img" /> : (selectedUser.username ? selectedUser.username[0].toUpperCase() : <User size={40} />)}
                    </div>
                    <div className="header-info">
                        <h1 className="header-username">{selectedUser.username}</h1>
                        <div className="header-meta">
                            <span style={{ display:'flex', alignItems:'center', gap: 5 }}><Mail size={14}/> {selectedUser.email}</span>
                            <span style={{ display:'flex', alignItems:'center', gap: 5, cursor:'pointer' }} onClick={() => copyToClipboard(selectedUser.id)} title="Copy UID"><Copy size={14}/> {selectedUser.id}</span>
                        </div>
                    </div>
                    
                    {selectedUser.role !== 'super_admin' && (
                        <button 
                            onClick={handleDeleteUser}
                            disabled={deleting}
                            className="btn-delete"
                        >
                            {deleting ? <Loader2 className="animate-spin" size={20}/> : <Trash2 size={20} />}
                            {deleting ? "Deleting..." : "Delete User"}
                        </button>
                    )}
                </div>

                <div className="details-body">
                    <form onSubmit={handleSaveChanges}>
                        <div className="grid-layout">
                            {/* Left Column: Form */}
                            <div>
                                <h3 className="section-title">
                                    <Shield size={20} className="text-blue-600"/> Edit Profile
                                </h3>
                                
                                <div className="form-group">
                                    <span className="form-label">Username</span>
                                    <input type="text" className="form-input" value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} />
                                </div>

                                <div className="form-group">
                                    <span className="form-label">User Bio</span>
                                    <textarea 
                                        className="form-input" 
                                        rows="3" 
                                        style={{ resize: 'vertical' }}
                                        value={editForm.bio} 
                                        onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                                        placeholder="No bio provided..."
                                    ></textarea>
                                </div>

                                <div className="form-group">
                                    <span className="form-label">Rank</span>
                                    <select className="form-input" value={editForm.rank} onChange={(e) => setEditForm({...editForm, rank: e.target.value})}>
                                        {["GENIN", "CHUNIN", "JONIN", "ANBU", "KAGE"].map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <span className="form-label">Role</span>
                                    <select 
                                        className="form-input" 
                                        value={editForm.role} 
                                        onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                                        disabled={selectedUser.role === 'super_admin' && myRole !== 'super_admin'}
                                    >
                                        <option value="user">User</option>
                                        <option value="anime_producer">Anime Producer</option>
                                        <option value="manga_producer">Manga Producer</option>
                                        <option value="admin">Admin (Moderator)</option>
                                        {myRole === 'super_admin' && <option value="super_admin">Super Admin</option>}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <span className="form-label">Account Status</span>
                                    <div className="status-toggle">
                                        <button type="button" onClick={() => setEditForm({...editForm, isBanned: false})} className={`toggle-btn ${!editForm.isBanned ? 'active-selected' : ''}`}>
                                            <CheckCircle size={16}/> Active
                                        </button>
                                        
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                if (selectedUser.role === 'super_admin') return alert("You cannot ban the Owner.");
                                                setEditForm({...editForm, isBanned: true});
                                            }} 
                                            className={`toggle-btn ${editForm.isBanned ? 'ban-selected' : ''}`} 
                                            style={{ opacity: selectedUser.role === 'super_admin' ? 0.5 : 1 }}
                                        >
                                            <Ban size={16}/> Ban User
                                        </button>
                                    </div>

                                    {selectedUser.isBanned && (
                                        <div style={{marginTop: 15, padding: 15, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c'}}>
                                            <div style={{fontWeight: 800, fontSize: '0.9rem', marginBottom: 5}}>⛔ USER IS BANNED</div>
                                            <div style={{fontSize: '0.85rem'}}>
                                                <strong>Strike Count:</strong> {selectedUser.banCount || 1}<br/>
                                                <strong>Expires:</strong> {formatDate(selectedUser.banExpiresAt)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button type="submit" className="btn-submit" disabled={saving}>
                                    {saving ? "Saving..." : <span style={{display:'flex', alignItems:'center', justifyContent:'center', gap:5}}><Save size={20}/> Save Changes</span>}
                                </button>
                            </div>

                            {/* Right Column: Stats & Socials */}
                            <div>
                                <h3 className="section-title">
                                    <Clock size={20} style={{color: '#6b7280'}}/> Activity & Insights
                                </h3>
                                
                                <div className="stats-box">
                                    <div className="stat-row">
                                        <div className="stat-label">Joined</div>
                                        <div className="stat-value">{formatDate(selectedUser.createdAt)}</div>
                                    </div>
                                    <div className="stat-row">
                                        <div className="stat-label">Last Active</div>
                                        <div className="stat-value">{formatLastActive(selectedUser.lastActiveAt)}</div>
                                    </div>
                                </div>

                                <div className="socials-card">
                                    <div className="socials-tabs">
                                        <button type="button" onClick={() => setSocialTab('device')} className={`tab-btn ${socialTab === 'device' ? 'active' : ''}`} title="Device Info"><Smartphone size={18} style={{margin:'0 auto'}}/></button>
                                        <button type="button" onClick={() => setSocialTab('history')} className={`tab-btn ${socialTab === 'history' ? 'active' : ''}`} title="Watch History"><HistoryIcon size={18} style={{margin:'0 auto'}}/></button>
                                        <button type="button" onClick={() => setSocialTab('downloads')} className={`tab-btn ${socialTab === 'downloads' ? 'active' : ''}`} title="Downloads"><Download size={18} style={{margin:'0 auto'}}/></button>
                                        <button type="button" onClick={() => setSocialTab('followers')} className={`tab-btn ${socialTab === 'followers' ? 'active' : ''}`} title="Followers"><UsersIcon size={18} style={{margin:'0 auto'}}/></button>
                                    </div>

                                    <div className="socials-list" style={{ minHeight: 250 }}>
                                        {loadingSocials ? <div style={{ padding: 30, display:'flex', justifyContent:'center', alignItems:'center', color:'#6b7280', gap:10 }}><Loader2 className="animate-spin"/> Fetching data...</div> : (
                                            <>
                                                {/* 1. DEVICE INFO RENDER */}
                                                {socialTab === 'device' && (
                                                    <div style={{ padding: 20 }}>
                                                        {selectedUser.deviceInfo ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                                                                <div className="stat-row" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
                                                                    <span className="stat-label">Device</span>
                                                                    <span className="stat-value" style={{ color: '#1e3a8a' }}>{selectedUser.deviceInfo.deviceName}</span>
                                                                </div>
                                                                <div className="stat-row" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
                                                                    <span className="stat-label">OS Info</span>
                                                                    <span className="stat-value">{selectedUser.deviceInfo.osName} {selectedUser.deviceInfo.osVersion}</span>
                                                                </div>
                                                                <div className="stat-row" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
                                                                    <span className="stat-label">App Build</span>
                                                                    <span className="stat-value">v{selectedUser.deviceInfo.appVersion} (B{selectedUser.deviceInfo.buildVersion})</span>
                                                                </div>
                                                                <div className="stat-row" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 10 }}>
                                                                    <span className="stat-label">IP Address</span>
                                                                    <span className="stat-value" style={{ fontFamily: 'monospace', color: '#dc2626' }}>{selectedUser.deviceInfo.ipAddress}</span>
                                                                </div>
                                                                <div className="stat-row">
                                                                    <span className="stat-label">Location</span>
                                                                    <span className="stat-value">{selectedUser.deviceInfo.location || 'N/A'}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', padding: 20 }}>
                                                                <Smartphone size={32} style={{ opacity: 0.2, margin: '0 auto 10px' }} />
                                                                No device data recorded yet.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 2. HISTORY RENDER */}
                                                {socialTab === 'history' && (
                                                    historyList.length === 0 ? <div style={{padding:40, textAlign:'center', color:'#9ca3af', fontStyle:'italic'}}>No watch/read history.</div> : historyList.map(h => (
                                                        <div key={h.id} className="social-item" style={{ flexDirection: 'column', alignItems: 'flex-start', borderLeft: h.type === 'anime' ? '3px solid #3b82f6' : '3px solid #ec4899' }}>
                                                            <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>{h.title || h.animeTitle || h.mangaTitle || 'Unknown Content'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', gap: 10 }}>
                                                                <span>{h.type === 'anime' ? 'Watched Ep' : 'Read Ch'} {h.lastEpisode || h.lastChapter || h.episodeNumber || h.chapterNumber || '?'}</span>
                                                                <span>•</span>
                                                                <span>{formatDate(h.updatedAt || h.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}

                                                {/* 3. DOWNLOADS RENDER */}
                                                {socialTab === 'downloads' && (
                                                    downloadsList.length === 0 ? <div style={{padding:40, textAlign:'center', color:'#9ca3af', fontStyle:'italic'}}>No downloads found.</div> : downloadsList.map(d => (
                                                        <div key={d.id} className="social-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                                            <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>{d.title || d.animeTitle || d.mangaTitle || 'Unknown File'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Downloaded: {formatDate(d.createdAt)}</div>
                                                        </div>
                                                    ))
                                                )}

                                                {/* 4. FOLLOWERS RENDER */}
                                                {socialTab === 'followers' && (followersList.length === 0 ? <div style={{padding:40, textAlign:'center', color:'#9ca3af', fontStyle:'italic'}}>No followers found.</div> : followersList.map(u => (
                                                    <div key={u.id} className="social-item">
                                                        <div className="mini-avatar">{u.avatar ? <img src={u.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : u.username?.[0].toUpperCase()}</div>
                                                        <div style={{flex:1}}>
                                                            <div className="social-username">{u.username}</div>
                                                            <div className="social-rank">{u.rank || 'GENIN'}</div>
                                                        </div>
                                                        <button type="button" onClick={() => handleViewUser(u)} style={{background:'none', border:'none', cursor:'pointer', color:'#2563eb'}}><ExternalLink size={14}/></button>
                                                    </div>
                                                )))}

                                                {/* 5. FOLLOWING RENDER */}
                                                {socialTab === 'following' && (followingList.length === 0 ? <div style={{padding:40, textAlign:'center', color:'#9ca3af', fontStyle:'italic'}}>Not following anyone.</div> : followingList.map(u => (
                                                    <div key={u.id} className="social-item">
                                                        <div className="mini-avatar">{u.avatar ? <img src={u.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}}/> : u.username?.[0].toUpperCase()}</div>
                                                        <div style={{flex:1}}>
                                                            <div className="social-username">{u.username}</div>
                                                            <div className="social-rank">{u.rank || 'GENIN'}</div>
                                                        </div>
                                                        <button type="button" onClick={() => handleViewUser(u)} style={{background:'none', border:'none', cursor:'pointer', color:'#2563eb'}}><ExternalLink size={14}/></button>
                                                    </div>
                                                )))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
    </>
  );
}