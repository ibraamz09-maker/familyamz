import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { family, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="header-logo">🏠 FamilyAmz</div>
      <div className="header-right">
        <span className="header-family">{family?.name}</span>
        <button className="header-logout" onClick={logout}>Déconnexion</button>
      </div>
    </header>
  );
}
