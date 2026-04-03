import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, doc, getCountFromServer, getDoc, getDocs,
    limit,
    onSnapshot,
    orderBy, // ✅ SURGICAL ADDITION: Added onSnapshot
    query, serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import {
    Bell, BookOpen, ChevronDown, DollarSign, Edit, Eye, Flag,
    LayoutDashboard, LifeBuoy,
    LogOut, Menu, MessageSquare, PieChart as PieChartIcon, RefreshCw, Settings, ShieldAlert, ThumbsUp, TrendingUp, Users as UsersIcon, Video, X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react'; // ✅ SURGICAL ADDITION: Added useRef
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// ✅ IMPORT PAGES
import Affiliate from './Affiliate';
import AnimeUpload from './AnimeUpload';
import Comments from './Comments';
import Login from './Login';
import MangaUpload from './MangaUpload';
import Notifications from './Notifications';
import Reports from './Reports';
import SettingsPage from './Settings';
import Support from './Support';
import Users from './Users';
import { auth, db } from './firebase';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

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
  const [recentUsers, setRecentUsers] = useState([]); 
  const [chartData, setChartData] = useState([]); 
  const [contentList, setContentList] = useState([]); 
  const [stats, setStats] = useState({ users: 0, activeUsers: 0, anime: 0, manga: 0, reports: 0, totalViews: 0, totalLikes: 0 });

  // Embedded Analytics State
  const [topAnime, setTopAnime] = useState([]);
  const [topManga, setTopManga] = useState([]);
  const [genreData, setGenreData] = useState([]);
  const [growthData, setGrowthData] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isProducer = role === 'anime_producer' || role === 'manga_producer';

  // --- FETCH ADVANCED ANALYTICS ---
  // ✅ BUG 40 FIX: Accept the already-downloaded usersList to prevent redundant queries
  const fetchAnalytics = async (usersList, forceRefresh = false) => {
    if (!isAdmin) return;
    setAnalyticsLoading(true);
    try {
        const CACHE_KEY = 'admin_analytics_cache';
        if (!forceRefresh) {
            const cachedData = sessionStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                setTopAnime(parsed.topAnime);
                setTopManga(parsed.topManga);
                setGenreData(parsed.genreData);
                setGrowthData(parsed.growthData);
                setAnalyticsLoading(false);
                return;
            }
        }

        const animeSnap = await getDocs(query(collection(db, "anime"), orderBy("views", "desc"), limit(5)));
        const finalTopAnime = animeSnap.docs.map(d => ({ name: (d.data().title || 'Unknown').substring(0, 15) + '...', views: d.data().views || 0 }));
        setTopAnime(finalTopAnime);

        const mangaSnap = await getDocs(query(collection(db, "manga"), orderBy("views", "desc"), limit(5)));
        const finalTopManga = mangaSnap.docs.map(d => ({ name: (d.data().title || 'Unknown').substring(0, 15) + '...', views: d.data().views || 0 }));
        setTopManga(finalTopManga);

        const sampleAnimeSnap = await getDocs(query(collection(db, "anime"), limit(50)));
        const genreCounts = {};
        sampleAnimeSnap.docs.forEach(d => {
            const item = d.data();
            let genres = [];
            if (Array.isArray(item.genres)) genres = item.genres;
            else if (typeof item.genres === 'string') genres = item.genres.split(',').map(g => g.trim());
            else if (Array.isArray(item.genre)) genres = item.genre;
            genres.forEach(g => { if (g) genreCounts[g] = (genreCounts[g] || 0) + 1; });
        });
        const finalGenreData = Object.keys(genreCounts).map(key => ({ name: key, value: genreCounts[key] })).sort((a, b) => b.value - a.value).slice(0, 6);
        setGenreData(finalGenreData);

        // ✅ BUG 40 FIX: Re-use the existing usersList instead of making another 100-document read!
        const dateMap = {};
        usersList.slice(0, 100).forEach(u => {
            if(u.createdAt) {
                const date = u.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dateMap[date] = (dateMap[date] || 0) + 1;
            }
        });
        const finalGrowthData = Object.keys(dateMap).map(k => ({ date: k, users: dateMap[k] })).reverse().slice(-7);
        setGrowthData(finalGrowthData);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ topAnime: finalTopAnime, topManga: finalTopManga, genreData: finalGenreData, growthData: finalGrowthData }));
    } catch (error) {
        console.error("Error fetching analytics:", error);
    } finally {
        setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isAdmin) {
            // ✅ BUG 40 FIX: Aggressive Session Caching to prevent re-fetching on tab switch
            const CACHE_KEY = 'admin_dashboard_main_cache';
            const cachedStr = sessionStorage.getItem(CACHE_KEY);
            
            if (cachedStr) {
                const parsed = JSON.parse(cachedStr);
                const revivedUsers = parsed.recentUsers.map(u => ({
                    ...u,
                    createdAt: new Date(u.createdAt),
                    lastActiveAt: new Date(u.lastActiveAt)
                }));
                setStats(parsed.stats);
                setRecentUsers(revivedUsers);
                fetchAnalytics(revivedUsers, false);
                return;
            }

            const usersCountSnap = await getCountFromServer(collection(db, "users"));
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const activeCountSnap = await getCountFromServer(query(collection(db, "users"), where("lastActiveAt", ">=", yesterday)));
            const rSnap = await getCountFromServer(collection(db, "reports"));
            const aSnap = await getCountFromServer(collection(db, "anime"));
            const mSnap = await getCountFromServer(collection(db, "manga"));
            
            const newStats = { users: usersCountSnap.data().count, activeUsers: activeCountSnap.data().count, anime: aSnap.data().count, manga: mSnap.data().count, reports: rSnap.data().count };
            setStats(newStats);

            const usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
            const usersSnapshot = await getDocs(usersQ);
            
            // ✅ BUG 40 FIX: Client-Side Memory Masking to prevent browser crashes
            const usersData = usersSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    username: data.username,
                    displayName: data.displayName,
                    email: data.email,
                    avatar: data.avatar,
                    // Strip out giant arrays (followers, interests) so they are garbage collected immediately
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0),
                    lastActiveAt: data.lastActiveAt?.toDate ? data.lastActiveAt.toDate() : new Date(0),
                };
            });
            
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                stats: newStats,
                recentUsers: usersData
            }));

            setRecentUsers(usersData); 
            fetchAnalytics(usersData, false); 
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

  useEffect(() => {
    if (!isAdmin || recentUsers.length === 0) return;
    const now = new Date();
    let buckets = [];
    if (timeRange === '24h') {
        for (let i = 6; i >= 0; i--) { const d = new Date(now.getTime() - (i * 4 * 60 * 60 * 1000)); buckets.push({ date: d, label: formatDateLabel(d, '24h') }); }
    } else if (timeRange === 'week') {
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - i); d.setHours(0,0,0,0); buckets.push({ date: d, label: formatDateLabel(d, 'week') }); }
    } else if (timeRange === 'month') {
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - (i * 5)); d.setHours(0,0,0,0); buckets.push({ date: d, label: formatDateLabel(d, 'month') }); }
    } else {
        for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - (i * 5)); buckets.push({ date: d, label: formatDateLabel(d, 'month') }); }
    }
    
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
            <Area type="monotone" dataKey="value" stroke={metric === 'registrations' ? "#2563eb" : "#16a34a"} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
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

      {/* --- EMBEDDED ANALYTICS SECTION --- */}
      <div className="section" style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={24} className="text-blue-600" /> Advanced Analytics
              </h2>
              {/* ✅ BUG 40 FIX: Pass recentUsers when manually refreshing */}
              <button onClick={() => fetchAnalytics(recentUsers, true)} className="btn-refresh">
                  <RefreshCw size={16} /> Refresh Data
              </button>
          </div>

          {analyticsLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading advanced metrics...</div>
          ) : (
              <>
                  <div className="grid-2">
                      <div className="analytics-chart-card">
                          <div className="chart-header">
                              <h3 className="chart-title"><Video size={20} className="text-blue-500"/> Top 5 Anime</h3>
                          </div>
                          <div style={{ width: '100%', height: 300 }}>
                              <ResponsiveContainer>
                                  <BarChart data={topAnime} layout="vertical" margin={{left: 0, right: 30}}>
                                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                      <XAxis type="number" hide />
                                      <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                      <Tooltip />
                                      <Bar dataKey="views" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                      </div>

                      <div className="analytics-chart-card">
                          <div className="chart-header">
                              <h3 className="chart-title"><BookOpen size={20} className="text-purple-500"/> Top 5 Manga</h3>
                          </div>
                          <div style={{ width: '100%', height: 300 }}>
                              <ResponsiveContainer>
                                  <BarChart data={topManga} layout="vertical" margin={{left: 0, right: 30}}>
                                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                      <XAxis type="number" hide />
                                      <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                      <Tooltip />
                                      <Bar dataKey="views" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                      </div>
                  </div>

                  <div className="grid-2">
                      <div className="analytics-chart-card">
                          <div className="chart-header">
                              <h3 className="chart-title"><PieChartIcon size={20} className="text-green-500"/> Popular Genres</h3>
                          </div>
                          <div style={{ width: '100%', height: 300 }}>
                              <ResponsiveContainer>
                                  <PieChart>
                                      <Pie data={genreData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                                          {genreData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                      </Pie>
                                      <Tooltip />
                                      <Legend />
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                      </div>

                      <div className="analytics-chart-card">
                          <div className="chart-header">
                              <h3 className="chart-title"><UsersIcon size={20} className="text-orange-500"/> User Growth Trend</h3>
                          </div>
                          <div style={{ width: '100%', height: 300 }}>
                              <ResponsiveContainer>
                                  <LineChart data={growthData} margin={{left: -20}}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                                      <YAxis tick={{fontSize: 12}} />
                                      <Tooltip />
                                      <Line type="monotone" dataKey="users" stroke="#f97316" strokeWidth={3} dot={{r: 4}} />
                                  </LineChart>
                              </ResponsiveContainer>
                          </div>
                      </div>
                  </div>
              </>
          )}
      </div>

      <div className="section">
        <h2 className="section-title">User Management</h2>
        <div className="table-wrapper"><Users /></div>
      </div>
    </div>
  );
}

