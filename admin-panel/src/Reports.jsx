import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, startAfter, updateDoc } from 'firebase/firestore';
import {
    Bot,
    CheckCircle,
    Clock,
    Copy, // ✅ IMPORTED COPY ICON
    FileText,
    Loader2,
    MessageSquare,
    RefreshCw,
    Shield,
    Trash2,
    User,
    Video,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from './firebase';

export default function Reports() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('pending'); // 'pending' | 'resolved' | 'dismissed'
    
    // Pagination State
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // --- FETCH REPORTS ---
    useEffect(() => {
        fetchReports(true);
    }, []);

    const fetchReports = async (isFirstLoad = false) => {
        if (loading || loadingMore || (!isFirstLoad && !hasMore)) return;

        if (isFirstLoad) setLoading(true);
        else setLoadingMore(true);

        try {
            let q = query(
                collection(db, "reports"), 
                orderBy('createdAt', 'desc'),
                limit(50) 
            );

            if (!isFirstLoad && lastVisible) {
                q = query(
                    collection(db, "reports"), 
                    orderBy('createdAt', 'desc'),
                    startAfter(lastVisible),
                    limit(50)
                );
            }

            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (snap.docs.length > 0) setLastVisible(snap.docs[snap.docs.length - 1]);
            if (snap.docs.length < 50) setHasMore(false);

            setReports(prev => isFirstLoad ? data : [...prev, ...data]);

        } catch (e) { 
            console.error("Error fetching reports:", e); 
        } finally { 
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // --- ACTIONS ---
    const handleAction = async (reportId, newStatus) => {
        try {
            await updateDoc(doc(db, "reports", reportId), { status: newStatus });
            setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
        } catch (e) { 
            alert("Error: " + e.message); 
        }
    };

    const handleDeleteContent = async (report) => {
        if(!window.confirm("⚠️ DANGER: This will permanently delete the reported content from the database. Are you sure?")) return;
        
        try {
            if (report.targetType === 'post' || report.targetType === 'comment') {
                await deleteDoc(doc(db, "posts", report.targetId));
            } else if (report.targetType === 'user') {
                alert("Please go to the 'Users' tab to safely delete a user account.");
                return;
            } else if (report.targetType === 'anime') {
                await deleteDoc(doc(db, "anime", report.targetId));
            } else if (report.targetType === 'manga') {
                await deleteDoc(doc(db, "manga", report.targetId));
            }

            await handleAction(report.id, 'resolved');
            alert(`Success! The ${report.targetType} has been permanently deleted.`);
        } catch (e) { 
            alert("Error deleting content: " + e.message); 
        }
    };

    const filteredReports = reports.filter(r => (r.status || 'pending') === filter);

    return (
        <div className="container" style={{ padding: 20 }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, flexWrap: 'wrap', gap: 15 }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={32} className="text-red-600"/> Moderation
                    </h1>
                    <p style={{ color: '#6b7280', marginTop: 5 }}>Review user reports and AI flags.</p>
                </div>
                
                {/* FILTER TABS & REFRESH BUTTON */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: 'white', padding: 5, borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', gap: 5 }}>
                        {['pending', 'resolved', 'dismissed'].map(f => (
                            <button 
                                key={f} 
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: filter === f ? (f === 'pending' ? '#fef2f2' : f === 'resolved' ? '#f0fdf4' : '#f3f4f6') : 'transparent',
                                    color: filter === f ? (f === 'pending' ? '#dc2626' : f === 'resolved' ? '#16a34a' : '#4b5563') : '#6b7280',
                                    fontWeight: 700,
                                    textTransform: 'capitalize',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    
                    <button 
                        onClick={() => fetchReports(true)}
                        disabled={loading}
                        style={{ padding: '8px 16px', borderRadius: 12, background: 'white', color: '#4b5563', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, height: 42 }}
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* REPORT LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>
                        <Loader2 className="animate-spin" style={{ margin: '0 auto 10px' }} /> Loading reports...
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 50, background: 'white', borderRadius: 16, border: '1px dashed #e5e7eb' }}>
                        <CheckCircle size={40} style={{ color: '#d1d5db', marginBottom: 10 }} />
                        <div style={{ fontWeight: 600, color: '#9ca3af' }}>No {filter} reports found.</div>
                    </div>
                ) : (
                    filteredReports.map(report => (
                        <div key={report.id} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'flex-start', borderLeft: report.reason?.startsWith('Auto-Flagged') ? '5px solid #9333ea' : report.reason === 'Spam' ? '5px solid #eab308' : '5px solid #dc2626', background:'white', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                            
                            <div style={{ width: 50, height: 50, borderRadius: 12, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {report.targetType === 'user' ? <User size={24} className="text-gray-500"/> : 
                                 report.targetType === 'comment' ? <MessageSquare size={24} className="text-blue-500"/> : 
                                 report.targetType === 'post' ? <FileText size={24} className="text-green-500"/> : 
                                 <Video size={24} className="text-purple-500"/>}
                            </div>

                            {/* CONTENT */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                                    <span style={{ 
                                        fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', 
                                        color: report.reason?.startsWith('Auto-Flagged') ? '#9333ea' : report.reason === 'Spam' ? '#ca8a04' : '#b91c1c', 
                                        background: report.reason?.startsWith('Auto-Flagged') ? '#faf5ff' : report.reason === 'Spam' ? '#fefce8' : '#fef2f2', 
                                        padding: '2px 8px', borderRadius: 4 
                                    }}>
                                        {report.reason || "Report"}
                                    </span>
                                    
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Clock size={12}/> 
                                        {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString() : 'Just now'}
                                    </span>
                                </div>
                                
                                <h3 style={{ margin: '0 0 5px 0', fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                                    Reported: {report.targetContent || "Unknown Content"}
                                </h3>
                                
                                <div style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    Reported by: 
                                    {report.reportedBy === "Gemini Auto-Mod" ? (
                                        <span style={{ fontWeight: 800, color: '#9333ea', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <Bot size={14}/> Gemini AI
                                        </span>
                                    ) : (
                                        <span style={{ fontWeight: 600, color: '#374151' }}>{report.reportedBy || "Anonymous"}</span>
                                    )}
                                </div>

                                {/* ✅ SURGICAL UPDATE: DISPLAY OFFENDER UID WITH COPY BUTTON */}
                                {report.userId && report.userId !== "Unknown" && (
                                    <div style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                                        Offender UID: 
                                        <span 
                                            onClick={() => { navigator.clipboard.writeText(report.userId); alert("UID Copied!"); }}
                                            style={{ fontFamily: 'monospace', color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                            title="Click to Copy UID"
                                        >
                                            {report.userId} <Copy size={12}/>
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ACTIONS */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {filter === 'pending' ? (
                                    <>
                                        <button 
                                            onClick={() => handleAction(report.id, 'resolved')}
                                            style={{ padding: '8px 15px', borderRadius: 8, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                                        >
                                            <CheckCircle size={14}/> Resolve
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleAction(report.id, 'dismissed')}
                                            style={{ padding: '8px 15px', borderRadius: 8, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                                        >
                                            <X size={14}/> Dismiss
                                        </button>

                                        <button 
                                            onClick={() => handleDeleteContent(report)}
                                            style={{ padding: '8px 15px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                                        >
                                            <Trash2 size={14}/> Delete
                                        </button>
                                    </>
                                ) : (
                                    <div style={{ padding: '5px 10px', background: report.status === 'resolved' ? '#dcfce7' : '#f3f4f6', color: report.status === 'resolved' ? '#166534' : '#4b5563', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase' }}>
                                        {report.status || filter}
                                    </div>
                                )}
                            </div>

                        </div>
                    ))
                )}
                
                {/* LOAD MORE BUTTON */}
                {hasMore && !loading && (
                    <div style={{padding: 10, textAlign:'center'}}>
                        <button 
                            onClick={() => fetchReports(false)} 
                            disabled={loadingMore}
                            style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', cursor: 'pointer', fontWeight: 'bold', color:'#4b5563' }}
                        >
                            {loadingMore ? <Loader2 className="animate-spin" size={14} /> : "Load More Reports"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}