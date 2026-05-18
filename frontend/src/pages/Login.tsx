import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Family } from '../types';

export default function Login() {
  const { login, adminLogin } = useAuth();
  const [mode, setMode] = useState<'family' | 'admin'>('family');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-logo">🏠</div>
      <h1 className="login-title">FamilyAmz</h1>
      <p className="login-subtitle">L'espace de votre famille</p>

      <div className="login-card">
        <div className="login-tab-row">
          <button
            className={`login-tab ${mode === 'family' ? 'active' : ''}`}
            onClick={() => { setMode('family'); setError(''); }}
          >
            Famille
          </button>
          <button
            className={`login-tab ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => { setMode('admin'); setError(''); }}
          >
            Administrateur
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {mode === 'family' ? (
          <form onSubmit={handleFamilyLogin}>
            <label className="form-label">Identifiant famille</label>
            <input
              className="input"
              placeholder="ex: famille-dupont"
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
        ) : (
          <form onSubmit={handleAdminLogin}>
            <label className="form-label">Nom d'utilisateur admin</label>
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