// --- 🔐 NEW: SECURITY DASHBOARD COMPONENT ---
function SecurityDashboard() {
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLimits = async () => {
      setLoading(true);
      try {
          // Fetch the top 100 users hitting your Cloud Function rate limiters
          const snap = await getDocs(query(collection(db, 'rateLimits'), orderBy('count', 'desc'), limit(100)));
          setLimits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
          console.error("Error fetching rate limits:", e);
      }
      setLoading(false);
  };

  useEffect(() => { fetchLimits(); }, []);

  const getStatus = (action, count) => {
      // Dynamic threshold matching to your index.ts Cloud Functions
      const thresholds = { upload: 20, delete: 30, createPost: 5, createComment: 20, supportMessage: 20, createReport: 5 };
      const max = thresholds[action] || 20;
      
      if (count >= max) return <span className="status-badge" style={{backgroundColor: '#fef2f2', color: '#ef4444'}}>BLOCKED</span>;
      if (count >= max * 0.8) return <span className="status-badge" style={{backgroundColor: '#fffbeb', color: '#f59e0b'}}>WARNING</span>;
      return <span className="status-badge" style={{backgroundColor: '#f0fdf4', color: '#16a34a'}}>SAFE</span>;
  };

  return (
      <div className="dashboard-container">
          <div className="dashboard-header" style={{ marginBottom: '20px' }}>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldAlert style={{ color: '#ef4444' }} /> Security & Rate Limits
              </h1>
              <button onClick={fetchLimits} className="btn-refresh">
                  <RefreshCw size={16} /> Refresh Data
              </button>
          </div>

          <div className="table-wrapper">
              <div className="table-header">
                  <h3>Active API Usage (Last 1 Hour)</h3>
              </div>
              {loading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading security logs...</div>
              ) : (
                  <table className="data-table">
                      <thead>
                          <tr>
                              <th>User ID</th>
                              <th>Action Type</th>
                              <th>Hits</th>
                              <th>Status</th>
                              <th>Window Started</th>
                          </tr>
                      </thead>
                      <tbody>
                          {limits.length === 0 ? (
                              <tr><td colSpan="5" style={{textAlign: 'center', padding: '30px', color: '#6b7280'}}>No rate limit data found yet.</td></tr>
                          ) : (
                              limits.map(limit => {
                                  const [uid, action] = limit.id.split('_');
                                  const date = new Date(limit.windowStart).toLocaleString();
                                  return (
                                      <tr key={limit.id}>
                                          <td style={{ fontFamily: 'monospace', color: '#6b7280' }}>{uid}</td>
                                          <td style={{ fontWeight: 'bold' }}>{action}</td>
                                          <td><span style={{ fontWeight: 'bold', color: limit.count > 10 ? '#ef4444' : '#374151' }}>{limit.count}</span></td>
                                          <td>{getStatus(action, limit.count)}</td>
                                          <td style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{date}</td>
                                      </tr>
                                  );
                              })
                          )}
                      </tbody>
                  </table>
              )}
          </div>
      </div>
  );
}

