import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../api';
import { Expense, Receipt, Member, EXPENSE_CATEGORIES, CATEGORY_COLORS, MONTHS_FR } from '../types';
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

export default function Expenses() {
  const today = new Date();
  const [view, setView] = useState<'monthly' | 'annual' | 'tickets'>('monthly');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState({
    amount: '',
    date: today.toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0],
    member_id: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);

  // Tickets state
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [receiptForm, setReceiptForm] = useState({
    filename: '', mimetype: '', data: '',
    amount: '', date: today.toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0], description: '', member_id: '',
  });

  const RECEIPTS_CACHE_KEY = 'familyamz_receipts_cache';

  const fetchData = useCallback(async () => {
    const [exps, mbrs] = await Promise.all([
      view === 'monthly' ? api.getExpenses(year, month + 1) : view === 'annual' ? api.getExpenses(year) : api.getExpenses(year),
      api.getMembers(),
    ]);
    setExpenses(exps as Expense[]);
    setMembers(mbrs as Member[]);
    if (view === 'tickets') {
      // Afficher d'abord le cache localStorage (affichage immédiat)
      try {
        const cached = localStorage.getItem(RECEIPTS_CACHE_KEY);
        if (cached) setReceipts(JSON.parse(cached));
      } catch { /* ignore */ }
      // Puis charger depuis le serveur — TOUJOURS utiliser les données serveur
      try {
        const recs = await api.getReceipts();
        const list = recs as Receipt[];
        setReceipts(list); // Toujours utiliser les données serveur, même si vide
        const toCache = list.map(r => ({ ...r, data: '' }));
        try { localStorage.setItem(RECEIPTS_CACHE_KEY, JSON.stringify(toCache)); } catch { /* quota */ }
      } catch {
        // Erreur réseau uniquement → garder le cache
        const cached = localStorage.getItem(RECEIPTS_CACHE_KEY);
        if (cached) setReceipts(JSON.parse(cached));
      }
    }
  }, [view, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setEditingExpense(null);
    setForm({
      amount: '',
      date: today.toISOString().slice(0, 10),
      category: EXPENSE_CATEGORIES[0],
      member_id: '',
      description: '',
    });
    setShowModal(true);
  };

  const openEdit = (ex: Expense) => {
    setEditingExpense(ex);
    setForm({
      amount: String(ex.amount),
      date: ex.date,
      category: ex.category as import('../types').ExpenseCategory,
      member_id: ex.member_id ? String(ex.member_id) : '',
      description: ex.description,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.date || !form.category) return;
    setLoading(true);
    try {
      const data = {
        amount: parseFloat(form.amount.replace(',', '.')),
        date: form.date,
        category: form.category,
        member_id: form.member_id ? Number(form.member_id) : null,
        description: form.description,
      };
      if (editingExpense) await api.updateExpense(editingExpense.id, data);
      else await api.createExpense(data);
      setShowModal(false);
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteExpense(id);
    await fetchData();
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  // Monthly: category totals
  const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0);

  // Annual: chart data
  const chartData = MONTHS_FR.map((name, i) => {
    const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mExp = expenses.filter(e => e.date.startsWith(mStr));
    const entry: Record<string, string | number> = { month: name.slice(0, 3) };
    EXPENSE_CATEGORIES.forEach(cat => {
      entry[cat] = mExp.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
    });
    return entry;
  });

  return (
    <div>
      <div className="view-toggle">
        <button className={`view-tab ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Mensuel</button>
        <button className={`view-tab ${view === 'annual' ? 'active' : ''}`} onClick={() => setView('annual')}>Annuel</button>
        <button className={`view-tab ${view === 'tickets' ? 'active' : ''}`} onClick={() => setView('tickets')}>🧾 Tickets</button>
      </div>

      {/* Navigation */}
      {view === 'monthly' && (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>‹</button>
          <span>{MONTHS_FR[month]} {year}</span>
          <button className="nav-btn" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>›</button>
        </div>
      )}
      {view === 'annual' && (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
          <span>{year}</span>
          <button className="nav-btn" onClick={() => setYear(y => y + 1)}>›</button>
        </div>
      )}

      {/* Total */}
      {view !== 'tickets' && (
        <div className="total-card">
          <div>
            <div className="total-label">{view === 'monthly' ? `Total ${MONTHS_FR[month]}` : `Total ${year}`}</div>
            <div className="total-amount">{fmt(total)}</div>
          </div>
          <span style={{ fontSize: 32 }}>💶</span>
        </div>
      )}

      {view === 'monthly' ? (
        <>
          {categoryTotals.length > 0 && (
            <div className="category-grid">
              {categoryTotals.map(({ cat, total: ct }) => (
                <div key={cat} className="category-chip">
                  <span className="category-dot" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                  <div className="category-info">
                    <div className="category-name">{cat}</div>
                    <div className="category-total">{fmt(ct)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💸</div>
              <p>Aucune dépense ce mois-ci</p>
            </div>
          ) : (
            expenses.map(ex => (
              <div key={ex.id} className="expense-item">
                <div className="expense-left">
                  <span className="expense-cat-dot" style={{ backgroundColor: CATEGORY_COLORS[ex.category] }} />
                  <div className="expense-info">
                    <div className="expense-name">{ex.category}{ex.description ? ` — ${ex.description}` : ''}</div>
                    <div className="expense-meta">
                      {ex.date}{ex.member_name ? ` · ${ex.member_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="expense-right">
                  <span className="expense-amount">{fmt(ex.amount)}</span>
                  <button className="btn-icon" onClick={() => openEdit(ex)}>✏️</button>
                  <button className="btn-icon" onClick={() => handleDelete(ex.id)}>🗑️</button>
                </div>
              </div>
            ))
          )}
        </>
      ) : view === 'annual' ? (
        <>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                {EXPENSE_CATEGORIES.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={CATEGORY_COLORS[cat]} radius={cat === EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {EXPENSE_CATEGORIES.map(cat => (
                <div key={cat} className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                  {cat}
                </div>
              ))}
            </div>
          </div>

          {/* Monthly breakdown for annual view */}
          {MONTHS_FR.map((name, i) => {
            const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const mTotal = expenses.filter(e => e.date.startsWith(mStr)).reduce((s, e) => s + e.amount, 0);
            if (mTotal === 0) return null;
            return (
              <div key={i} className="expense-item">
                <div className="expense-left">
                  <div className="expense-info">
                    <div className="expense-name">{name}</div>
                  </div>
                </div>
                <span className="expense-amount">{fmt(mTotal)}</span>
              </div>
            );
          })}
        </>
      ) : null}

      {view === 'tickets' && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
            🧾 {receipts.length} ticket{receipts.length > 1 ? 's' : ''} stocké{receipts.length > 1 ? 's' : ''} — tous téléchargeables
          </div>
          {receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧾</div>
              <p>Aucun ticket ce mois-ci</p>
            </div>
          ) : (
            receipts.map(r => (
              <div key={r.id} className="receipt-item">
                <div className="receipt-thumb">{r.mimetype.startsWith('image/') ? '🖼️' : '📄'}</div>
                <div className="receipt-info">
                  <div className="receipt-name">{r.description || r.filename}</div>
                  <div className="receipt-meta">{r.date} · {r.category}{r.amount != null ? ` · ${fmt(r.amount)}` : ''}</div>
                </div>
                <div className="receipt-actions">
                  <button className="btn-icon" onClick={() => { const a = document.createElement('a'); a.href = api.getReceiptFileUrl(r.id); a.download = r.filename; a.click(); }}>⬇️</button>
                  <button className="btn-icon" onClick={async () => { await api.deleteReceipt(r.id); const recs = await api.getReceipts(); const list = recs as Receipt[]; setReceipts(list); localStorage.setItem(RECEIPTS_CACHE_KEY, JSON.stringify(list)); }}>🗑️</button>
                </div>
              </div>
            ))
          )}
        </>
      )}

      <div style={{ height: 24 }} />

      <button className="fab" onClick={view === 'tickets' ? () => setShowReceiptModal(true) : openAdd} title={view === 'tickets' ? 'Ajouter un ticket' : 'Ajouter une dépense'}>+</button>

      {showReceiptModal && (
        <Modal title="Ajouter un ticket" onClose={() => setShowReceiptModal(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!receiptForm.data) return;
            setLoading(true);
            try {
              await api.createReceipt({
                filename: receiptForm.filename, mimetype: receiptForm.mimetype, data: receiptForm.data,
                amount: receiptForm.amount ? parseFloat(receiptForm.amount.replace(',', '.')) : null,
                date: receiptForm.date, category: receiptForm.category,
                description: receiptForm.description,
                member_id: receiptForm.member_id ? Number(receiptForm.member_id) : null,
              });
              setShowReceiptModal(false);
              // Réinitialiser le formulaire
              setReceiptPreview(null);
              setReceiptForm({ filename: '', mimetype: '', data: '', amount: '', date: today.toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], description: '', member_id: '' });
              // Rafraîchir la liste
              const recs = await api.getReceipts();
              const list = recs as Receipt[];
              setReceipts(list);
              try {
                const toCache = list.map(r => ({ ...r, data: '' }));
                localStorage.setItem(RECEIPTS_CACHE_KEY, JSON.stringify(toCache));
              } catch { /* quota dépassé */ }
            } catch (err) {
              alert('❌ Erreur de sauvegarde : ' + (err instanceof Error ? err.message : 'Vérifiez la connexion'));
            } finally { setLoading(false); }
          }}>
            <label className="form-label">Photo du ticket</label>
            {/* Utiliser un label HTML pour déclencher l'input — fiable sur iOS */}
            <label htmlFor="receipt-file-upload" style={{ display: 'block', cursor: analyzing ? 'default' : 'pointer' }}>
              <div className="upload-zone" style={{ pointerEvents: 'none' }}>
                {analyzing ? (
                  <div style={{ padding: 28, color: 'var(--primary)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28 }}>🔍</div>
                    <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>Analyse Gemini en cours...</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Extraction du montant et de la date</div>
                  </div>
                ) : receiptPreview ? (
                  <img src={receiptPreview} alt="aperçu" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                ) : receiptForm.filename ? (
                  <div style={{ padding: 20 }}>📄 {receiptForm.filename}</div>
                ) : (
                  <div style={{ padding: 28, color: 'var(--text-2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 40 }}>📷</div>
                    <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600 }}>Appuie pour prendre une photo</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>ou choisir dans la galerie</div>
                  </div>
                )}
              </div>
            </label>
            <input
              id="receipt-file-upload"
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const compressed = await compressImage(file);
                setReceiptForm(f => ({ ...f, ...compressed }));
                if (compressed.mimetype.startsWith('image/')) setReceiptPreview(`data:${compressed.mimetype};base64,${compressed.data}`);
                else setReceiptPreview(null);
                // Analyse automatique avec Gemini (si disponible)
                setAnalyzing(true);
                try {
                  const result = await api.analyzeReceipt(compressed.data, compressed.mimetype);
                  if (result.description || result.amount != null) {
                    setReceiptForm(f => ({
                      ...f,
                      amount: result.amount != null ? String(result.amount) : f.amount,
                      date: result.date || f.date,
                      category: (result.category as import('../types').ExpenseCategory) || f.category,
                      description: result.description || f.description,
                    }));
                  }
                } catch { /* Gemini non disponible, l'utilisateur remplit manuellement */ }
                finally { setAnalyzing(false); }
              }}
            />
            <label className="form-label">Catégorie</label>
            <select className="select" value={receiptForm.category} onChange={e => setReceiptForm(f => ({ ...f, category: e.target.value as import('../types').ExpenseCategory }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="form-label">Date</label>
            <input className="input" type="date" value={receiptForm.date} onChange={e => setReceiptForm(f => ({ ...f, date: e.target.value }))} required />
            <label className="form-label">Montant (€) — optionnel</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={receiptForm.amount} onChange={e => setReceiptForm(f => ({ ...f, amount: e.target.value }))} />
            <label className="form-label">Description (optionnel)</label>
            <input className="input" placeholder="ex: Facture EDF, Amazon..." value={receiptForm.description} onChange={e => setReceiptForm(f => ({ ...f, description: e.target.value }))} />
            <label className="form-label">Membre concerné</label>
            <select className="select" value={receiptForm.member_id} onChange={e => setReceiptForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">Toute la famille</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn-primary" type="submit" disabled={loading || analyzing || !receiptForm.data}>
              {analyzing ? '🔍 Analyse...' : loading ? '...' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}

      {showModal && (
        <Modal
          title={editingExpense ? 'Modifier la dépense' : 'Nouvelle dépense'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit}>
            <label className="form-label">Montant (€)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
            <label className="form-label">Date</label>
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
            />
            <label className="form-label">Catégorie</label>
            <select className="select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as import('../types').ExpenseCategory }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="form-label">Membre concerné</label>
            <select className="select" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">Toute la famille</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <label className="form-label">Description (optionnel)</label>
            <input
              className="input"
              placeholder="ex: Cinéma, Pull d'hiver..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? '...' : editingExpense ? 'Modifier' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
