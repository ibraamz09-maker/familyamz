import { useState, useEffect } from 'react';
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
import Header from './components/Header';
import BottomNav from './components/BottomNav';

type Tab = 'calendar' | 'tasks' | 'expenses' | 'messages' | 'map' | 'members';

const TAB_TITLES: Record<Tab, string> = {
  calendar: 'Calendrier',
  tasks: 'Tâches & Listes',
  expenses: 'Dépenses',
  messages: 'Messages',
  map: 'Carte famille',
  members: 'Membres',
};

export default function App() {
  const { family, isAdmin, member } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('calendar');

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
          // Déjà abonné, on re-synchronise avec le serveur
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

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, color: 'var(--text)' }}>
          {TAB_TITLES[activeTab]}
        </h1>
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'tasks' && <Tasks />}
        {activeTab === 'expenses' && <Expenses />}
        {activeTab === 'messages' && <Messages />}
        {activeTab === 'map' && <MapPage />}
        {activeTab === 'members' && <Members />}
      </main>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
