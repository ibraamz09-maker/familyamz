type Tab = 'calendar' | 'tasks' | 'expenses' | 'messages' | 'map' | 'members' | 'settings';

interface Props {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}

const tabs: { id: Tab; icon: string; label: string }[] = [
  { id: 'calendar', icon: '📅', label: 'Agenda' },
  { id: 'tasks', icon: '✅', label: 'Tâches' },
  { id: 'expenses', icon: '💶', label: 'Dépenses' },
  { id: 'messages', icon: '💬', label: 'Chat' },
  { id: 'map', icon: '🗺️', label: 'Carte' },
  { id: 'settings', icon: '⚙️', label: 'Réglages' },
];

export default function BottomNav({ activeTab, setActiveTab }: Props) {
  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`bottom-nav-item ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => setActiveTab(t.id)}
        >
          <span className="bottom-nav-icon" style={{ fontSize: 18 }}>{t.icon}</span>
          <span className="bottom-nav-label" style={{ fontSize: 9 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
