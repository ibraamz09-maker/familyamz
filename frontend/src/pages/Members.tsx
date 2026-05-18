import { useState, useEffect } from 'react';
import { api } from '../api';
import { Member, PRESET_COLORS } from '../types';
import Modal from '../components/Modal';

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: '', color: PRESET_COLORS[0] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    const data = await api.getMembers();
    setMembers(data as Member[]);
  };

  const openAdd = () => {
    setEditingMember(null);
    setForm({ name: '', color: PRESET_COLORS[members.length % PRESET_COLORS.length] });
    setError('');
    setShowModal(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setForm({ name: m.name, color: m.color });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError('');
    setLoading(true);
    try {
      if (editingMember) {
        await api.updateMember(editingMember.id, form);
      } else {
        await api.createMember(form);
      }
      setShowModal(false);
      await fetchMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer le membre "${name}" ?`)) return;
    await api.deleteMember(id);
    await fetchMembers();
  };

  const initials = (name: string) => name.slice(0, 1).toUpperCase();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p className="section-title">{members.length} / 15 membre{members.length > 1 ? 's' : ''}</p>
      </div>

      {members.map(m => (
        <div key={m.id} className="member-item">
          <div className="member-color-badge" style={{ backgroundColor: m.color }}>
            {initials(m.name)}
          </div>
          <span className="member-name">{m.name}</span>
          <div className="member-actions">
            <button className="btn-icon" onClick={() => openEdit(m)}>✏️</button>
            <button className="btn-icon" onClick={() => handleDelete(m.id, m.name)}>🗑️</button>
          </div>
        </div>
      ))}

      {members.length < 15 && (
        <button className="add-btn" onClick={openAdd}>
          <span style={{ fontSize: 22 }}>+</span> Ajouter un membre
        </button>
      )}

      {members.length === 0 && (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <div className="empty-state-icon">👤</div>
          <p>Ajoutez les membres de votre famille</p>
        </div>
      )}

      {showModal && (
        <Modal
          title={editingMember ? 'Modifier le membre' : 'Nouveau membre'}
          onClose={() => setShowModal(false)}
        >
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <label className="form-label">Prénom</label>
            <input
              className="input"
              placeholder="ex: Marie"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
              required
            />
            <label className="form-label">Couleur</label>
            <div className="color-grid">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  backgroundColor: form.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 22, fontWeight: 700,
                }}
              >
                {form.name ? form.name.slice(0, 1).toUpperCase() : '?'}
              </div>
              <span style={{ fontSize: 15, color: 'var(--text-2)' }}>Aperçu</span>
            </div>
            <button className="btn-primary" type="submit" disabled={loading || !form.name.trim()}>
              {loading ? '...' : editingMember ? 'Modifier' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
