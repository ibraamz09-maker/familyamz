import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '../api';
import { Expense, Receipt, Member, EXPENSE_CATEGORIES, CATEGORY_COLORS, MONTHS_FR, ACCOUNTS, ACCOUNT_COLORS } from '../types';
import Modal from '../components/Modal';

function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }

async function analyzeWithGemini(imageData: string, mimetype: string): Promise<{ amount: number | null; date: string; category: string; description: string } | null> {
  const apiKey = localStorage.getItem('familyamz_gemini_key')?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimetype, data: imageData } },
            { text: 'Analyse ce ticket de caisse. Réponds UNIQUEMENT avec ce JSON sans markdown:\n{"amount": <montant total décimal ou null>, "date": "<YYYY-MM-DD>", "category": "<Courses|Restauration|Loisirs|Vêtements|Santé|Abonnements|Électricité|Essence|Autres>", "description": "<nom du magasin>"}' },
          ]}],
        }),
      }
    );
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

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
      const MAX = 900; // Réduit pour alléger le stockage Turso
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
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
    member_ids: [] as number[],
    description: '',
    account: '' as string,
  });
  const [loading, setLoading] = useState(false);

  // Tickets state
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [geminiSuccess, setGeminiSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [receiptForm, setReceiptForm] = useState({
    filename: '', mimetype: '', data: '',
    amount: '', date: today.toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0], description: '', member_id: '',
  });

  const RECEIPTS_CACHE_KEY = 'familyamz_receipts_cache';

  // Charger les membres séparément (comme Calendar) pour ne pas bloquer les dépenses
  useEffect(() => {
    api.getMembers().then(mbrs => setMembers(mbrs as Member[])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const exps = await (view === 'monthly' ? api.getExpenses(year, month + 1) : api.getExpenses(year));
      setExpenses(exps as Expense[]);
    } catch { /* ignore réseau */ }
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
    setForm({ amount: '', date: today.toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], member_ids: [], description: '', account: '' });
    setShowModal(true);
  };

  const openEdit = (ex: Expense) => {
    setEditingExpense(ex);
    let ids: number[] = [];
    try { if (ex.member_ids) ids = JSON.parse(ex.member_ids).map(Number); } catch {}
    setForm({ amount: String(ex.amount), date: ex.date, category: ex.category as import('../types').ExpenseCategory, member_ids: ids, description: ex.description, account: (ex as any).account || '' });
    setShowModal(true);
  };

  const toggleExpenseMember = (id: number) => {
    const nid = Number(id);
    setForm(f => ({
      ...f,
      member_ids: f.member_ids.map(Number).includes(nid)
        ? f.member_ids.filter(x => Number(x) !== nid)
        : [...f.member_ids, nid],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.date || !form.category) return;
    setLoading(true);
    try {
      const parsedAmount = parseFloat(form.amount.replace(',', '.'));
      const data = {
        amount: parsedAmount,
        date: form.date,
        category: form.category,
        member_id: form.member_ids.length === 1 ? form.member_ids[0] : null,
        member_ids: form.member_ids,
        description: form.description,
        account: form.account || 'Non placé',
      };

      const membersInfoOptimistic = form.member_ids
        .map(id => members.find(m => Number(m.id) === id))
        .filter((m): m is Member => Boolean(m));

      if (editingExpense) {
        // Mise à jour optimiste
        setExpenses(prev => prev.map(ex =>
          ex.id === editingExpense.id
            ? { ...ex, amount: parsedAmount, date: form.date, category: form.category, description: form.description, member_id: data.member_id ?? null, member_ids: JSON.stringify(form.member_ids), members_info: membersInfoOptimistic }
            : ex
        ));
        await api.updateExpense(editingExpense.id, data);
      } else {
        // Ajout optimiste — afficher immédiatement sans attendre le serveur
        const optimistic: Expense = {
          id: Date.now(), // id temporaire
          family_id: 0,
          member_id: data.member_id ?? null,
          member_ids: JSON.stringify(form.member_ids),
          amount: parsedAmount,
          date: form.date,
          category: form.category,
          description: form.description,
          members_info: membersInfoOptimistic,
        };
        setExpenses(prev => [optimistic, ...prev]);
        await api.createExpense(data);
      }

      setShowModal(false);
      // Sync en arrière-plan pour remplacer l'id temporaire par le vrai
      fetchData().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteExpense(id);
    await fetchData();
  };

  const getMembersLabel = (ex: Expense) => {
    if (ex.members_info && ex.members_info.length > 0) return ex.members_info.map(m => m.name).join(', ');
    if (ex.member_name) return ex.member_name;
    return null;
  };

  // Variables sélecteur membres (dépenses)
  const allMemberIds = members.map(m => Number(m.id));
  const selectedExpenseIds = form.member_ids.map(Number);
  const allExpenseSelected = allMemberIds.length > 0 && allMemberIds.every(id => selectedExpenseIds.includes(id));
  const tousExpenseActive = selectedExpenseIds.length === 0 || allExpenseSelected;

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Monthly: category totals
  const categoryTotals = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0),
  })).filter(c => c.total > 0);

  // Annual: bar chart par mois (total)
  const chartData = MONTHS_FR.map((name, i) => {
    const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mExp = expenses.filter(e => e.date.startsWith(mStr));
    const total = mExp.reduce((s, e) => s + Number(e.amount), 0);
    return { month: name.slice(0, 3), total };
  });

  // Annual: donut par catégorie (les catégories inconnues → Autres)
  const pieData = EXPENSE_CATEGORIES.map(cat => {
    const val = expenses.filter(e => {
      if (cat === 'Autres') return !EXPENSE_CATEGORIES.slice(0, -1).includes(e.category as any) || e.category === 'Autres';
      return e.category === cat;
    }).reduce((s, e) => s + Number(e.amount), 0);
    return { name: cat, value: val };
  }).filter(d => d.value > 0);

  // Monthly: totaux par compte bancaire
  const accountTotals = ACCOUNTS.map(acc => ({
    acc,
    total: expenses.filter(e => ((e as any).account || 'Non placé') === acc).reduce((s, e) => s + Number(e.amount), 0),
  })).filter(a => a.total > 0);

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

          {/* Totaux par compte bancaire */}
          {accountTotals.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {accountTotals.map(({ acc, total: at }) => (
                <div key={acc} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 12,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  flex: '1 1 calc(50% - 4px)',
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: ACCOUNT_COLORS[acc], flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{acc}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{fmt(at)}</div>
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
                  <span className="expense-cat-dot" style={{ backgroundColor: CATEGORY_COLORS[ex.category] || '#6B7280' }} />
                  <div className="expense-info">
                    <div className="expense-name">{ex.category}{ex.description ? ` — ${ex.description}` : ''}</div>
                    <div className="expense-meta">
                      {ex.date}{(ex as any).account && (ex as any).account !== 'Non placé' ? ` · 🏦 ${(ex as any).account}` : ''}{getMembersLabel(ex) ? ` · ${getMembersLabel(ex)}` : ''}
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
          {/* Donut par catégorie */}
          {pieData.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#6B7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {pieData.map(d => (
                  <div key={d.name} className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: CATEGORY_COLORS[d.name] || '#6B7280' }} />
                    {d.name} — {fmt(d.value)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state"><div className="empty-state-icon">📊</div><p>Aucune dépense en {year}</p></div>
          )}

          {/* Barres mensuelles */}
          {chartData.some(d => d.total > 0) && (
            <div className="chart-container" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>Évolution mensuelle</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly breakdown for annual view */}
          {MONTHS_FR.map((name, i) => {
            const mStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const mTotal = expenses.filter(e => e.date.startsWith(mStr)).reduce((s, e) => s + Number(e.amount), 0);
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              🧾 {receipts.length} ticket{receipts.length > 1 ? 's' : ''} stocké{receipts.length > 1 ? 's' : ''}
            </span>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={async () => {
                try {
                  const recs = await api.getReceipts();
                  const list = recs as Receipt[];
                  setReceipts(list);
                  localStorage.setItem(RECEIPTS_CACHE_KEY, JSON.stringify(list.map(r => ({ ...r, data: '' }))));
                } catch { alert('Erreur de chargement — vérifiez votre connexion'); }
              }}
            >
              🔄 Actualiser
            </button>
          </div>
          {receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧾</div>
              <p>Aucun ticket stocké</p>
            </div>
          ) : (
            receipts.map(r => (
              <div key={r.id} className="receipt-item">
                <button
                  className="receipt-thumb"
                  style={{ background: 'none', border: 'none', cursor: r.mimetype.startsWith('image/') ? 'pointer' : 'default', fontSize: 28, padding: 0 }}
                  onClick={() => r.mimetype.startsWith('image/') && setPreviewUrl(api.getReceiptFileUrl(r.id))}
                  title={r.mimetype.startsWith('image/') ? 'Voir le ticket' : ''}
                >
                  {r.mimetype.startsWith('image/') ? '🖼️' : '📄'}
                </button>
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
              const saved = await api.createReceipt({
                filename: receiptForm.filename, mimetype: receiptForm.mimetype, data: receiptForm.data,
                amount: receiptForm.amount ? parseFloat(receiptForm.amount.replace(',', '.')) : null,
                date: receiptForm.date, category: receiptForm.category,
                description: receiptForm.description,
                member_id: receiptForm.member_id ? Number(receiptForm.member_id) : null,
              });
              // Affichage immédiat sans attendre le serveur
              const newReceipt: Receipt = {
                id: saved.id,
                filename: receiptForm.filename,
                mimetype: receiptForm.mimetype,
                amount: receiptForm.amount ? parseFloat(receiptForm.amount.replace(',', '.')) : null,
                date: receiptForm.date,
                category: receiptForm.category,
                description: receiptForm.description,
                member_id: receiptForm.member_id ? Number(receiptForm.member_id) : null,
                created_at: new Date().toISOString(),
              };
              setReceipts(prev => [newReceipt, ...prev]);

              // Si un montant est saisi → ajouter immédiatement dans les dépenses (optimiste)
              const parsedAmount = receiptForm.amount ? parseFloat(receiptForm.amount.replace(',', '.')) : null;
              if (parsedAmount && parsedAmount > 0) {
                const optimisticExpense: Expense = {
                  id: Date.now(),
                  family_id: 0,
                  member_id: receiptForm.member_id ? Number(receiptForm.member_id) : null,
                  amount: parsedAmount,
                  date: receiptForm.date,
                  category: receiptForm.category,
                  description: receiptForm.description ? `📎 ${receiptForm.description}` : '📎 Ticket',
                  members_info: [],
                };
                setExpenses(prev => [optimisticExpense, ...prev]);
              }

              setShowReceiptModal(false);
              setReceiptPreview(null);
              setReceiptForm({ filename: '', mimetype: '', data: '', amount: '', date: today.toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], description: '', member_id: '' });
              // Sync serveur en arrière-plan
              api.getReceipts().then(recs => {
                const list = recs as Receipt[];
                if (list.length > 0) {
                  setReceipts(list);
                  try { localStorage.setItem(RECEIPTS_CACHE_KEY, JSON.stringify(list.map(r => ({ ...r, data: '' })))); } catch { /* quota */ }
                }
              }).catch(() => {});
              // Sync dépenses en arrière-plan
              fetchData().catch(() => {});
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
            {geminiSuccess && (
              <div style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                ✅ Gemini a rempli les champs automatiquement
              </div>
            )}
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
                // Analyse automatique avec Gemini
                setAnalyzing(true);
                setGeminiSuccess(false);
                try {
                  // Essayer le serveur d'abord, puis clé localStorage en fallback
                  let result = null;
                  try {
                    result = await api.analyzeReceipt(compressed.data, compressed.mimetype);
                    // Si le serveur renvoie un résultat vide (clé manquante ou parsing raté),
                    // essayer directement avec la clé localStorage
                    if (!result.description && result.amount == null) {
                      const local = await analyzeWithGemini(compressed.data, compressed.mimetype);
                      if (local) result = local;
                    }
                  } catch {
                    // Erreur réseau → fallback localStorage
                    result = await analyzeWithGemini(compressed.data, compressed.mimetype);
                  }
                  if (result && (result.description || result.amount != null)) {
                    setReceiptForm(f => ({
                      ...f,
                      amount: result!.amount != null ? String(result!.amount) : f.amount,
                      date: result!.date || f.date,
                      category: (result!.category as import('../types').ExpenseCategory) || f.category,
                      description: result!.description || f.description,
                    }));
                    setGeminiSuccess(true);
                    setTimeout(() => setGeminiSuccess(false), 4000);
                  }
                } finally { setAnalyzing(false); }
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
            <label className="form-label">Compte utilisé (optionnel)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ACCOUNTS.map(acc => {
                const sel = (receiptForm as any).account === acc;
                return (
                  <button key={acc} type="button"
                    onClick={() => setReceiptForm(f => ({ ...f, account: sel ? '' : acc }))}
                    style={{ padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: `2px solid ${sel ? ACCOUNT_COLORS[acc] : 'var(--border)'}`, background: sel ? ACCOUNT_COLORS[acc] : 'var(--surface)', color: sel ? (acc === 'Revolut' ? 'white' : (acc === 'BNP Paribas' ? 'white' : '#1a1a1a')) : 'var(--text)' }}>
                    🏦 {acc}
                  </button>
                );
              })}
            </div>
            <label className="form-label">Qui est concerné ?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={() => setReceiptForm(f => ({ ...f, member_id: '' }))}
                style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${!receiptForm.member_id ? '#6B7280' : 'var(--border)'}`, background: !receiptForm.member_id ? '#6B7280' : 'var(--surface)', color: !receiptForm.member_id ? 'white' : 'var(--text)' }}>
                👨‍👩‍👧‍👦 Tous
              </button>
              {members.map(m => {
                const sel = receiptForm.member_id === String(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setReceiptForm(f => ({ ...f, member_id: sel ? '' : String(m.id) }))}
                    style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${sel ? m.color : 'var(--border)'}`, background: sel ? m.color : 'var(--surface)', color: sel ? 'white' : 'var(--text)' }}>
                    {m.name}
                  </button>
                );
              })}
            </div>
            <button className="btn-primary" type="submit" disabled={loading || analyzing || !receiptForm.data}>
              {analyzing ? '🔍 Analyse...' : loading ? '...' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal aperçu image ticket */}
      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="ticket"
            style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            style={{ marginTop: 16, background: 'white', border: 'none', borderRadius: 24, padding: '10px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            onClick={() => setPreviewUrl(null)}
          >
            Fermer
          </button>
        </div>
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
            <label className="form-label">Qui est concerné ?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, member_ids: allExpenseSelected ? [] : [...allMemberIds] }))}
                style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: '2px solid #6B7280', background: tousExpenseActive ? '#6B7280' : 'var(--surface)', color: tousExpenseActive ? 'white' : 'var(--text)' }}>
                👨‍👩‍👧‍👦 Tous
              </button>
              {members.map(m => {
                const sel = selectedExpenseIds.includes(Number(m.id));
                return (
                  <button key={m.id} type="button" onClick={() => toggleExpenseMember(m.id)}
                    style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${sel ? m.color : 'var(--border)'}`, background: sel ? m.color : 'var(--surface)', color: sel ? 'white' : 'var(--text)' }}>
                    {m.name}
                  </button>
                );
              })}
            </div>
            <label className="form-label">Description (optionnel)</label>
            <input
              className="input"
              placeholder="ex: Cinéma, Pull d'hiver..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <label className="form-label">Compte utilisé (optionnel)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ACCOUNTS.map(acc => {
                const sel = form.account === acc;
                return (
                  <button key={acc} type="button"
                    onClick={() => setForm(f => ({ ...f, account: sel ? '' : acc }))}
                    style={{ padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: `2px solid ${sel ? ACCOUNT_COLORS[acc] : 'var(--border)'}`, background: sel ? ACCOUNT_COLORS[acc] : 'var(--surface)', color: sel ? (acc === 'Revolut' ? 'white' : (acc === 'BNP Paribas' ? 'white' : '#1a1a1a')) : 'var(--text)' }}>
                    🏦 {acc}
                  </button>
                );
              })}
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? '...' : editingExpense ? 'Modifier' : 'Ajouter'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
