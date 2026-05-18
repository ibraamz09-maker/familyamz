import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';

interface FamilyRow {
  id: number;
  identifier: string;
  name: string;
  member_count: number;
  created_at: string;
}

export default function Admin() {
  const { logout } = useAuth();
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPwd, setShowPwd] = useState<number | null>(null);
  const [form, setForm] = useState({ identifier: '', password: '', name: '' });
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchFamilies(); }, []);

  const fetchFamilies = async () => {
    const data = await api.getFamilies();
    setFamilies(data as FamilyRow[]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.createFamily(form);
      setForm({ identifier: '', password: '', name: '' });
      setShowCreate(false);
      await fetchFamilies();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer la famille "${name}" et toutes ses données ?`)) return;
    await api.deleteFamilyAdmin(id);
    await fetchFamilies();
  };

  const handleUpdatePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPwd || !newPwd) return;
    await api.updateFamilyPassword(showPwd, newPwd);
    setShowPwd(null);
    setNewPwd('');
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <span className="admin-title">🏠 FamilyAmz — Admin</span>
        <button className="header-logout" onClick={logout}>Déconnexion</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p className="section-title">{families.length} famille{families.length > 1 ? 's' : ''}</p>
        <button
          className="btn-primary"
          style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}
          onClick={() => setShowCreate(true)}
        >
          + Nouvelle famille
        </button>
      </div>

      {families.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">👨‍👩‍👧‍👦</div>
          <p>Aucune famille créée</p>
        </div>
      )}

      {families.map(f => (
        <div key={f.id} className="family-card">
          <div className="family-info">
            <div className="family-name">{f.name}</div>
            <div className="family-meta">
              ID: <strong>{f.identifier}</strong> · {f.member_count} membre{f.member_count > 1 ? 's' : ''}
            </div>
          </div>
          <div className="family-actions">
            <button className="btn-icon" title="Changer le mot de passe" onClick={() => setShowPwd(f.id)}>🔑</button>
            <button className="btn-danger" onClick={() => handleDelete(f.id, f.name)}>Supprimer</button>
          </div>
        </div>
      ))}

      {showCreate && (
        <Modal title="Nouvelle famille" onClose={() => { setShowCreate(false); setError(''); }}>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleCreate}>
            <label className="form-label">Nom de la famille</label>
            <input className="input" placeholder="ex: Famille Dupont" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <label className="form-label">Identifiant de connexion</label>
            <input className="input" placeholder="ex: dupont2024" value={form.identifier}
              onChange={e => setForm(f => ({ ...f, identifier: e.target.value.toLowerCase().replace(/\s/g, '-') }))} required />
            <label className="form-label">Mot de passe</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Création...' : 'Créer la famille'}
            </button>
          </form>
        </Modal>
      )}

      {showPwd !== null && (
        <Modal title="Nouveau mot de passe" onClose={() => setShowPwd(null)}>
          <form onSubmit={handleUpdatePwd}>
            <label className="form-label">Nouveau mot de passe</label>
            <input className="input" type="password" placeholder="••••••••"
              value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
            <button className="btn-primary" type="submit">Enregistrer</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
