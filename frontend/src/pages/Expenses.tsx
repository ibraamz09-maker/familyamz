import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../api';
import { Expense, Member, EXPENSE_CATEGORIES, CATEGORY_COLORS, MONTHS_FR } from '../types';
import Modal from '../components/Modal';

function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }

export default function Expenses() {
  const today = new Date();
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');
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

  const fetchData = useCallback(async () => {
    const [exps, mbrs] = await Promise.all([
      view === 'monthly' ? api.getExpenses(year, month + 1) : api.getExpenses(year),
      api.getMembers(),
    ]);
    setExpenses(exps as Expense[]);
    setMembers(mbrs as Member[]);
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
        <button className={`view-tab ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>
          Mensuel
        </button>
        <button className={`view-tab ${view === 'annual' ? 'active' : ''}`} onClick={() => setView('annual')}>
          Annuel
        </button>
      </div>

      {/* Navigation */}
      {view === 'monthly' ? (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => {
            if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
          }}>‹</button>
          <span>{MONTHS_FR[month]} {year}</span>
          <button className="nav-btn" onClick={() => {
            if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
          }}>›</button>
        </div>
      ) : (
        <div className="month-nav">
          <button className="nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
          <span>{year}</span>
          <button className="nav-btn" onClick={() => setYear(y => y + 1)}>›</button>
        </div>
      )}

      {/* Total */}
      <div className="total-card">
        <div>
          <div className="total-label">{view === 'monthly' ? `Total ${MONTHS_FR[month]}` : `Total ${year}`}</div>
          <div className="total-amount">{fmt(total)}</div>
        </div>
        <span style={{ fontSize: 32 }}>💶</span>
      </div>

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
      ) : (
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
      )}

      <div style={{ height: 24 }} />

      <button className="fab" onClick={openAdd} title="Ajouter une dépense">+</button>

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
