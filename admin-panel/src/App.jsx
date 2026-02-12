import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, doc, getCountFromServer, getDoc, getDocs,
    limit, orderBy,
    query, serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import {
    Bell, BookOpen, ChevronDown, Edit, Eye, Flag,
    LayoutDashboard, LogOut, Menu, MessageSquare,
    Settings, ThumbsUp, TrendingUp, Users as UsersIcon, Video, X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// ✅ IMPORT PAGES
import Analytics from './Analytics';
import AnimeUpload from './AnimeUpload';
import Comments from './Comments';
import Login from './Login';
import MangaUpload from './MangaUpload';
import Notifications from './Notifications';
import Reports from './Reports';
import SettingsPage from './Settings';
import Users from './Users';
import { auth, db } from './firebase';

// --- HELPER: FORMAT DATES ---
const formatDateLabel = (date, range) => {
    if (range === '24h') return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// --- PROTECTED ROUTE ---
const ProtectedRoute = ({ role, allowedRoles, children }) => {
  if (!role) return <div style={{padding: '40px', textAlign: 'center'}}>Loading...</div>;
  if (!allowedRoles.includes(role)) {
    return <div style={{padding: '40px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold'}}>⛔ Access Denied</div>;
  }
  return children;
};

// --- DASHBOARD COMPONENT ---
function Dashboard({ role, userId }) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState('activity'); 
  const [timeRange, setTimeRange] = useState('24h'); 
  const [recentUsers, setRecentUsers] = useState([]); // ✅ Renamed to recentUsers to be clear
  const [chartData, setChartData] = useState([]); 
  const [contentList, setContentList] = useState([]); 
  const [stats, setStats] = useState({ users: 0, activeUsers: 0, anime: 0, manga: 0, reports: 0, totalViews: 0, totalLikes: 0 });

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isProducer = role === 'anime_producer' || role === 'manga_producer';

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isAdmin) {
            // ✅ 1. CHEAP COUNTS (Accurate Totals without reading docs)
            const usersCountSnap = await getCountFromServer(collection(db, "users"));
            
            // Active users in last 24h
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const activeCountSnap = await getCountFromServer(query(collection(db, "users"), where("lastActiveAt", ">=", yesterday)));

            const rSnap = await getCountFromServer(collection(db, "reports"));
            const aSnap = await getCountFromServer(collection(db, "anime"));
            const mSnap = await getCountFromServer(collection(db, "manga"));
            
            setStats(prev => ({ 
                ...prev, 
                users: usersCountSnap.data().count, 
                activeUsers: activeCountSnap.data().count,
                anime: aSnap.data().count, 
                manga: mSnap.data().count, 
                reports: rSnap.data().count 
            }));

            // ✅ 2. LIMITED FETCH FOR CHART (Prevents 100k read bomb)
            // We only fetch the last 500 users to generate the "Recent Trend" graph.
            const usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
            const usersSnapshot = await getDocs(usersQ);
            
            const usersData = usersSnapshot.docs.map(doc => ({
              id: doc.id, ...doc.data(),
              createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(0),
              lastActiveAt: doc.data().lastActiveAt?.toDate ? doc.data().lastActiveAt.toDate() : new Date(0), 
            }));
            setRecentUsers(usersData); 
        } 
        else if (isProducer) {
            const collectionName = role === 'anime_producer' ? 'anime' : 'manga';
            const q = query(collection(db, collectionName), where("uploaderId", "==", userId));
            const snapshot = await getDocs(q);
            const myContent = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setContentList(myContent);

            let views = 0, likes = 0;
            myContent.forEach(item => { views += (item.views || 0); likes += (item.likes || 0); });
            setStats({ users: 0, activeUsers: 0, anime: role === 'anime_producer' ? myContent.length : 0, manga: role === 'manga_producer' ? myContent.length : 0, reports: 0, totalViews: views, totalLikes: likes });

            const topContent = [...myContent].sort((a,b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
            setChartData(topContent.map(item => ({ name: item.title.length > 15 ? item.title.substring(0,12)+'...' : item.title, value: item.views || 0 })));
        }
      } catch (e) { console.error("Error fetching data:", e); }
    };
    if (role && userId) fetchData();
  }, [role, userId]); 

  // Filter Logic (Updated to work with recentUsers)
  useEffect(() => {
    if (!isAdmin || recentUsers.length === 0) return;
    const now = new Date();
    let startTime = new Date();
    let buckets = [];
    
    if (timeRange === '24h') {
        startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        for (let i = 6; i >= 0; i--) { const d = new Date(now.getTime() - (i * 4 * 60 * 60 * 1000)); buckets.push({ date: d, label: formatDateLabel(d, '24h') }); }
    } else if (timeRange === 'week') {
        startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - i); d.setHours(0,0,0,0); buckets.push({ date: d, label: formatDateLabel(d, 'week') }); }
    } else if (timeRange === 'month') {
        startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - (i * 5)); d.setHours(0,0,0,0); buckets.push({ date: d, label: formatDateLabel(d, 'month') }); }
    } else {
        startTime = new Date(0); 
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - (i * 5)); buckets.push({ date: d, label: formatDateLabel(d, 'month') }); }
    }

    // NOTE: We don't overwrite 'stats.users' here anymore because we fetched the REAL total count above safely.
    
    const processChart = buckets.map((bucket, index) => {
        const nextBucketDate = buckets[index + 1]?.date || new Date(); 
        let count = metric === 'registrations' 
            ? recentUsers.filter(u => u.createdAt >= bucket.date && u.createdAt < nextBucketDate).length
            : recentUsers.filter(u => u.lastActiveAt >= bucket.date && u.lastActiveAt < nextBucketDate).length;
        return { name: bucket.label, value: count };
    });
    setChartData(processChart);
  }, [timeRange, metric, recentUsers, isAdmin]);

  // --- RENDER PRODUCER ---
  if (isProducer) {
      // ... (Keep existing Producer Render exactly the same)
      return (
        <div className="dashboard-container">
            <h1 className="page-title"><Video className="text-blue"/> Studio Dashboard</h1>
            
            <div className="stats-grid">
                <div className="stat-card">
                    <p className="stat-label">Total Views</p>
                    <h2 className="stat-value blue"><Eye size={24}/> {stats.totalViews.toLocaleString()}</h2>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Total Likes</p>
                    <h2 className="stat-value green"><ThumbsUp size={24}/> {stats.totalLikes.toLocaleString()}</h2>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Uploads</p>
                    <h2 className="stat-value gray">
                        {role === 'anime_producer' ? <Video size={24}/> : <BookOpen size={24}/>} {role === 'anime_producer' ? stats.anime : stats.manga}
                    </h2>
                </div>
            </div>
            
            <div className="chart-container">
                <h3 className="chart-title">Top 5 Most Viewed</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} />
                        <Bar dataKey="value" fill={role === 'anime_producer' ? '#3b82f6' : '#8b5cf6'} radius={[4, 4, 0, 0]} barSize={50} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="table-wrapper">
                <div className="table-header">
                    <h3>My Library</h3>
                    <Link to={role === 'anime_producer' ? "/upload-anime" : "/upload-manga"} className="link-action">+ Upload New</Link>
                </div>
                <table className="data-table">
                    <thead><tr><th>Cover</th><th>Title</th><th>Views</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                        {contentList.map(item => (
                            <tr key={item.id}>
                                <td><img src={item.images?.jpg?.image_url} className="cover-img" /></td>
                                <td className="title-cell">{item.title}</td>
                                <td className="blue-text">{item.views || 0}</td>
                                <td><span className="status-badge">{item.status || 'Ongoing'}</span></td>
                                <td><button onClick={() => navigate(role === 'anime_producer' ? '/upload-anime' : '/upload-manga', { state: { editId: item.id } })} className="btn-edit"><Edit size={14}/> Edit</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      );
  }

  // --- RENDER ADMIN ---
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="page-title">System Overview</h1>
        <div className="controls">
            <div className="select-wrapper">
                <select className="dropdown" value={metric} onChange={(e) => setMetric(e.target.value)}>
                    <option value="registrations">Registrations</option>
                    <option value="activity">User Activity</option>
                </select>
                <ChevronDown className="select-icon" size={16} />
            </div>
            <div className="select-wrapper">
                <select className="dropdown" value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                    <option value="24h">Last 24 Hours</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                </select>
                <ChevronDown className="select-icon" size={16} />
            </div>
        </div>
      </div>

      <div className="chart-container">
        <h3 className="chart-header-text">
            {metric === 'registrations' ? '📈 Registration Growth' : '🔥 Activity Trends'}
            <span className="badge">{timeRange === '24h' ? '24 HOURS' : timeRange === 'week' ? '7 DAYS' : timeRange === 'month' ? '30 DAYS' : 'ALL TIME'}</span>
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metric === 'registrations' ? "#2563eb" : "#16a34a"} stopOpacity={0.1}/>
                <stop offset="95%" stopColor={metric === 'registrations' ? "#2563eb" : "#16a34a"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Area 
                type="monotone" 
                dataKey="value" 
                stroke={metric === 'registrations' ? "#2563eb" : "#16a34a"} 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
            <p className="stat-label">{timeRange === 'all' ? 'Total Users' : 'Total Users'}</p>
            <h2 className="stat-value">{stats.users.toLocaleString()}</h2>
        </div>
        <div className="stat-card">
            <p className="stat-label">Active Users (24h)</p>
            <h2 className="stat-value green">{stats.activeUsers.toLocaleString()}</h2>
        </div>
        <div className="stat-card">
            <p className="stat-label">Total Anime</p>
            <h2 className="stat-value blue">{stats.anime}</h2>
        </div>
        <div className="stat-card">
            <p className="stat-label">Total Manga</p>
            <h2 className="stat-value purple">{stats.manga}</h2>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">User Management</h2>
        <div className="table-wrapper"><Users /></div>
      </div>
    </div>
  );
}

