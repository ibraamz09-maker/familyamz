import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Family } from '../types';

type Mode = 'family' | 'member' | 'admin';

export default function Login() {
  const { login, adminLogin, memberLogin } = useAuth();
  const [mode, setMode] = useState<Mode>('member');
  // Family login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // Member login
  const [famId, setFamId] = useState('amenzou');
  const [memberName, setMemberName] = useState('');
  const [memberPwd, setMemberPwd] = useState('');
  // Admin login
  const [username, setUsername] = useState('');
  const [adminPwd, setAdminPwd] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFamilyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(identifier.trim(), password);
      login(res.token, res.family as Family);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally { setLoading(false); }
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.memberLogin(famId.trim(), memberName.trim(), memberPwd);
      memberLogin(res.token, res.family as Family, res.member);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Identifiant ou mot de passe incorrect');
    } finally { setLoading(false); }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.adminLogin(username.trim(), adminPwd);
      adminLogin(res.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally { setLoading(false); }
  };

  const MEMBERS = ['Papa', 'Ibrahim', 'Imen', 'Assia', 'Sabah'];

  return (
    <div className="login-page">
      <div className="login-logo">🏠</div>
      <h1 className="login-title">FamilyAmz</h1>
      <p className="login-subtitle">L'espace de votre famille</p>

      <div className="login-card">
        <div className="login-tab-row">
          <button className={`login-tab ${mode === 'member' ? 'active' : ''}`} onClick={() => { setMode('member'); setError(''); }}>
            Membre
          </button>
          <button className={`login-tab ${mode === 'family' ? 'active' : ''}`} onClick={() => { setMode('family'); setError(''); }}>
            Famille
          </button>
          <button className={`login-tab ${mode === 'admin' ? 'active' : ''}`} onClick={() => { setMode('admin'); setError(''); }}>
            Admin
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {mode === 'member' && (
          <form onSubmit={handleMemberLogin}>
            <label className="form-label">Qui es-tu ?</label>
            <div className="member-login-grid">
              {MEMBERS.map(m => (
                <button
                  key={m}
                  type="button"
                  className={`member-login-chip ${memberName === m ? 'selected' : ''}`}
                  onClick={() => setMemberName(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <label className="form-label">Mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={memberPwd}
              onChange={e => setMemberPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="btn-primary" type="submit" disabled={loading || !memberName || !memberPwd}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        )}

        {mode === 'family' && (
          <form onSubmit={handleFamilyLogin}>
            <label className="form-label">Identifiant famille</label>
            <input
              className="input"
              placeholder="ex: amenzou"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
            <label className="form-label">Mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        )}

        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin}>
            <label className="form-label">Nom d'utilisateur</label>
            <input
              className="input"
              placeholder="admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
            <label className="form-label">Mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={adminPwd}
              onChange={e => setAdminPwd(e.target.value)}
              required
            />
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Connexion...' : 'Accès admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
