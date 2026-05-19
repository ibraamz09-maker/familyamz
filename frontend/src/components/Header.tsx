import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Header() {
  const { family, logout } = useAuth();
  const [dbStatus, setDbStatus] = useState<'turso' | 'local' | 'error' | null>(null);

  useEffect(() => {
    api.health().then(h => {
      if (!h.ok) setDbStatus('error');
      else if (h.db === 'turso') setDbStatus('turso');
      else setDbStatus('local');
    }).catch(() => setDbStatus('error'));
  }, []);

  return (
    <header className="app-header">
      <div className="header-logo">🏠 FamilyAmz</div>
      <div className="header-right">
        {dbStatus === 'local' && (
          <span title="Base locale — données non persistantes" style={{ fontSize: 16, cursor: 'default' }}>🔴</span>
        )}
        {dbStatus === 'turso' && (
          <span title="Turso connecté — données sauvegardées" style={{ fontSize: 16, cursor: 'default' }}>🟢</span>
        )}
        <span className="header-family">{family?.name}</span>
        <button className="header-logout" onClick={logout}>Déconnexion</button>
      </div>
    </header>
  );
}
