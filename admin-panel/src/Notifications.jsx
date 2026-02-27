import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, startAfter } from 'firebase/firestore';
import {
    Bell,
    CheckCircle,
    CheckSquare,
    History,
    Info,
    Loader2,
    Megaphone,
    RefreshCw, // ✅ IMPORTED REFRESH ICON
    Search,
    Send,
    Square,
    User,
    Users,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from './firebase';

export default function Notifications() {
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'history'
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Form State
  const [targetType, setTargetType] = useState('specific'); // 'specific' | 'multiple' | 'all'
  const [targetUid, setTargetUid] = useState(''); // For 'specific'
  const [selectedUsers, setSelectedUsers] = useState([]); // For 'multiple'
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // User Picker Modal State
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userList, setUserList] = useState([]);
  const [lastVisibleUser, setLastVisibleUser] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // --- FETCH HISTORY ---
  useEffect(() => {
      fetchHistory();
  }, []);

  // ✅ SURGICAL UPDATE: Added Session Caching & Force Refresh
  const fetchHistory = async (forceRefresh = false) => {
      try {
          const CACHE_KEY = 'admin_notifications_history_cache';

          // 1. Return Instant Cache (0 bandwidth, 0 reads)
          if (!forceRefresh) {
              const cachedData = sessionStorage.getItem(CACHE_KEY);
              if (cachedData) {
                  setHistory(JSON.parse(cachedData));
                  return;
              }
          }

          // Limit history to last 20 items
          const q = query(collection(db, "notification_logs"), orderBy('createdAt', 'desc'), limit(20));
          const snap = await getDocs(q);
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          setHistory(data);
          
          // 2. Save new fetch to session cache
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) { console.error(e); }
  };

  // --- PAGINATED USER FETCH ---
  const fetchUsers = async (reset = false) => {
      if (loadingUsers) return;
      setLoadingUsers(true);
      try {
          let q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(20));
          
          if (!reset && lastVisibleUser) {
              q = query(collection(db, "users"), orderBy("createdAt", "desc"), startAfter(lastVisibleUser), limit(20));
          }

          const snap = await getDocs(q);
          const newUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          setUserList(prev => reset ? newUsers : [...prev, ...newUsers]);
          setLastVisibleUser(snap.docs[snap.docs.length - 1]);
      } catch (e) { console.error(e); }
      finally { setLoadingUsers(false); }
  };

  // Open modal and load users
  const openUserPicker = () => {
      setShowUserPicker(true);
      if (userList.length === 0) fetchUsers(true);
  };

  // --- SELECTION LOGIC ---
  const toggleUserSelection = (user) => {
      if (selectedUsers.some(u => u.id === user.id)) {
          setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
      } else {
          setSelectedUsers(prev => [...prev, user]);
      }
  };

  // Client-side search for loaded users (At scale, this should be server-side or Algolia)
  const filteredUsers = userList.filter(u => 
      (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) || 
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  // --- SEND LOGIC ---
  const handleSend = async (e) => {
      e.preventDefault();
      if(!title || !body) return alert("Please fill in title and message.");
      
      setLoading(true);

      try {
          let recipientCount = 0;
          let targetLabel = '';

          // CASE 1: BROADCAST TO ALL (Optimized)
          if (targetType === 'all') {
              // ✅ Write single document to global_announcements
              await addDoc(collection(db, "announcements"), {
                  title,
                  body,
                  type: 'system_broadcast',
                  targetId: 'all',
                  createdAt: serverTimestamp()
              });
              targetLabel = 'All Users (Global Broadcast)';
              recipientCount = 'All'; 
          } 
          
          // CASE 2: SPECIFIC USER (Direct Write)
          else if (targetType === 'specific') {
              if (!targetUid) throw new Error("Please enter a User UID.");
              await addDoc(collection(db, "users", targetUid, "notifications"), {
                  title, body, read: false, createdAt: serverTimestamp(), type: 'system'
              });
              targetLabel = `User: ${targetUid}`;
              recipientCount = 1;
          } 
          
          // CASE 3: SELECTED GROUP (Direct Write Loop - OK for small groups)
          else if (targetType === 'multiple') {
              if (selectedUsers.length === 0) throw new Error("Please select at least one user.");
              
              const promises = selectedUsers.map(user => 
                  addDoc(collection(db, "users", user.id, "notifications"), {
                      title, body, read: false, createdAt: serverTimestamp(), type: 'system'
                  })
              );
              await Promise.all(promises);
              
              targetLabel = `Group (${selectedUsers.length} users)`;
              recipientCount = selectedUsers.length;
          }

          // Log the action
          await addDoc(collection(db, "notification_logs"), {
              title,
              body,
              target: targetLabel,
              recipientCount: recipientCount,
              createdAt: serverTimestamp()
          });

          alert(`Successfully sent!`);
          
          // Reset Form
          setTitle('');
          setBody('');
          setTargetUid('');
          setSelectedUsers([]);

          // ✅ SURGICAL UPDATE: Wipe cache to ensure new log shows up
          sessionStorage.removeItem('admin_notifications_history_cache');
          fetchHistory(true);
          
          setActiveTab('history');

      } catch (error) {
          alert("Error sending: " + error.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="container" style={{ position: 'relative' }}>
      
      {/* HEADER */}
      <div style={{ marginBottom: 30 }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Megaphone size={32} className="text-blue-600" /> Notification Center
            </h1>
            <p style={{ color: '#6b7280', marginTop: 5 }}>Send alerts, updates, and messages to your app users.</p>
      </div>

      <div className="grid-12">
        {/* LEFT COLUMN: MAIN INTERFACE */}
        <div style={{ gridColumn: 'span 8' }}>
            <div className="card">
                {/* TABS */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', position: 'relative' }}>
                    <button onClick={() => setActiveTab('compose')} style={{ flex: 1, padding: 20, background: activeTab === 'compose' ? 'white' : '#f9fafb', border: 'none', borderBottom: activeTab === 'compose' ? '3px solid #2563eb' : 'none', fontWeight: 700, color: activeTab === 'compose' ? '#2563eb' : '#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><Send size={18}/> Compose New</button>
                    <button onClick={() => setActiveTab('history')} style={{ flex: 1, padding: 20, background: activeTab === 'history' ? 'white' : '#f9fafb', border: 'none', borderBottom: activeTab === 'history' ? '3px solid #2563eb' : 'none', fontWeight: 700, color: activeTab === 'history' ? '#2563eb' : '#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><History size={18}/> Sent History</button>
                    
                    {/* ✅ SURGICAL UPDATE: REFRESH BUTTON (Only visible on history tab) */}
                    {activeTab === 'history' && (
                        <button 
                            onClick={() => fetchHistory(true)}
                            style={{ position: 'absolute', right: 15, top: 15, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', color: '#4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>
                    )}
                </div>

                <div className="card-body" style={{ padding: 30 }}>
                    {activeTab === 'compose' ? (
                        <form onSubmit={handleSend}>
                            
                            {/* AUDIENCE SELECTOR */}
                            <div className="form-group">
                                <span className="form-label">Who is this for?</span>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15 }}>
                                    {/* Option 1: Specific */}
                                    <div 
                                        onClick={() => setTargetType('specific')}
                                        style={{ padding: 15, borderRadius: 12, border: targetType === 'specific' ? '2px solid #2563eb' : '2px solid #e5e7eb', background: targetType === 'specific' ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'center' }}
                                    >
                                        <div style={{ fontWeight: 700, color: targetType === 'specific' ? '#1e3a8a' : '#374151', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                                            <User size={24} /> Single User
                                        </div>
                                    </div>

                                    {/* Option 2: Multiple (New) */}
                                    <div 
                                        onClick={() => setTargetType('multiple')}
                                        style={{ padding: 15, borderRadius: 12, border: targetType === 'multiple' ? '2px solid #059669' : '2px solid #e5e7eb', background: targetType === 'multiple' ? '#ecfdf5' : 'white', cursor: 'pointer', textAlign: 'center' }}
                                    >
                                        <div style={{ fontWeight: 700, color: targetType === 'multiple' ? '#065f46' : '#374151', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                                            <Users size={24} /> Select Group
                                        </div>
                                    </div>

                                    {/* Option 3: All */}
                                    <div 
                                        onClick={() => setTargetType('all')}
                                        style={{ padding: 15, borderRadius: 12, border: targetType === 'all' ? '2px solid #7c3aed' : '2px solid #e5e7eb', background: targetType === 'all' ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center' }}
                                    >
                                        <div style={{ fontWeight: 700, color: targetType === 'all' ? '#5b21b6' : '#374151', display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                                            <Bell size={24} /> Everyone
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CONDITIONAL INPUTS */}
                            
                            {/* 1. Single User Input */}
                            {targetType === 'specific' && (
                                <div className="form-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                                    <span className="form-label">User UID</span>
                                    <input type="text" className="input-field" style={{ fontFamily: 'monospace' }} placeholder="Paste User UID here..." value={targetUid} onChange={e => setTargetUid(e.target.value)} />
                                </div>
                            )}

                            {/* 2. Multiple User Selector */}
                            {targetType === 'multiple' && (
                                <div className="form-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                                    <span className="form-label">Selected Users ({selectedUsers.length})</span>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 15, background: '#f9fafb' }}>
                                        {selectedUsers.length > 0 ? (
                                            <div style={{ display:'flex', flexWrap:'wrap', gap: 10, marginBottom: 15 }}>
                                                {selectedUsers.map(u => (
                                                    <span key={u.id} className="chip" style={{ background:'white', border:'1px solid #e5e7eb', padding:'5px 10px', display:'flex', alignItems:'center', gap:5 }}>
                                                        {u.username || "Unknown"} 
                                                        <X size={14} style={{cursor:'pointer', color:'#ef4444'}} onClick={() => toggleUserSelection(u)}/>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ color: '#9ca3af', fontStyle:'italic', marginBottom: 15, textAlign:'center' }}>No users selected yet.</div>
                                        )}
                                        
                                        <button type="button" onClick={openUserPicker} style={{ width: '100%', padding: 10, background: 'white', border: '1px dashed #2563eb', color: '#2563eb', fontWeight: 700, borderRadius: 8, cursor:'pointer' }}>
                                            + Open User Picker
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div style={{ height: 1, background: '#e5e7eb', margin: '20px 0' }}></div>

                            {/* CONTENT INPUTS */}
                            <div className="form-group">
                                <span className="form-label">Notification Title</span>
                                <input type="text" className="input-field" style={{ fontWeight: 700 }} placeholder="e.g. 🎉 Special Update Available!" value={title} onChange={e => setTitle(e.target.value)} />
                            </div>

                            <div className="form-group">
                                <span className="form-label">Message Body</span>
                                <textarea className="textarea-field" style={{ height: 120 }} placeholder="Type your message here..." value={body} onChange={e => setBody(e.target.value)} />
                            </div>

                            <button type="submit" className="btn-publish" disabled={loading} style={{ marginTop: 10 }}>
                                {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                                {loading ? "Sending..." : "Send Notification"}
                            </button>

                        </form>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            {/* HISTORY LIST */}
                            {history.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}><History size={40} style={{ opacity: 0.2, marginBottom: 10 }} /><p>No notifications sent yet.</p></div>
                            ) : (
                                history.map(log => (
                                    <div key={log.id} style={{ padding: 15, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <div style={{ fontWeight: 700, color: '#1f2937' }}>{log.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</div>
                                        </div>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#4b5563' }}>{log.body}</p>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <span className="chip" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{log.target}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} color="#10b981"/> {log.recipientCount === 'All' ? 'Broadcast Sent' : `Sent to ${log.recipientCount}`}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ gridColumn: 'span 4' }}>
            <div className="card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 25 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 15px 0' }}><Info size={20}/> Best Practices</h3>
                <ul style={{ paddingLeft: 20, color: '#1e40af', fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
                    <li style={{ marginBottom: 10 }}><b>Use "Everyone" sparingly.</b> It sends a push to every installed device.</li>
                    <li style={{ marginBottom: 10 }}>For critical alerts (maintenance, updates), use <b>Broadcast</b>.</li>
                    <li>Individual warnings should always use <b>Single User</b> mode.</li>
                </ul>
            </div>
        </div>
      </div>

      {/* ✅ USER PICKER MODAL (Paginated) */}
      {showUserPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: 'white', borderRadius: 16, width: '90%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                  <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Select Users</h3>
                      <button onClick={() => setShowUserPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={24}/></button>
                  </div>
                  
                  <div style={{ padding: 15, borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ position: 'relative' }}>
                          <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} />
                          <input 
                              type="text" 
                              placeholder="Search loaded users..." 
                              className="input-field" 
                              style={{ paddingLeft: 40 }}
                              value={userSearch}
                              onChange={e => setUserSearch(e.target.value)}
                          />
                      </div>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, padding: 10 }}>
                      {filteredUsers.map(user => {
                          const isSelected = selectedUsers.some(u => u.id === user.id);
                          return (
                              <div 
                                key={user.id} 
                                onClick={() => toggleUserSelection(user)}
                                style={{ display: 'flex', alignItems: 'center', gap: 15, padding: 12, borderRadius: 8, cursor: 'pointer', background: isSelected ? '#eff6ff' : 'transparent', transition: 'background 0.2s' }}
                              >
                                  {isSelected ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-gray-300"/>}
                                  
                                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b7280' }}>
                                      {user.avatar ? <img src={user.avatar} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (user.username?.[0] || 'U')}
                                  </div>

                                  <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, color: '#1f2937' }}>{user.username || "Unknown"}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user.email}</div>
                                  </div>
                              </div>
                          );
                      })}
                      
                      {/* Load More Button inside Modal */}
                      <button 
                        type="button" 
                        onClick={() => fetchUsers(false)} 
                        disabled={loadingUsers}
                        style={{ width: '100%', padding: 10, marginTop: 10, background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', cursor:'pointer' }}
                      >
                          {loadingUsers ? "Loading..." : "Load More Users"}
                      </button>
                  </div>

                  <div style={{ padding: 20, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                      <div style={{ fontWeight: 600, color: '#4b5563' }}>{selectedUsers.length} selected</div>
                      <button onClick={() => setShowUserPicker(false)} className="btn-publish" style={{ width: 'auto', padding: '10px 25px' }}>Done</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}