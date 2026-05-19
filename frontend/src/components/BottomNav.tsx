type Tab = 'calendar' | 'tasks' | 'expenses' | 'messages' | 'map' | 'members';

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
  { id: 'members', icon: '👥', label: 'Membres' },
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
          <span className="bottom-nav-icon">{t.icon}</span>
          <span className="bottom-nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