// --- LAYOUT COMPONENT (STANDARD CSS) ---
function Layout({ logout, role, userId }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? "nav-item active" : "nav-item";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isAnimeProducer = role === 'anime_producer';
  const isMangaProducer = role === 'manga_producer';

  // Admin Heartbeat
  useEffect(() => {
    const updateHeartbeat = async () => {
        if (userId) {
            try { await updateDoc(doc(db, "users", userId), { lastActiveAt: serverTimestamp(), isOnline: true }); } 
            catch (e) { console.error("Heartbeat fail", e); }
        }
    };
    updateHeartbeat();
    const interval = setInterval(updateHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location]);

  return (
    <>
    <style>{`
        /* --- LAYOUT STYLES --- */
        .app-wrapper { display: flex; height: 100vh; background-color: #f9fafb; font-family: sans-serif; overflow: hidden; }
        
        /* Sidebar */
        .sidebar { width: 260px; background: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; z-index: 50; transition: transform 0.3s ease; }
        .sidebar-header { padding: 24px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
        .brand { font-size: 1.25rem; font-weight: 900; color: #2563eb; letter-spacing: -0.5px; margin: 0; }
        .brand-role { color: #9ca3af; font-weight: 400; font-size: 0.85rem; margin-left: 5px; }
        .close-btn { background: none; border: none; color: #6b7280; cursor: pointer; display: none; }
        
        .nav-menu { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .nav-label { padding: 16px 16px 8px; font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: #4b5563; text-decoration: none; font-weight: 500; transition: all 0.2s; }
        .nav-item:hover { background-color: #f3f4f6; }
        .nav-item.active { background-color: #eff6ff; color: #2563eb; font-weight: 600; }
        
        .sidebar-footer { padding: 16px; border-top: 1px solid #f3f4f6; }
        .btn-logout { w-width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #ef4444; background: none; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; width: 100%; text-align: left; }
        .btn-logout:hover { background-color: #fef2f2; }

        /* Main Content */
        .main-wrapper { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .mobile-header { display: none; height: 64px; background: white; border-bottom: 1px solid #e5e7eb; align-items: center; justify-content: space-between; padding: 0 16px; z-index: 40; }
        .mobile-menu-btn { background: none; border: none; color: #4b5563; cursor: pointer; }
        .content-area { flex: 1; overflow-y: auto; padding: 0; }

        /* Mobile Overlay */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 45; display: none; }

        /* --- DASHBOARD STYLES --- */
        .dashboard-container { padding: 24px; max-width: 1400px; margin: 0 auto; }
        .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .page-title { font-size: 1.5rem; font-weight: 800; margin: 0; color: #111827; }
        .controls { display: flex; gap: 12px; }
        .select-wrapper { position: relative; }
        .dropdown { appearance: none; background: white; border: 1px solid #e5e7eb; padding: 8px 32px 8px 16px; border-radius: 8px; font-weight: 500; color: #374151; cursor: pointer; outline: none; }
        .select-icon { position: absolute; right: 10px; top: 10px; color: #6b7280; pointer-events: none; }

        .chart-container { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; height: 320px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 24px; }
        .chart-header-text { font-size: 0.875rem; font-weight: 700; color: #9ca3af; margin-bottom: 16px; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
        .badge { background: #f3f4f6; color: #4b5563; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }

        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 24px; }
        .stat-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-label { font-size: 0.875rem; font-weight: 500; color: #6b7280; margin: 0; }
        .stat-value { font-size: 1.875rem; font-weight: 800; margin: 8px 0 0; color: #1f2937; display:flex; align-items:center; gap:10px; }
        .stat-value.green { color: #16a34a; }
        .stat-value.blue { color: #2563eb; }
        .stat-value.purple { color: #7c3aed; }
        .stat-value.red { color: #ef4444; }
        
        .section { margin-top: 32px; }
        .section-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; color: #111827; }
        .table-wrapper { background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow-x: auto; }
        
        /* Producer Table Styles */
        .table-header { padding: 20px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
        .link-action { color: #2563eb; font-weight: 700; font-size: 0.875rem; text-decoration: none; }
        .data-table { width: 100%; border-collapse: collapse; text-align: left; }
        .data-table th { padding: 16px; background: #f9fafb; font-size: 0.875rem; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
        .data-table td { padding: 16px; border-bottom: 1px solid #f3f4f6; font-size: 0.875rem; color: #374151; vertical-align: middle; }
        .cover-img { width: 40px; height: 56px; object-fit: cover; border-radius: 4px; }
        .title-cell { font-weight: 700; color: #1f2937; }
        .status-badge { background: #f3f4f6; color: #4b5563; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; }
        .btn-edit { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 6px; }

        /* RESPONSIVE MEDIA QUERIES */
        @media (max-width: 1024px) {
            .stats-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 768px) {
            .sidebar { position: fixed; inset: 0; transform: translateX(-100%); width: 260px; height: 100%; }
            .sidebar.open { transform: translateX(0); }
            .close-btn { display: block; }
            .mobile-header { display: flex; }
            .overlay.open { display: block; }
            
            .dashboard-container { padding: 16px; }
            .stats-grid { grid-template-columns: 1fr; }
            .dashboard-header { flex-direction: column; align-items: flex-start; }
            .controls { width: 100%; }
            .select-wrapper { flex: 1; }
            .dropdown { width: 100%; }
        }
    `}</style>

    <div className="app-wrapper">
      
      {/* Mobile Overlay */}
      <div className={`overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="brand">
            AniYu<span className="brand-role">
              {isSuperAdmin ? 'Owner' : isAdmin ? 'Admin' : 'Studio'}
            </span>
          </h1>
          <button onClick={() => setSidebarOpen(false)} className="close-btn">
            <X size={24} />
          </button>
        </div>
        
        <nav className="nav-menu">
          <Link to="/" className={isActive('/')}>
            <LayoutDashboard size={20} /> <span>Dashboard</span>
          </Link>
          
          <div className="nav-label">Content</div>
          
          {(isAnimeProducer || isAdmin) && (
            <Link to="/upload-anime" className={isActive('/upload-anime')}>
                <Video size={20} /> <span>Anime Upload</span>
            </Link>
          )}
          
          {(isMangaProducer || isAdmin) && (
            <Link to="/upload-manga" className={isActive('/upload-manga')}>
                <BookOpen size={20} /> <span>Manga Upload</span>
            </Link>
          )}

          {isAdmin && (
            <>
                <div className="nav-label">Management</div>
                <Link to="/notifications" className={isActive('/notifications')}>
                    <Bell size={20} /> <span>Notifications</span>
                </Link>
                <Link to="/reports" className={isActive('/reports')}>
                    <Flag size={20} /> <span>Reports</span>
                </Link>
                <Link to="/users" className={isActive('/users')}>
                    <UsersIcon size={20} /> <span>Users</span>
                </Link>
                {/* ✅ COMMENTS LINK */}
                <Link to="/comments" className={isActive('/comments')}>
                    <MessageSquare size={20} /> <span>Comments</span>
                </Link>
                {/* ✅ ANALYTICS LINK */}
                <Link to="/analytics" className={isActive('/analytics')}>
                    <TrendingUp size={20} /> <span>Analytics</span>
                </Link>
                {/* ✅ SETTINGS LINK */}
                <Link to="/settings" className={isActive('/settings')}>
                    <Settings size={20} /> <span>Settings</span>
                </Link>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <button onClick={logout} className="btn-logout">
            <LogOut size={20} /> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-wrapper">
        <header className="mobile-header">
            <button onClick={() => setSidebarOpen(true)} className="mobile-menu-btn">
                <Menu size={24} />
            </button>
            <span style={{fontWeight: '700', fontSize: '1.1rem', color:'#1f2937'}}>Admin Panel</span>
            <div style={{width: 24}}></div> 
        </header>

        <main className="content-area">
            <Routes>
                <Route path="/" element={<Dashboard role={role} userId={userId} />} />
                
                <Route path="/upload-anime" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin', 'anime_producer']}>
                        <AnimeUpload />
                    </ProtectedRoute>
                } />
                
                <Route path="/upload-manga" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin', 'manga_producer']}>
                        <MangaUpload />
                    </ProtectedRoute>
                } />

                <Route path="/notifications" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Notifications />
                    </ProtectedRoute>
                } />

                <Route path="/reports" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Reports />
                    </ProtectedRoute>
                } />

                <Route path="/users" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Users />
                    </ProtectedRoute>
                } />

                {/* ✅ COMMENTS ROUTE */}
                <Route path="/comments" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Comments />
                    </ProtectedRoute>
                } />

                {/* ✅ ANALYTICS ROUTE */}
                <Route path="/analytics" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Analytics />
                    </ProtectedRoute>
                } />

                {/* ✅ SETTINGS ROUTE */}
                <Route path="/settings" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <SettingsPage />
                    </ProtectedRoute>
                } />
            </Routes>
        </main>
      </div>
    </div>
    </>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() { 
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
          try {
            const userDoc = await getDoc(doc(db, "users", u.uid));
            if (userDoc.exists()) {
                setRole(userDoc.data().role);
            }
          } catch(e) { console.error(e); }
          setUser(u);
      } else {
          setUser(null);
          setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = () => { auth.signOut(); };

  if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: 'bold'}}>Loading Admin Panel...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/*" element={user ? <Layout logout={handleLogout} role={role} userId={user.uid} /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  ); 
}