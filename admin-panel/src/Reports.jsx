import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, startAfter, updateDoc } from 'firebase/firestore';
import {
    AlertTriangle, // ✅ IMPORTED ALERT TRIANGLE
    Bot,
    CheckCircle,
    Clock,
    Copy,
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
        <div className="container" style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, flexWrap: 'wrap', gap: 15 }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10, color: '#1f2937' }}>
                        <Shield size={32} color="#dc2626"/> Moderation Queue
                    </h1>
                    <p style={{ color: '#6b7280', marginTop: 5, fontSize: '0.95rem' }}>Review user reports and AI-flagged content.</p>
                </div>
                
                {/* FILTER TABS & REFRESH BUTTON */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: 'white', padding: 5, borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', gap: 5, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
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
                        title="Refresh Queue"
                        style={{ padding: '8px 16px', borderRadius: 12, background: 'white', color: '#4b5563', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, height: 42, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* REPORT LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>
                        <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 10px', color: '#dc2626' }} /> 
                        <div style={{fontWeight: 600}}>Loading moderation queue...</div>
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, background: 'white', borderRadius: 16, border: '2px dashed #e5e7eb' }}>
                        <CheckCircle size={48} style={{ color: '#d1d5db', marginBottom: 15 }} />
                        <h3 style={{ margin: 0, color: '#4b5563', fontSize: '1.2rem' }}>All Caught Up!</h3>
                        <div style={{ color: '#9ca3af', marginTop: 5 }}>No {filter} reports in the queue right now.</div>
                    </div>
                ) : (
                    filteredReports.map(report => {
                        // ✅ SURGICAL ADDITION: Determine Card Styling based on AI vs User Report
                        const isAutoFlagged = report.reason?.toLowerCase().includes('auto-flagged') || report.reportedBy === "Gemini Auto-Mod";
                        const isSpam = report.reason?.toLowerCase().includes('spam');
                        const borderColor = isAutoFlagged ? '#9333ea' : isSpam ? '#eab308' : '#dc2626';
                        const badgeBg = isAutoFlagged ? '#faf5ff' : isSpam ? '#fefce8' : '#fef2f2';
                        const badgeColor = isAutoFlagged ? '#9333ea' : isSpam ? '#ca8a04' : '#b91c1c';

                        return (
                            <div key={report.id} style={{ 
                                display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', 
                                borderLeft: `5px solid ${borderColor}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' 
                            }}>
                                
                                {/* TOP ROW: Metadata & Type */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#fafaf9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* Target Type Badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, color: '#4b5563', textTransform: 'uppercase' }}>
                                            {report.targetType === 'user' ? <User size={14} color="#6b7280"/> : 
                                             report.targetType === 'comment' ? <MessageSquare size={14} color="#3b82f6"/> : 
                                             report.targetType === 'post' ? <FileText size={14} color="#10b981"/> : 
                                             <Video size={14} color="#8b5cf6"/>}
                                            {report.targetType || 'Unknown'}
                                        </div>

                                        {/* Reason Badge */}
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: badgeColor, background: badgeBg, padding: '4px 10px', borderRadius: 20 }}>
                                            {report.reason || "Reported"}
                                        </span>
                                    </div>
                                    
                                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                                        <Clock size={14}/> 
                                        {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString() : 'Just now'}
                                    </span>
                                </div>

                                {/* MIDDLE ROW: The Content & Details */}
                                <div style={{ padding: '20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                    
                                    {/* The Reported Content Block */}
                                    <div style={{ flex: '1 1 300px' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <AlertTriangle size={14} color="#dc2626"/> Flagged Content
                                        </div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', color: '#1f2937', fontSize: '0.95rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                            {report.targetContent || <span style={{color: '#9ca3af', fontStyle: 'italic'}}>No content provided.</span>}
                                        </div>
                                    </div>

                                    {/* The People Block (Reporter & Offender) */}
                                    <div style={{ width: 250, display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '1px solid #e5e7eb', paddingLeft: 24 }}>
                                        
                                        {/* Reporter */}
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Reported By</div>
                                            {isAutoFlagged ? (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3e8ff', color: '#7e22ce', padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700, border: '1px solid #e9d5ff' }}>
                                                    <Bot size={16}/> Gemini Auto-Mod
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
                                                    <User size={16} color="#9ca3af"/> {report.reportedBy || "Anonymous"}
                                                </div>
                                            )}
                                        </div>

                                        {/* Offender */}
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Offender UID</div>
                                            {report.userId && report.userId !== "Unknown" ? (
                                                <div 
                                                    onClick={() => { navigator.clipboard.writeText(report.userId); alert("UID Copied!"); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s' }}
                                                    title="Click to Copy UID"
                                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                                                >
                                                    {report.userId.substring(0, 15)}... <Copy size={14}/>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>Unknown User</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* BOTTOM ROW: Actions */}
                                <div style={{ background: '#f9fafb', padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                    {filter === 'pending' ? (
                                        <>
                                            <button 
                                                onClick={() => handleAction(report.id, 'dismissed')}
                                                style={{ padding: '8px 16px', borderRadius: 8, background: 'white', color: '#4b5563', border: '1px solid #d1d5db', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', transition: 'all 0.2s' }}
                                                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.color = '#1f2937'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#4b5563'; }}
                                            >
                                                <X size={16}/> Dismiss Report
                                            </button>

                                            <button 
                                                onClick={() => handleAction(report.id, 'resolved')}
                                                style={{ padding: '8px 16px', borderRadius: 8, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', transition: 'all 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#bbf7d0'}
                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dcfce7'}
                                            >
                                                <CheckCircle size={16}/> Mark Resolved
                                            </button>

                                            <button 
                                                onClick={() => handleDeleteContent(report)}
                                                style={{ padding: '8px 16px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', marginLeft: '10px', transition: 'all 0.2s' }}
                                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                                            >
                                                <Trash2 size={16}/> Delete Content
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: report.status === 'resolved' ? '#dcfce7' : '#f3f4f6', color: report.status === 'resolved' ? '#166534' : '#4b5563', borderRadius: 20, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', border: `1px solid ${report.status === 'resolved' ? '#bbf7d0' : '#e5e7eb'}` }}>
                                            {report.status === 'resolved' ? <CheckCircle size={14}/> : <X size={14}/>}
                                            {report.status || filter}
                                        </div>
                                    )}
                                </div>

                            </div>
                        );
                    })
                )}
                
                {/* LOAD MORE BUTTON */}
                {hasMore && !loading && (
                    <div style={{padding: '10px 0', textAlign:'center'}}>
                        <button 
                            onClick={() => fetchReports(false)} 
                            disabled={loadingMore}
                            style={{ padding: '12px 24px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 'bold', color:'#4b5563', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            {loadingMore ? <Loader2 className="animate-spin" size={18} style={{margin: '0 auto'}} /> : "Load More Reports"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}