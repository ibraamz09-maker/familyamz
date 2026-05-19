import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
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
  const { family, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('calendar');

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
