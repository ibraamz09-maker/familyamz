import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { api } from './api';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Calendar from './pages/Calendar';
import Tasks from './pages/Tasks';
import Expenses from './pages/Expenses';
import Members from './pages/Members';
import Messages from './pages/Messages';
import MapPage from './pages/Map';
import Settings, { applyTheme, applyFontSize } from './pages/Settings';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import AssistantModal from './components/AssistantModal';

function CalendarAssistantBtn() {
  const [show, setShow] = useState(false);
  const [members, setMembers] = useState<{ id: number; name: string; color: string }[]>([]);
  useEffect(() => {
    api.getMembers().then((d: unknown) => setMembers(d as { id: number; name: string; color: string }[])).catch(() => {});
  }, []);
  return (
    <>
      <button
        onClick={() => setShow(true)}
        title="Assistant vocal IA"
        style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          color: 'white', fontSize: 20, cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(99,102,241,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >🤖</button>
      {show && <AssistantModal members={members} onClose={() => setShow(false)} onDone={() => {}} />}
    </>
  );
}

type Tab = 'calendar' | 'tasks' | 'expenses' | 'messages' | 'map' | 'members' | 'settings';

const TAB_TITLES: Record<Tab, string> = {
  calendar: 'Calendrier',
  tasks: 'Tâches & Listes',
  expenses: 'Dépenses',
  messages: 'Messages',
  map: 'Carte famille',
  members: 'Membres',
  settings: 'Réglages',
};


const DESKTOP_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'calendar',  icon: '📅', label: 'Agenda' },
  { id: 'tasks',     icon: '✅', label: 'Tâches' },
  { id: 'expenses',  icon: '💶', label: 'Dépenses' },
  { id: 'messages',  icon: '💬', label: 'Messages' },
  { id: 'map',       icon: '🗺️', label: 'Carte' },
  { id: 'settings',  icon: '⚙️', label: 'Réglages' },
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isDesktop;
}

export default function App() {
  const { family, isAdmin, member, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const isDesktop = useIsDesktop();

  // Appliquer le thème et la taille de police sauvegardés
  useEffect(() => {
    const savedTheme = localStorage.getItem('familyamz_theme') as 'light' | 'dark' | 'rose' | 'blue' | null;
    const savedFont = localStorage.getItem('familyamz_font') as 'small' | 'medium' | 'large' | null;
    if (savedTheme && savedTheme !== 'light') applyTheme(savedTheme);
    if (savedFont && savedFont !== 'medium') applyFontSize(savedFont);
  }, []);

  // Heartbeat : met à jour last_seen toutes les 60 secondes
  useEffect(() => {
    if (!member) return;
    api.ping().catch(() => {});
    const interval = setInterval(() => api.ping().catch(() => {}), 60000);
    return () => clearInterval(interval);
  }, [member]);

  // Notifications push
  useEffect(() => {
    if (!family) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const setupPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await api.subscribePush(existing.toJSON()).catch(() => {});
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return;
        const { key } = await api.getVapidKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await api.subscribePush(sub.toJSON());
      } catch { /* ignore */ }
    };

    setupPush();
  }, [family]);

  if (!family && !isAdmin) return <Login />;
  if (isAdmin) return <Admin />;

  // ── Layout DESKTOP ──
  if (isDesktop) {
    return (
      <div className="app">
        {/* Sidebar */}
        <aside className="desktop-sidebar">
          <div className="desktop-sidebar-logo">
            <h1>🏠 FamilyAmz</h1>
            <p>Famille {family?.name}</p>
          </div>
          <nav className="desktop-sidebar-nav">
            {DESKTOP_TABS.map(t => (
              <button
                key={t.id}
                className={`desktop-nav-item ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <span className="desktop-nav-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="desktop-sidebar-footer">
            {member && (
              <div className="desktop-sidebar-member">
                <div className="desktop-sidebar-avatar" style={{ backgroundColor: member.color }}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="desktop-sidebar-name">{member.name}</div>
                  <div className="desktop-sidebar-family">Famille {family?.name}</div>
                </div>
              </div>
            )}
            <button className="desktop-logout-btn" onClick={logout}>🚪 Déconnexion</button>
          </div>
        </aside>

        {/* Zone principale */}
        <div className="desktop-main">
          <div className="desktop-topbar">
            <h1>{TAB_TITLES[activeTab]}</h1>
            {activeTab === 'calendar' && <CalendarAssistantBtn />}
          </div>
          <main className="main-content">
            {activeTab === 'calendar' && <Calendar />}
            {activeTab === 'tasks' && <Tasks />}
            {activeTab === 'expenses' && <Expenses />}
            {activeTab === 'messages' && <Messages />}
            {activeTab === 'map' && <MapPage />}
            {activeTab === 'members' && <Members />}
            {activeTab === 'settings' && <Settings />}
          </main>
        </div>
      </div>
    );
  }

  // ── Layout MOBILE ──
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            {TAB_TITLES[activeTab]}
          </h1>
          {activeTab === 'calendar' && <CalendarAssistantBtn />}
        </div>
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'tasks' && <Tasks />}
        {activeTab === 'expenses' && <Expenses />}
        {activeTab === 'messages' && <Messages />}
        {activeTab === 'map' && <MapPage />}
        {activeTab === 'members' && <Members />}
        {activeTab === 'settings' && <Settings />}
      </main>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
