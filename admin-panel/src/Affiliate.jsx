import { collection, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import {
    CheckCircle,
    ChevronRight,
    Copy,
    Link as LinkIcon,
    Loader2,
    MousePointerClick,
    Search,
    Trash2,
    TrendingUp,
    UserPlus,
    Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from './firebase';

export default function Affiliate() {
  const [affiliates, setAffiliates] = useState([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal & Search State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ✅ SURGICAL ADDITION: State for the Referred Users Modal
  const [referredUsers, setReferredUsers] = useState([]);
  const [isReferredModalOpen, setIsReferredModalOpen] = useState(false);
  const [loadingReferred, setLoadingReferred] = useState(false);

  useEffect(() => {
    fetchAffiliates();
  }, []);

  const fetchAffiliates = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('isAffiliate', '==', true));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort locally: newest affiliates at the top (assuming we save affiliateCreatedAt)
      list.sort((a, b) => (b.affiliateCreatedAt?.toMillis() || 0) - (a.affiliateCreatedAt?.toMillis() || 0));
      
      setAffiliates(list);
      // Automatically select the first one if the list isn't empty and none is selected
      if (list.length > 0 && !selectedAffiliate) {
          setSelectedAffiliate(list[0]);
      } else if (list.length === 0) {
          setSelectedAffiliate(null);
      }
    } catch (error) {
      console.error("Error fetching affiliates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUsers = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      // Basic Firebase search by exact email or username (Firebase doesn't do native partial text search easily)
      // For MVP, we fetch a chunk of users and filter locally to make it stress-free.
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
      const allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const filtered = allUsers.filter(u => 
        !u.isAffiliate && // Don't show users who are already affiliates
        (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
         u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setSearchResults(filtered.slice(0, 10)); // Limit to top 10 results
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const generateAffiliateCode = (name) => {
      const cleanName = (name || 'user').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toLowerCase();
      const randomString = Math.random().toString(36).substring(2, 6);
      return `${cleanName}-${randomString}`;
  };

  const makeAffiliate = async (user) => {
      if (!window.confirm(`Make ${user.displayName || user.email} an affiliate?`)) return;
      try {
          const code = generateAffiliateCode(user.displayName);
          const userRef = doc(db, 'users', user.id);
          
          await updateDoc(userRef, {
              isAffiliate: true,
              affiliateCode: code,
              affiliateClicks: 0,
              affiliateSignups: 0,
              affiliateCreatedAt: new Date(),
              role: 'creator' // ✅ UPDATED: Automatically sets them as a Creator
          });

          alert(`${user.displayName || 'User'} is now an affiliate!`);
          setIsModalOpen(false);
          setSearchQuery('');
          setSearchResults([]);
          fetchAffiliates();
      } catch (error) {
          alert("Error adding affiliate: " + error.message);
      }
  };

  const revokeAffiliate = async (affiliate) => {
      if (!window.confirm(`WARNING: Are you sure you want to revoke affiliate access for ${affiliate.displayName}? Their tracking link will stop working.`)) return;
      try {
          await updateDoc(doc(db, 'users', affiliate.id), {
              isAffiliate: false,
              role: 'user' // ✅ UPDATED: Reverts them back to a standard User
          });
          if (selectedAffiliate?.id === affiliate.id) setSelectedAffiliate(null);
          fetchAffiliates();
      } catch (error) {
          alert("Error revoking affiliate: " + error.message);
      }
  };

  const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
  };

  // ✅ SURGICAL ADDITION: Fetch users who signed up with the selected affiliate's code
  const handleViewReferredUsers = async () => {
      if (!selectedAffiliate || !selectedAffiliate.affiliateCode) return;
      setIsReferredModalOpen(true);
      setLoadingReferred(true);
      try {
          const q = query(collection(db, 'users'), where('referredBy', '==', selectedAffiliate.affiliateCode), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setReferredUsers(list);
      } catch (error) {
          console.error("Error fetching referred users:", error);
          alert("Error fetching referred users. Ensure you have the proper Firestore index if required.");
      } finally {
          setLoadingReferred(false);
      }
  };

  return (
    <div className="container" style={{ display: 'flex', gap: 20, height: '85vh', overflow: 'hidden' }}>
        
        {/* LEFT PANE: Affiliate Roster */}
        <div style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: 15, height: '100%' }}>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0, overflow: 'hidden' }}>
                <div className="card-header blue" style={{ padding: '15px 20px', background: '#eff6ff', color: '#1e40af', borderBottom: '1px solid #bfdbfe' }}>
                    <Users size={20} />
                    <span style={{ fontWeight: 800 }}>Affiliate Roster ({affiliates.length})</span>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            {/* ✅ Fixed: Using Loader2 icon instead of ActivityIndicator */}
                            <Loader2 className="animate-spin" color="#2563eb" size={32} />
                        </div>
                    ) : affiliates.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontStyle: 'italic' }}>No affiliates yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {affiliates.map(aff => {
                                const isSelected = selectedAffiliate?.id === aff.id;
                                return (
                                    <div 
                                        key={aff.id}
                                        onClick={() => setSelectedAffiliate(aff)}
                                        style={{ 
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', 
                                            borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                                            background: isSelected ? '#3b82f6' : '#f8fafc',
                                            color: isSelected ? 'white' : '#1e293b',
                                            border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: isSelected ? '#60a5fa' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? 'white' : '#475569', fontWeight: 'bold' }}>
                                                {(aff.displayName || aff.email || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{aff.displayName || 'Unknown User'}</div>
                                                <div style={{ fontSize: '0.75rem', opacity: isSelected ? 0.9 : 0.6 }}>{aff.affiliateSignups || 0} signups</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} opacity={isSelected ? 1 : 0.4} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* BOTTOM STICKY BUTTON */}
                <div style={{ padding: 15, borderTop: '1px solid #e2e8f0', background: 'white' }}>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        style={{ width: '100%', padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                    >
                        <UserPlus size={18} /> Create Affiliate
                    </button>
                </div>
            </div>
        </div>

        {/* RIGHT PANE: Detailed Analytics */}
        <div style={{ width: '65%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card" style={{ flex: 1, marginBottom: 0, overflowY: 'auto' }}>
                {!selectedAffiliate ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <MousePointerClick size={60} style={{ marginBottom: 15, opacity: 0.5 }} />
                        <h2 style={{ margin: 0, color: '#64748b' }}>Select an Affiliate</h2>
                        <p style={{ marginTop: 5 }}>Click on a user from the roster to view their performance metrics.</p>
                    </div>
                ) : (
                    <div style={{ padding: 30 }}>
                        
                        {/* HEADER PROFILE */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30, paddingBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900 }}>
                                    {(selectedAffiliate.displayName || selectedAffiliate.email || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h1 style={{ margin: '0 0 5px 0', fontSize: '1.8rem', color: '#0f172a' }}>{selectedAffiliate.displayName || 'Unknown User'}</h1>
                                    <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 8 }}>{selectedAffiliate.email}</div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        <CheckCircle size={12} /> Active Affiliate
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => revokeAffiliate(selectedAffiliate)}
                                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '8px 15px', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                            >
                                <Trash2 size={16} /> Revoke Access
                            </button>
                        </div>

                        {/* TRACKING LINK SECTION */}
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 20, marginBottom: 30 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontWeight: 800, marginBottom: 10 }}>
                                <LinkIcon size={18} /> Unique Tracking Link
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={`https://aniyu.site/ref/${selectedAffiliate.affiliateCode}`} 
                                    style={{ flex: 1, padding: '12px 15px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', color: '#334155', fontWeight: 600, outline: 'none' }}
                                />
                                <button 
                                    onClick={() => copyToClipboard(`https://aniyu.site/ref/${selectedAffiliate.affiliateCode}`)}
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0 20px', borderRadius: 8, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                                >
                                    <Copy size={18} /> Copy
                                </button>
                            </div>
                        </div>

                        {/* STATS GRID */}
                        <h3 style={{ margin: '0 0 15px 0', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={20} color="#8b5cf6" /> Performance Metrics
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                            
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Total Link Clicks</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a' }}>{selectedAffiliate.affiliateClicks || 0}</div>
                            </div>

                            {/* ✅ SURGICAL UPDATE: Added onClick handler & styling to make this box clickable */}
                            <div 
                                onClick={handleViewReferredUsers}
                                style={{ background: 'white', border: '1px solid #10b981', borderRadius: 12, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Successful Signups</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10b981' }}>{selectedAffiliate.affiliateSignups || 0}</div>
                                <div style={{ position: 'absolute', bottom: 10, right: 15, fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold' }}>View Users &rarr;</div>
                            </div>

                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Conversion Rate</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#8b5cf6' }}>
                                    {selectedAffiliate.affiliateClicks > 0 
                                        ? Math.round((selectedAffiliate.affiliateSignups / selectedAffiliate.affiliateClicks) * 100) 
                                        : 0}%
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* MODAL: Create New Affiliate */}
        {isModalOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', width: 500, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                    <div style={{ background: '#f8fafc', padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Create Affiliate Link</h2>
                        <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                    </div>
                    
                    <div style={{ padding: 20 }}>
                        <form onSubmit={handleSearchUsers} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                                <input 
                                    type="text" 
                                    placeholder="Search user by email or name..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ width: '100%', padding: '12px 10px 12px 38px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button type="submit" disabled={searching} style={{ background: '#0f172a', color: 'white', border: 'none', padding: '0 20px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                                {searching ? <Loader2 className="animate-spin" size={18} /> : 'Search'}
                            </button>
                        </form>

                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            {searchResults.length === 0 && searchQuery && !searching && (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No non-affiliate users found matching "{searchQuery}"</div>
                            )}
                            
                            {searchResults.map(user => (
                                <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 15, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{user.displayName || 'Unknown User'}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{user.email}</div>
                                    </div>
                                    <button 
                                        onClick={() => makeAffiliate(user)}
                                        style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: 6, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                                    >
                                        <UserPlus size={16} /> Make Affiliate
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ✅ SURGICAL ADDITION: MODAL: View Referred Users */}
        {isReferredModalOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', width: 600, maxHeight: '80vh', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                    <div style={{ background: '#f8fafc', padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Referred Users</h2>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                                Users who signed up using <strong style={{color: '#10b981'}}>{selectedAffiliate?.affiliateCode}</strong>
                            </div>
                        </div>
                        <button onClick={() => setIsReferredModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                    </div>
                    
                    <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                        {loadingReferred ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                                <Loader2 className="animate-spin" color="#10b981" size={32} />
                            </div>
                        ) : referredUsers.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                                <Users size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                                <div>No users have signed up using this affiliate code yet.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {referredUsers.map(user => (
                                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: 15, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontWeight: 'bold' }}>
                                            {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{user.displayName || 'Unknown User'}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{user.email}</div>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>
                                            Joined<br/>
                                            {user.createdAt ? (user.createdAt.toDate ? user.createdAt.toDate().toLocaleDateString() : new Date(user.createdAt).toLocaleDateString()) : 'Unknown Date'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}