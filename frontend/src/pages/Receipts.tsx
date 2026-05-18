import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { Receipt, Member, EXPENSE_CATEGORIES, CATEGORY_COLORS, MONTHS_FR } from '../types';
import Modal from '../components/Modal';

function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }

function compressImage(file: File): Promise<{ data: string; mimetype: string; filename: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        resolve({ data: b64, mimetype: file.type, filename: file.name });
      };
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      resolve({ data: dataUrl.split(',')[1], mimetype: 'image/jpeg', filename: file.name.replace(/\.[^.]+$/, '.jpg') });
    };
    img.src = url;
  });
}

export default function Receipts() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterCategory, setFilterCategory] = useState('');
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    filename: '', mimetype: '', data: '',
    amount: '', date: today.toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0], description: '', member_id: '',
  });

  const fetchData = useCallback(async () => {
    const [recs, mbrs] = await Promise.all([
      view === 'monthly'
        ? api.getReceipts(year, month + 1, filterCategory || undefined)
        : api.getReceipts(year, undefined, filterCategory || undefined),
      api.getMembers(),
    ]);
    setReceipts(recs as Receipt[]);
    setMembers(mbrs as Member[]);
  }, [view, year, month, filterCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setForm(f => ({ ...f, ...compressed }));
    if (compressed.mimetype.startsWith('image/')) {
      setPreview(`data:${compressed.mimetype};base64,${compressed.data}`);
    } else {
      setPreview(null);
    }
  };

  const openAdd = () => {
    setForm({ filename: '', mimetype: '', data: '', amount: '', date: today.toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], description: '', member_id: '' });
    setPreview(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.data || !form.date || !form.category) return;
    setLoading(true);
    try {
      await api.createReceipt({
        filename: form.filename,
        mimetype: form.mimetype,
        data: form.data,
        amount: form.amount ? parseFloat(form.amount.replace(',', '.')) : null,
        date: form.date,
        category: form.category,
        description: form.description,
        member_id: form.member_id ? Number(form.member_id) : null,
      });
      setShowModal(false);
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteReceipt(id);
    await fetchData();
  };

  const handleDownload = (r: Receipt) => {
    const a = document.createElement('a');
    a.href = api.getReceiptFileUrl(r.id);
    a.download = r.filename;
    a.click();
  };

  const grouped = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    const key = r.category;
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="view-toggle">
        <button className={`view-tab ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Mensuel</button>
        <button className={`view-tab ${view === 'annual' ? 'active' : ''}`} onClick={() => setView('annual')}>Annuel</button>
      </div>

      {view === 'monthly' ? (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>‹</button>
          <span>{MONTHS_FR[month]} {year}</span>
          <button className="nav-btn" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>›</button>
        </div>
      ) : (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
          <span>{year}</span>
          <button className="nav-btn" onClick={() => setYear(y => y + 1)}>›</button>
        </div>
      )}

      <div className="receipt-filter-row">
        <select className="select" style={{ marginBottom: 0 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <p>Aucun ticket pour cette période</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div className="receipt-cat-header">
              <span className="category-dot" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{cat}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-2)' }}>
                {items.length} ticket{items.length > 1 ? 's' : ''}
              </span>
            </div>
            {items.map(r => (
              <div key={r.id} className="receipt-item">
                <div className="receipt-thumb" onClick={() => r.mimetype.startsWith('image/') && handleDownload(r)}>
                  {r.mimetype.startsWith('image/') ? '🖼️' : '📄'}
                </div>
                <div className="receipt-info">
                  <div className="receipt-name">{r.description || r.filename}</div>
                  <div className="receipt-meta">{r.date}{r.amount != null ? ` · ${fmt(r.amount)}` : ''}</div>
                </div>
                <div className="receipt-actions">
                  <button className="btn-icon" onClick={() => handleDownload(r)} title="Télécharger">⬇️</button>
                  <button className="btn-icon" onClick={() => handleDelete(r.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <div style={{ height: 24 }} />
      <button className="fab" onClick={openAdd} title="Ajouter un ticket">+</button>

      {showModal && (
        <Modal title="Ajouter un ticket" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <label className="form-label">Fichier (photo, screenshot, PDF)</label>
            <div className="upload-zone" onClick={() => fileRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="aperçu" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8 }} />
              ) : form.filename ? (
                <div style={{ padding: 20 }}>📄 {form.filename}</div>
              ) : (
                <div style={{ padding: 28, color: 'var(--text-2)', textAlign: 'center' }}>
                  <div style={{ fontSize: 32 }}>📎</div>
                  <div style={{ marginTop: 8, fontSize: 14 }}>Appuie pour choisir un fichier</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFile} />

            <label className="form-label">Catégorie</label>
            <select className="select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as import('../types').ExpenseCategory }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="form-label">Date</label>
            <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />

            <label className="form-label">Montant (€) — optionnel</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />

            <label className="form-label">Description (optionnel)</label>
            <input className="input" placeholder="ex: Facture EDF, Amazon..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

            <label className="form-label">Membre concerné</label>
            <select className="select" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">Toute la famille</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <button className="btn-primary" type="submit" disabled={loading || !form.data}>
              {loading ? '...' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