// ✅ SURGICAL ADDITION: 📡 GLOBAL NOTIFICATION ANTENNA (With Auto-Read & Perfect Alignment)
function SystemAntenna({ isAdmin, position = "header" }) {
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);
    
    // Store the actual documents to track read status
    const [tickets, setTickets] = useState([]);
    const [reports, setReports] = useState([]);

    const initialTickets = useRef(true);
    const initialReports = useRef(true);
    const dropdownRef = useRef(null);

    // Close the dropdown if the admin clicks outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isAdmin) return;

        if ("Notification" in window && Notification.permission !== "denied" && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        const triggerChromeNotification = (title, body) => {
            if ("Notification" in window && Notification.permission === "granted") {
                const n = new Notification(title, { body, icon: '/vite.svg' });
                n.onclick = () => { window.focus(); n.close(); };
            }
        };

        // Listen to Support Tickets
        const qTickets = query(collection(db, 'supportTickets'), where('status', '==', 'pending'));
        const unsubTickets = onSnapshot(qTickets, (snap) => {
            setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            if (initialTickets.current) { initialTickets.current = false; return; }
            snap.docChanges().forEach(change => {
                // Only notify if it hasn't been read yet
                if (change.type === 'added') triggerChromeNotification("New Support Ticket 🚨", "A user needs help!");
                if (change.type === 'modified' && change.doc.data().unreadAdmin !== false) triggerChromeNotification("New Reply 💬", "A user replied to their ticket.");
            });
        });

        // Listen to Reports
        const qReports = query(collection(db, 'reports'), where('status', '==', 'pending'));
        const unsubReports = onSnapshot(qReports, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            if (initialReports.current) { initialReports.current = false; return; }
            snap.docChanges().forEach(change => {
                if (change.type === 'added') triggerChromeNotification("New Report 🚩", "A new user report requires your review.");
            });
        });

        return () => { unsubTickets(); unsubReports(); };
    }, [isAdmin]);

    if (!isAdmin) return <div style={{width: 24}}></div>;

    // 🔥 DYNAMIC FILTERING: Only count items that haven't been clicked/read yet
    const unreadTickets = tickets.filter(t => t.unreadAdmin !== false);
    const unreadReports = reports.filter(r => r.isRead !== true);
    const pendingCount = unreadTickets.length + unreadReports.length;
    
    const allNotifications = [
        ...unreadTickets.map(t => ({ id: t.id, type: 'ticket', text: `${t.userName || 'A user'} needs support`, time: t.updatedAt?.toDate ? t.updatedAt.toDate() : new Date(), link: '/support' })),
        ...unreadReports.map(r => ({ id: r.id, type: 'report', text: `Report: Requires review`, time: r.createdAt?.toDate ? r.createdAt.toDate() : new Date(), link: '/reports' }))
    ].sort((a, b) => b.time - a.time).slice(0, 5);

    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    // 🔥 CLICK HANDLER: Marks the item as read in Firebase so it disappears from the bell
    const handleNotificationClick = async (notif) => {
        setShowDropdown(false);
        try {
            if (notif.type === 'ticket') {
                await updateDoc(doc(db, 'supportTickets', notif.id), { unreadAdmin: false });
            } else if (notif.type === 'report') {
                await updateDoc(doc(db, 'reports', notif.id), { isRead: true });
            }
        } catch (error) {
            console.error("Error marking as read:", error);
        }
        navigate(notif.link);
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            {/* The Bell Icon */}
            <div 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px', cursor: 'pointer', transition: 'transform 0.2s ease' }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
                <Bell size={22} color={pendingCount > 0 ? "#ef4444" : "#9ca3af"} />
                {pendingCount > 0 && (
                    <span style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid white' }}>
                        {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                )}
            </div>

            {/* The Dropdown Menu */}
            {showDropdown && (
                <div style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    // 🔥 ALIGNMENT FIX: Shifts left for Sidebar, shifts slightly right for Mobile Header
                    left: position === 'sidebar' ? '20px' : 'auto',
                    right: position === 'header' ? '-10px' : 'auto',
                    marginTop: '15px', 
                    width: '300px', 
                    background: 'white', 
                    borderRadius: '12px', 
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', 
                    border: '1px solid #e5e7eb', 
                    zIndex: 1000, 
                    overflow: 'hidden' 
                }}>
                    
                    {/* Dropdown Header */}
                    <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1f2937' }}>Notifications</h3>
                        <span style={{ fontSize: '0.75rem', background: '#e0e7ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>{pendingCount} New</span>
                    </div>
                    
                    {/* Dropdown List */}
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {allNotifications.length === 0 ? (
                            <div style={{ padding: '30px 15px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No new notifications</div>
                        ) : (
                            allNotifications.map((notif, i) => (
                                <div 
                                    key={notif.id + i}
                                    onClick={() => handleNotificationClick(notif)}
                                    style={{ padding: '12px 15px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: notif.type === 'ticket' ? '#eff6ff' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {notif.type === 'ticket' ? <LifeBuoy size={16} color="#3b82f6" /> : <Flag size={16} color="#ef4444" />}
                                    </div>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notif.text}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px' }}>{timeAgo(notif.time)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* View All Button */}
                    <div 
                        onClick={() => { setShowDropdown(false); navigate('/notifications'); }}
                        style={{ padding: '12px', textAlign: 'center', background: '#f8fafc', borderTop: '1px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                    >
                        View All Notifications
                    </div>
                </div>
            )}
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

  useEffect(() => { setSidebarOpen(false); }, [location]);

  return (
    <>
    <style>{`
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
        .btn-logout { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #ef4444; background: none; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; width: 100%; text-align: left; }
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

        /* Embedded Analytics Styles */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
        .analytics-chart-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .chart-title { font-size: 1.1rem; font-weight: 700; color: #374151; display: flex; align-items: center; gap: 8px; margin: 0; }
        .btn-refresh { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; color: #4b5563; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-refresh:hover { background: #f9fafb; color: #2563eb; border-color: #bfdbfe; }

        /* RESPONSIVE MEDIA QUERIES */
        @media (max-width: 1024px) {
            .stats-grid { grid-template-columns: 1fr 1fr; }
            .grid-2 { grid-template-columns: 1fr; }
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
          
          {/* ✅ SURGICAL ADDITION: Display the Antenna icon on the desktop sidebar */}
          <SystemAntenna isAdmin={isAdmin} />

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
                <Link to="/comments" className={isActive('/comments')}>
                    <MessageSquare size={20} /> <span>Comments</span>
                </Link>

                <Link to="/affiliates" className={isActive('/affiliates')}>
                    <DollarSign size={20} /> <span>Affiliates</span>
                </Link>

                <Link to="/security" className={isActive('/security')}>
                    <ShieldAlert size={20} /> <span>Security Logs</span>
                </Link>

                <Link to="/support" className={isActive('/support')}>
                    <LifeBuoy size={20} /> <span>Support Desk</span>
                </Link>
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
            
            {/* ✅ SURGICAL ADDITION: Display the Antenna icon on the mobile header */}
            <SystemAntenna isAdmin={isAdmin} />
        </header>

        <main className="content-area">
            <Routes>
                <Route path="/" element={<Dashboard role={role} userId={userId} />} />
                
                <Route path="/security" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <SecurityDashboard />
                    </ProtectedRoute>
                } />
                
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

                <Route path="/comments" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Comments />
                    </ProtectedRoute>
                } />

                <Route path="/affiliates" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Affiliate />
                    </ProtectedRoute>
                } />

                <Route path="/support" element={
                    <ProtectedRoute role={role} allowedRoles={['admin', 'super_admin']}>
                        <Support />
                    </ProtectedRoute>
                } />

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