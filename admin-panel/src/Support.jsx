// ✅ BUG 2 FIX: Added limit and startAfter to the imports
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, updateDoc, where } from 'firebase/firestore';
import {
    ArrowLeft, CheckCircle, Image as ImageIcon, Loader2, Lock, MessageSquare,
    RefreshCw, Search, Send, User, UserCheck, X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { auth, db } from './firebase';
import { uploadToR2 } from './utils/r2Storage';

const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export default function Support() {
    const [currentAdmin, setCurrentAdmin] = useState(null);
    const [allAdmins, setAllAdmins] = useState([]); 
    const [showTransferModal, setShowTransferModal] = useState(false);
    
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending'); 
    const [searchTerm, setSearchTerm] = useState('');

    // ✅ BUG 2 FIX: Pagination states
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [selectedTicket, setSelectedTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [replyText, setReplyText] = useState('');
    const [replyImage, setReplyImage] = useState(null);
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef(null);

    // --- 0. FETCH ADMIN PROFILE & ALL ADMINS ---
    useEffect(() => {
        const fetchAdmins = async () => {
            if (auth.currentUser) {
                const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (snap.exists()) {
                    const adminData = { id: snap.id, ...snap.data() };
                    setCurrentAdmin(adminData);
                }
                
                const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'super_admin']));
                const adminSnap = await getDocs(q);
                const adminList = adminSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllAdmins(adminList.filter(a => a.id !== auth.currentUser.uid)); 
            }
        };
        fetchAdmins();
    }, []);

    // --- 1. REAL-TIME TICKETS ---
    useEffect(() => {
        setLoading(true);
        // ✅ BUG 2 FIX: Server-side filtering + Capped limits to prevent memory crashes
        const q = query(
            collection(db, 'supportTickets'), 
            where('status', '==', filter),
            orderBy('updatedAt', 'desc'),
            limit(50)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTickets(fetchedTickets);
            
            if (snapshot.docs.length > 0) {
                setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(snapshot.docs.length === 50);
            } else {
                setLastVisible(null);
                setHasMore(false);
            }
            setLoading(false);

            setSelectedTicket(prev => {
                if (!prev) return null;
                return fetchedTickets.find(t => t.id === prev.id) || prev;
            });
        }, (error) => {
            console.error("Firebase Error:", error);
            setLoading(false); 
        });
        return () => unsubscribe();
    }, [filter]); // ✅ Refreshes snapshot safely when tab changes

    // ✅ BUG 2 FIX: Load More Logic
    const handleLoadMore = async () => {
        if (!hasMore || loadingMore || !lastVisible) return;
        setLoadingMore(true);
        try {
            const q = query(
                collection(db, 'supportTickets'),
                where('status', '==', filter),
                orderBy('updatedAt', 'desc'),
                startAfter(lastVisible),
                limit(50)
            );
            const snapshot = await getDocs(q);
            const moreTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (moreTickets.length > 0) {
                setTickets(prev => [...prev, ...moreTickets]);
                setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(snapshot.docs.length === 50);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error("Error loading more tickets:", error);
        } finally {
            setLoadingMore(false);
        }
    };

    // --- 2. REAL-TIME MESSAGES ---
    useEffect(() => {
        if (!selectedTicket) return;
        
        const q = query(collection(db, 'supportTickets', selectedTicket.id, 'messages'), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (error) => console.error("Error:", error));

        if (selectedTicket.unreadAdmin && (selectedTicket.status === 'pending' || selectedTicket.assignedAdminId === currentAdmin?.id)) {
            updateDoc(doc(db, 'supportTickets', selectedTicket.id), { unreadAdmin: false }).catch(e => console.error(e));
        }
        return () => unsubscribe();
    }, [selectedTicket?.id, currentAdmin?.id]);

    // --- 3. CLAIM TICKET ---
    const handleClaimTicket = async () => {
        if (!selectedTicket || !currentAdmin) return;
        try {
            await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
                status: 'active',
                assignedAdminId: currentAdmin.id,
                assignedAdminName: currentAdmin.username || 'Moderator',
                transferredBy: null, 
                updatedAt: serverTimestamp()
            });
            setFilter('active');
        } catch (e) { alert('Error: ' + e.message); }
    };

    // --- 4. TRANSFER TICKET ---
    const handleTransferTicket = async (targetAdmin) => {
        if (!selectedTicket || !currentAdmin || !targetAdmin) return;
        try {
            await addDoc(collection(db, 'supportTickets', selectedTicket.id, 'messages'), {
                senderId: 'system',
                senderModel: 'system',
                text: `Ticket transferred to ${targetAdmin.username} by ${currentAdmin.username}.`,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
                status: 'pending',
                assignedAdminId: targetAdmin.id,
                assignedAdminName: targetAdmin.username,
                transferredBy: currentAdmin.username || 'Admin',
                updatedAt: serverTimestamp(),
                unreadUser: true
            });

            setShowTransferModal(false);
            setSelectedTicket(null);
            setFilter('pending');
            alert(`Ticket transferred to ${targetAdmin.username}`);
        } catch (e) { alert('Error transferring: ' + e.message); }
    };

    // --- 5. SEND MESSAGE ---
    const handleSendMessage = async (e) => {
        e?.preventDefault();
        if ((!replyText.trim() && !replyImage) || !selectedTicket || sending) return;

        setSending(true);
        try {
            let imageUrl = null;
            if (replyImage) {
                const result = await uploadToR2(replyImage, `support/${selectedTicket.id}`);
                imageUrl = typeof result === 'string' ? result : result.url;
            }

            await addDoc(collection(db, 'supportTickets', selectedTicket.id, 'messages'), {
                senderId: currentAdmin.id,
                senderModel: 'admin',
                text: replyText.trim(),
                imageUrl: imageUrl,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
                lastMessage: imageUrl ? 'Sent an image' : replyText.trim(),
                updatedAt: serverTimestamp(),
                unreadUser: true 
            });

            setReplyText('');
            setReplyImage(null);
        } catch (error) { alert('Error: ' + error.message); } 
        finally { setSending(false); }
    };

    // --- 6. MARK RESOLVED ---
    const handleResolveTicket = async () => {
        if (!selectedTicket || !window.confirm('Close this ticket and mark it as resolved?')) return;
        try {
            await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
                status: 'resolved',
                resolvedBy: currentAdmin.username || 'Moderator', 
                updatedAt: serverTimestamp()
            });
            alert('Ticket Closed successfully!');
            setSelectedTicket(null);
            setFilter('resolved');
        } catch (e) { alert('Error: ' + e.message); }
    };

    // ✅ BUG 2 FIX: Filtered client side ONLY by search, server handles status now
    const filteredTickets = tickets.filter(t => 
        (t.userName?.toLowerCase().includes(searchTerm.toLowerCase()) || t.userId?.includes(searchTerm))
    );

    return (
        <>
        <style>{`
            @keyframes spin { 100% { transform: rotate(360deg); } }
            .animate-spin { animation: spin 1s linear infinite; }
            .btn-claim { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 800; font-size: 1rem; cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0 auto; transition: background 0.2s; }
            .btn-claim:hover { background: #1d4ed8; }
            
            .support-container { 
                display: flex; 
                height: calc(100vh - 100px); 
                background: #f9fafb; 
                margin: 20px; 
                border-radius: 16px; 
                border: 1px solid #e5e7eb; 
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); 
                overflow: hidden; 
            }
            .left-panel { width: 350px; background: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; z-index: 10; }
            .right-panel { flex: 1; display: flex; flex-direction: column; background: #f8fafc; position: relative; }
            
            .mobile-back-btn { 
                display: none; 
                background: transparent; 
                border: none; 
                padding: 5px 10px 5px 0; 
                cursor: pointer; 
                color: #4b5563; 
            }
            .mobile-back-btn:hover { color: #1f2937; }
            
            .ticket-card { padding: 18px 20px; border-bottom: 1px solid #f3f4f6; cursor: pointer; transition: all 0.2s; position: relative; }
            .ticket-card:hover { background: #f8fafc; }
            
            /* ✅ SURGICAL UPDATE: Forces the back button to display on mobile devices */
            @media (max-width: 992px) {
                .support-container { margin: 10px; height: calc(100vh - 80px); }
                .left-panel { width: 100%; display: var(--show-list); border-right: none; }
                .right-panel { width: 100%; display: var(--show-chat); position: absolute; inset: 0; z-index: 20; border-radius: 16px; }
                .mobile-back-btn { display: flex !important; align-items: center; justify-content: center; margin-right: 5px; }
            }

            .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; }
            .modal-content { background: white; width: 90%; max-width: 400px; border-radius: 16px; padding: 25px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        `}</style>

        <div className="support-container" style={{ '--show-list': selectedTicket ? 'none' : 'flex', '--show-chat': selectedTicket ? 'flex' : 'none' }}>
            
            {/* LEFT PANEL: TICKETS LIST */}
            <div className="left-panel">
                <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb', background: 'white' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 10, color: '#1f2937' }}>
                        <MessageSquare className="text-blue-600" size={26}/> Support Desk
                    </h1>
                    
                    <div style={{ position: 'relative', marginBottom: 15 }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: '#9ca3af' }} />
                        <input 
                            type="text" placeholder="Search user..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: 8, border: '1px solid #e5e7eb', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div style={{ display: 'flex', background: '#f3f4f6', padding: 4, borderRadius: 8, gap: 4 }}>
                        {['pending', 'active', 'resolved'].map(f => (
                            <button 
                                key={f} onClick={() => { setFilter(f); setSelectedTicket(null); }}
                                style={{
                                    flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
                                    background: filter === f ? 'white' : 'transparent',
                                    color: filter === f ? (f === 'pending' ? '#d97706' : f === 'active' ? '#2563eb' : '#16a34a') : '#6b7280',
                                    boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: 'white' }}>
                    {loading ? (
                        <div style={{ padding: 40, display: 'flex', justifyContent: 'center', color: '#9ca3af' }}>
                            <Loader2 className="animate-spin" size={30} />
                        </div>
                    ) : filteredTickets.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: '0.9rem' }}>No {filter} tickets.</div>
                    ) : (
                        <>
                            {filteredTickets.map(ticket => (
                                <div 
                                    key={ticket.id} 
                                    className="ticket-card"
                                    onClick={() => setSelectedTicket(ticket)}
                                    style={{ 
                                        background: selectedTicket?.id === ticket.id ? '#eff6ff' : 'white',
                                        borderLeft: selectedTicket?.id === ticket.id ? '4px solid #2563eb' : '4px solid transparent',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div style={{ fontWeight: 800, color: '#1f2937', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {ticket.userName || 'Unknown User'}
                                            {ticket.unreadAdmin && (ticket.status === 'pending' || ticket.assignedAdminId === currentAdmin?.id) && (
                                                <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }}></span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>{formatTime(ticket.updatedAt)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ticket.lastMessage || "Started a chat..."}
                                    </div>

                                    {ticket.transferredBy && ticket.status === 'pending' && (
                                        <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#9333ea', background: '#faf5ff', padding: '2px 6px', borderRadius: 4, display: 'inline-block', fontWeight: 700 }}>
                                            Transferred by {ticket.transferredBy}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* ✅ BUG 2 FIX: Render the Load More button if there are more tickets */}
                            {hasMore && (
                                <button 
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    style={{ width: '100%', padding: '15px', background: '#f8fafc', border: 'none', borderTop: '1px solid #e5e7eb', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    {loadingMore ? <Loader2 className="animate-spin" size={18} /> : 'Load More'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: CHAT WINDOW */}
            <div className="right-panel">
                {!selectedTicket ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                        <MessageSquare size={60} style={{ opacity: 0.2, marginBottom: 20 }} />
                        <h2 style={{fontWeight: 700, color: '#6b7280'}}>Select a ticket to start chatting</h2>
                    </div>
                ) : (
                    <>
                        <div style={{ padding: '15px 25px', background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                {/* ✅ FIXED: Back Button explicitly clears the selected ticket */}
                                <button className="mobile-back-btn" onClick={() => setSelectedTicket(null)}>
                                    <ArrowLeft size={24} />
                                </button>
                                <div style={{ width: 45, height: 45, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 15 }}>
                                    {selectedTicket.userAvatar ? <img src={selectedTicket.userAvatar} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}}/> : <User className="text-gray-400"/>}
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{selectedTicket.userName || 'Unknown User'}</h2>
                                    <span style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>UID: {selectedTicket.userId}</span>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: 10 }}>
                                {selectedTicket.status === 'active' && selectedTicket.assignedAdminId === currentAdmin?.id && (
                                    <>
                                        <button 
                                            onClick={() => setShowTransferModal(true)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 15px', background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
                                        >
                                            <RefreshCw size={14}/> Transfer
                                        </button>
                                        <button 
                                            onClick={handleResolveTicket}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 15px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
                                        >
                                            <X size={16}/> Close Ticket
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: 1, padding: 25, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div style={{ textAlign: 'center', margin: '10px 0' }}>
                                <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.75rem', padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}>
                                    Ticket Created: {selectedTicket.createdAt?.toDate?.().toLocaleDateString()}
                                </span>
                            </div>

                            {messages.map(msg => {
                                if (msg.senderModel === 'system') {
                                    return (
                                        <div key={msg.id} style={{ textAlign: 'center', margin: '10px 0' }}>
                                            <span style={{ background: '#faf5ff', color: '#9333ea', border: '1px solid #e9d5ff', fontSize: '0.75rem', padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}>
                                                {msg.text}
                                            </span>
                                        </div>
                                    );
                                }

                                const isAdmin = msg.senderModel === 'admin';
                                return (
                                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                                        <div style={{ 
                                            maxWidth: '70%', padding: 15, borderRadius: 16, position: 'relative',
                                            background: isAdmin ? '#2563eb' : 'white',
                                            color: isAdmin ? 'white' : '#1f2937',
                                            border: isAdmin ? 'none' : '1px solid #e2e8f0',
                                            borderBottomRightRadius: isAdmin ? 4 : 16,
                                            borderBottomLeftRadius: isAdmin ? 16 : 4,
                                            boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                                        }}>
                                            {msg.imageUrl && (
                                                <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                                                    <img src={msg.imageUrl} style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 8, marginBottom: msg.text ? 10 : 0 }} />
                                                </a>
                                            )}
                                            {msg.text && <div style={{ fontSize: '0.95rem', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{msg.text}</div>}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4, padding: '0 5px' }}>
                                            {isAdmin ? (msg.senderId === currentAdmin?.id ? 'You' : 'Other Admin') : selectedTicket.userName} • {formatTime(msg.createdAt)}
                                        </span>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {selectedTicket.status === 'pending' ? (
                            <div style={{ padding: 30, background: 'white', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
                                <p style={{ color: '#6b7280', marginBottom: 15 }}>
                                    {selectedTicket.transferredBy 
                                        ? `Transferred to you by ${selectedTicket.transferredBy}` 
                                        : "This ticket is waiting for a moderator."}
                                </p>
                                <button onClick={handleClaimTicket} className="btn-claim">
                                    <UserCheck size={20} /> {selectedTicket.transferredBy ? "Accept Transfer" : "Attend to Ticket"}
                                </button>
                            </div>
                        ) : selectedTicket.status === 'active' && selectedTicket.assignedAdminId !== currentAdmin?.id ? (
                            <div style={{ padding: 20, background: '#fee2e2', borderTop: '1px solid #fecaca', textAlign: 'center', color: '#991b1b', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                <Lock size={18} /> Ticket is being handled by {selectedTicket.assignedAdminName || 'another moderator'}.
                            </div>
                        ) : selectedTicket.status === 'resolved' ? (
                            <div style={{ padding: 20, background: '#f0fdf4', borderTop: '1px solid #bbf7d0', textAlign: 'center', color: '#166534', fontWeight: 600 }}>
                                <CheckCircle size={18} style={{ display: 'inline', marginBottom: -4, marginRight: 5 }}/>
                                Resolved by {selectedTicket.resolvedBy || 'Support Team'}
                            </div>
                        ) : (
                            <div style={{ padding: 20, background: 'white', borderTop: '1px solid #e5e7eb' }}>
                                {replyImage && (
                                    <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                        <img src={URL.createObjectURL(replyImage)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button onClick={() => setReplyImage(null)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', padding: 2, cursor: 'pointer' }}><X size={12}/></button>
                                    </div>
                                )}
                                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input type="file" accept="image/*" id="chat-img" className="hidden" onChange={e => setReplyImage(e.target.files[0])} style={{ display: 'none' }}/>
                                    <label htmlFor="chat-img" style={{ padding: 12, background: '#f1f5f9', color: '#64748b', borderRadius: 12, cursor: 'pointer', display: 'flex' }}>
                                        <ImageIcon size={22} />
                                    </label>
                                    <input 
                                        type="text" 
                                        value={replyText} 
                                        onChange={e => setReplyText(e.target.value)} 
                                        placeholder="Type your reply here..." 
                                        style={{ flex: 1, padding: '15px 20px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.95rem' }}
                                    />
                                    <button type="submit" disabled={sending || (!replyText.trim() && !replyImage)} style={{ padding: '15px 25px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {sending ? <Loader2 size={20} className="animate-spin" /> : <><Send size={18}/> Send</>}
                                    </button>
                                </form>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Transfer Ticket</h2>
                            <button onClick={() => setShowTransferModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20}/></button>
                        </div>
                        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 20 }}>Select an admin to transfer this ticket to.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                            {allAdmins.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No other admins available.</div>
                            ) : (
                                allAdmins.map(admin => (
                                    <button 
                                        key={admin.id}
                                        onClick={() => handleTransferTicket(admin)}
                                        style={{ padding: 15, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
                                    >
                                        <div style={{ width: 35, height: 35, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={18} color="#64748b"/>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#1f2937' }}>{admin.username || admin.displayName || 'Admin'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>{admin.role.replace('_', ' ')}</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}