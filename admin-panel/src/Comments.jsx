import {
    collection, deleteDoc, doc, getDoc, getDocs,
    limit, orderBy, query, serverTimestamp,
    startAfter,
    where, writeBatch
} from 'firebase/firestore';
import {
    Ban, ChevronDown, ChevronUp, Clock, Copy, FileText, // ✅ IMPORTED COPY ICON
    Loader2, MessageSquare, RefreshCw, Search, ShieldAlert, Trash2, User
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';

// --- HELPER: FORMAT DATES ---
const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
};

export default function Comments() {
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [commentsMap, setCommentsMap] = useState({}); 
    const [loading, setLoading] = useState(false);
    const [expandedPostId, setExpandedPostId] = useState(null); 
    const [loadingComments, setLoadingComments] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionLoading, setActionLoading] = useState(null);

    // PAGINATION STATE
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        fetchPosts(true);
    }, []);

    const fetchPosts = async (isFirstLoad = false) => {
        if (loading || loadingMore || (!isFirstLoad && !hasMore)) return;

        if (isFirstLoad) setLoading(true);
        else setLoadingMore(true);

        try {
            let q = query(
                collection(db, "posts"), 
                orderBy("createdAt", "desc"), 
                limit(20) 
            );

            if (!isFirstLoad && lastVisible) {
                q = query(
                    collection(db, "posts"), 
                    orderBy("createdAt", "desc"), 
                    startAfter(lastVisible),
                    limit(20)
                );
            }

            const snap = await getDocs(q);
            const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const mainPosts = allItems.filter(item => !item.parentId);

            if (snap.docs.length > 0) setLastVisible(snap.docs[snap.docs.length - 1]);
            if (snap.docs.length < 20) setHasMore(false);

            setPosts(prev => isFirstLoad ? mainPosts : [...prev, ...mainPosts]);

        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const fetchCommentsForPost = async (postId) => {
        if (commentsMap[postId]) return; 
        setLoadingComments(true);
        try {
            const q = query(
                collection(db, "posts"), 
                where("parentId", "==", postId),
                orderBy("createdAt", "desc"),
                limit(50) 
            );
            const snap = await getDocs(q);
            const postComments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCommentsMap(prev => ({ ...prev, [postId]: postComments }));
        } catch (e) {
            console.error("Error fetching sub-comments:", e);
        } finally {
            setLoadingComments(false);
        }
    };

    const togglePost = (postId) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null); 
        } else {
            setExpandedPostId(postId); 
            fetchCommentsForPost(postId); 
        }
    };

    const handleViewProfile = (userId) => {
        if (userId) {
            navigate('/users', { state: { targetUserId: userId } });
        }
    };

    // --- ACTIONS (Delete / Ban) ---

    const handleDelete = async (itemId, isMainPost, parentId = null) => {
        if (!window.confirm("Are you sure you want to delete this content?")) return;
        setActionLoading(itemId);
        try {
            await deleteDoc(doc(db, "posts", itemId));
            
            if (isMainPost) {
                setPosts(prev => prev.filter(p => p.id !== itemId));
            } else {
                setCommentsMap(prev => ({
                    ...prev,
                    [parentId]: prev[parentId].filter(c => c.id !== itemId)
                }));
            }
        } catch (e) {
            alert("Error deleting: " + e.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleBanUser = async (item, isMainPost, parentId = null) => {
        if (!window.confirm(`Ban user @${item.username || 'unknown'}?`)) return;
        setActionLoading(item.id);
        
        try {
            const batch = writeBatch(db); 
            
            const userRef = doc(db, "users", item.userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const banExpires = new Date();
                banExpires.setHours(banExpires.getHours() + 24); 
                
                batch.update(userRef, {
                    isBanned: true,
                    banExpiresAt: banExpires,
                    banCount: (userSnap.data().banCount || 0) + 1
                });

                const notifRef = doc(collection(db, "users", item.userId, "notifications"));
                batch.set(notifRef, {
                    title: "Account Suspended ⛔",
                    body: `You have been banned for 24h due to offensive content.`,
                    read: false,
                    createdAt: serverTimestamp(),
                    type: 'system'
                });

                const postRef = doc(db, "posts", item.id);
                batch.delete(postRef);

                await batch.commit();

                alert(`User @${item.username} has been banned and content removed.`);

                if (isMainPost) {
                    setPosts(prev => prev.filter(p => p.id !== item.id));
                } else {
                    setCommentsMap(prev => ({
                        ...prev,
                        [parentId]: prev[parentId].filter(c => c.id !== item.id)
                    }));
                }

            } else {
                alert(`User document not found. Deleting content only.`);
                await deleteDoc(doc(db, "posts", item.id));
                 if (isMainPost) {
                    setPosts(prev => prev.filter(p => p.id !== item.id));
                } else {
                    setCommentsMap(prev => ({
                        ...prev,
                        [parentId]: prev[parentId].filter(c => c.id !== item.id)
                    }));
                }
            }

        } catch (e) {
            console.error(e);
            alert("Error: " + e.message);
        } finally {
            setActionLoading(null);
        }
    };

    const filteredPosts = posts.filter(p => 
        p.text?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
        <style>{`
            .page-container { padding: 24px; max-width: 900px; margin: 0 auto; }
            .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 15px; flex-wrap: wrap; }
            .page-title { font-size: 1.5rem; font-weight: 800; display: flex; align-items: center; gap: 10px; color: #1f2937; margin: 0; }
            
            .search-box { position: relative; width: 300px; max-width: 100%; }
            .search-input { width: 100%; padding: 10px 10px 10px 40px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; }
            .search-icon { position: absolute; left: 12px; top: 12px; color: #9ca3af; }

            .btn-refresh { display: flex; align-items: center; justify-content: center; padding: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; color: #4b5563; cursor: pointer; transition: all 0.2s; }
            .btn-refresh:hover { background: #f9fafb; color: #2563eb; border-color: #bfdbfe; }

            /* POST CARD */
            .post-card { background: white; border-radius: 12px; border: 1px solid #e5e7eb; margin-bottom: 20px; overflow: hidden; transition: box-shadow 0.2s; }
            .post-card:hover { box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            
            .post-header { padding: 20px; display: flex; gap: 15px; }
            .avatar { width: 45px; height: 45px; border-radius: 50%; background: #f3f4f6; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; } 
            .avatar:hover { opacity: 0.8; }
            .avatar img { width: 100%; height: 100%; object-fit: cover; }
            
            .post-content { flex: 1; }
            .meta-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
            .username { font-weight: 700; color: #111827; cursor: pointer; } 
            .username:hover { color: #2563eb; text-decoration: underline; }

            .time { font-size: 0.8rem; color: #9ca3af; display: flex; align-items: center; gap: 4px; }
            
            .text-content { color: #374151; line-height: 1.5; font-size: 0.95rem; white-space: pre-wrap; margin-bottom: 10px; }
            .media-indicator { font-size: 0.8rem; color: #2563eb; display: flex; align-items: center; gap: 5px; background: #eff6ff; padding: 5px 10px; border-radius: 6px; width: fit-content; }

            /* AI FLAG STYLING */
            .ai-flag { margin-top: 10px; padding: 6px 10px; background-color: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #9333ea; font-weight: 700; flex-wrap: wrap; }
            .uid-copy-btn { margin-left: 8px; padding: 2px 6px; background-color: #f3e8ff; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; color: #7e22ce; font-family: monospace; font-size: 0.7rem; border: 1px solid #d8b4fe; }
            .uid-copy-btn:hover { background-color: #e9d5ff; }

            .post-footer { background: #f9fafb; padding: 10px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
            .comment-toggle { border: none; background: none; font-weight: 600; color: #4b5563; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
            .comment-toggle:hover { color: #2563eb; }

            .action-group { display: flex; gap: 8px; }
            .btn-action { padding: 6px 10px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 600; }
            .btn-delete { background: white; color: #ef4444; border-color: #fecaca; }
            .btn-delete:hover { background: #fee2e2; }
            .btn-ban { background: white; color: #4b5563; border-color: #e5e7eb; }
            .btn-ban:hover { background: #f3f4f6; color: #111827; }

            .btn-load-more { width: 100%; padding: 15px; margin-top: 10px; background-color: #f3f4f6; border: none; border-radius: 8px; font-weight: bold; color: #4b5563; cursor: pointer; transition: background-color 0.2s; }
            .btn-load-more:hover { background-color: #e5e7eb; }
            .btn-load-more:disabled { opacity: 0.5; cursor: not-allowed; }

            /* DROPDOWN COMMENTS AREA */
            .comments-section { background: #f8fafc; border-top: 1px solid #e5e7eb; padding: 0 20px 20px 20px; animation: slideDown 0.2s ease-out; }
            .comments-header { font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; padding: 15px 0 10px; display: block; border-bottom: 1px dashed #cbd5e1; margin-bottom: 10px; }
            
            .comment-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
            .comment-item:last-child { border-bottom: none; }
            .comment-avatar { width: 30px; height: 30px; border-radius: 50%; background: #e2e8f0; overflow: hidden; flex-shrink: 0; cursor: pointer; } 
            .comment-avatar:hover { opacity: 0.8; }
            .comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
            
            .comment-body { flex: 1; }
            .comment-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
            .comment-user { font-weight: 700; font-size: 0.85rem; color: #334155; cursor: pointer; } 
            .comment-user:hover { color: #2563eb; }
            
            .comment-text { font-size: 0.9rem; color: #475569; line-height: 1.4; }
            .comment-actions { display: flex; gap: 5px; }
            .icon-btn { padding: 4px; border: none; background: none; cursor: pointer; color: #94a3b8; border-radius: 4px; }
            .icon-btn:hover { background: #e2e8f0; color: #475569; }
            .icon-btn.danger:hover { background: #fee2e2; color: #ef4444; }

            @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
            
            @media (max-width: 768px) {
                .page-container { padding: 15px; }
                .header-bar { flex-direction: column; align-items: stretch; }
                .search-box { width: 100%; }
            }
        `}</style>

        <div className="page-container">
            <div className="header-bar">
                <h1 className="page-title">
                    <MessageSquare size={28} className="text-blue-600" color="#2563eb"/> Moderation Feed
                </h1>
                
                <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 350 }}>
                    <div className="search-box" style={{ flex: 1 }}>
                        <Search className="search-icon" size={18}/>
                        <input 
                            type="text" 
                            className="search-input" 
                            placeholder="Search posts or users..." 
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => fetchPosts(true)} 
                        className="btn-refresh"
                        title="Refresh Data"
                        disabled={loading}
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            <div className="feed">
                {loading ? (
                    <div style={{textAlign:'center', padding:40, color:'#9ca3af'}}>Loading feed...</div>
                ) : filteredPosts.length === 0 ? (
                    <div style={{textAlign:'center', padding:40, color:'#9ca3af'}}>No posts found.</div>
                ) : (
                    filteredPosts.map(post => (
                        <div key={post.id} className="post-card">
                            {/* MAIN POST CONTENT */}
                            <div className="post-header">
                                <div className="avatar" onClick={() => handleViewProfile(post.userId)} title="View Profile">
                                    {post.userAvatar ? <img src={post.userAvatar} /> : <User size={20} color="#9ca3af"/>}
                                </div>
                                <div className="post-content">
                                    <div className="meta-row">
                                        <span className="username" onClick={() => handleViewProfile(post.userId)} title="View Profile">
                                            {post.displayName || post.username || 'Anonymous'}
                                        </span>
                                        <span className="time"><Clock size={12}/> {formatDate(post.createdAt)}</span>
                                    </div>
                                    <div className="text-content">
                                        {post.text || <span style={{fontStyle:'italic', color:'#9ca3af'}}>No text content</span>}
                                    </div>
                                    
                                    {/* ✅ SURGICAL UPDATE: Display Gemini Flag with Copy UID Button */}
                                    {post.moderationFlag && (
                                        <div className="ai-flag">
                                            <ShieldAlert size={14} /> AI Flagged: {post.moderationFlag}
                                            <span 
                                                className="uid-copy-btn"
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    navigator.clipboard.writeText(post.flaggedUserUid || post.userId); 
                                                    alert("UID Copied!"); 
                                                }}
                                                title="Copy Offender UID"
                                            >
                                                <Copy size={12} /> {post.flaggedUserUid || post.userId}
                                            </span>
                                        </div>
                                    )}

                                    {post.mediaUrl && (
                                        <div className="media-indicator" style={{ marginTop: post.moderationFlag ? 10 : 0 }}>
                                            <FileText size={14}/> Attachment
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* FOOTER ACTIONS */}
                            <div className="post-footer">
                                <button className="comment-toggle" onClick={() => togglePost(post.id)}>
                                    {expandedPostId === post.id ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                    {post.commentCount || 0} Comments
                                </button>

                                <div className="action-group">
                                    <button 
                                        className="btn-action btn-ban"
                                        onClick={() => handleBanUser(post, true)}
                                        disabled={actionLoading === post.id}
                                    >
                                        <Ban size={14}/> Ban
                                    </button>
                                    <button 
                                        className="btn-action btn-delete"
                                        onClick={() => handleDelete(post.id, true)}
                                        disabled={actionLoading === post.id}
                                    >
                                        {actionLoading === post.id ? <Loader2 className="animate-spin" size={14}/> : <Trash2 size={14}/>} Delete
                                    </button>
                                </div>
                            </div>

                            {/* COMMENTS DROPDOWN SECTION */}
                            {expandedPostId === post.id && (
                                <div className="comments-section">
                                    <span className="comments-header">Replies</span>
                                    
                                    {loadingComments ? (
                                        <div style={{padding:10, textAlign:'center', color:'#9ca3af', fontSize:'0.8rem'}}>Loading comments...</div>
                                    ) : (commentsMap[post.id] && commentsMap[post.id].length > 0) ? (
                                        commentsMap[post.id].map(comment => (
                                            <div key={comment.id} className="comment-item">
                                                <div className="comment-avatar" onClick={() => handleViewProfile(comment.userId)} title="View Profile">
                                                    {comment.userAvatar ? <img src={comment.userAvatar} /> : <User size={16} color="#9ca3af"/>}
                                                </div>
                                                <div className="comment-body">
                                                    <div className="comment-meta">
                                                        <span className="comment-user" onClick={() => handleViewProfile(comment.userId)}>
                                                            @{comment.username}
                                                        </span>
                                                        <div className="comment-actions">
                                                            <button 
                                                                className="icon-btn" 
                                                                title="Ban User"
                                                                onClick={() => handleBanUser(comment, false, post.id)}
                                                            >
                                                                <Ban size={14}/>
                                                            </button>
                                                            <button 
                                                                className="icon-btn danger" 
                                                                title="Delete Comment"
                                                                onClick={() => handleDelete(comment.id, false, post.id)}
                                                            >
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="comment-text">{comment.text}</div>
                                                    
                                                    {/* ✅ SURGICAL UPDATE: Display Gemini Flag on Comments with Copy UID */}
                                                    {comment.moderationFlag && (
                                                        <div className="ai-flag" style={{ marginTop: 6, fontSize: '0.7rem', padding: '4px 8px' }}>
                                                            <ShieldAlert size={12} /> AI Flagged: {comment.moderationFlag}
                                                            <span 
                                                                className="uid-copy-btn"
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    navigator.clipboard.writeText(comment.flaggedUserUid || comment.userId); 
                                                                    alert("UID Copied!"); 
                                                                }}
                                                                title="Copy Offender UID"
                                                            >
                                                                <Copy size={10} /> {comment.flaggedUserUid || comment.userId}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{padding:10, textAlign:'center', color:'#9ca3af', fontSize:'0.8rem', fontStyle:'italic'}}>No comments yet.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
                
                {/* LOAD MORE BUTTON */}
                {hasMore && !loading && (
                    <div style={{padding: 10}}>
                        <button 
                            className="btn-load-more" 
                            onClick={() => fetchPosts(false)} 
                            disabled={loadingMore}
                        >
                            {loadingMore ? <Loader2 className="animate-spin" style={{margin:'0 auto'}}/> : "Load More Posts"}
                        </button>
                    </div>
                )}
            </div>
        </div>
        </>
    );
}