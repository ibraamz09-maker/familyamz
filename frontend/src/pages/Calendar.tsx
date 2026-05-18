import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { CalendarEvent, Member, MONTHS_FR } from '../types';
import Modal from '../components/Modal';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ title: '', description: '', member_id: '' });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const [evts, mbrs] = await Promise.all([
      api.getEvents(year, month + 1),
      api.getMembers(),
    ]);
    setEvents(evts as CalendarEvent[]);
    setMembers(mbrs as Member[]);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= daysInMonth ? d : null;
  });

  const eventsForDay = (day: number) => {
    const s = toDateStr(year, month, day);
    return events.filter(e => e.date === s);
  };

  const openDay = (day: number) => {
    setSelectedDay(day);
    setEditingEvent(null);
    setForm({ title: '', description: '', member_id: '' });
    setShowModal(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setForm({ title: ev.title, description: ev.description, member_id: ev.member_id ? String(ev.member_id) : '' });
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || selectedDay === null) return;
    setLoading(true);
    try {
      const data = {
        title: form.title,
        description: form.description,
        member_id: form.member_id ? Number(form.member_id) : null,
        date: editingEvent ? editingEvent.date : toDateStr(year, month, selectedDay),
      };
      if (editingEvent) await api.updateEvent(editingEvent.id, data);
      else await api.createEvent(data);
      await fetchData();
      setForm({ title: '', description: '', member_id: '' });
      setEditingEvent(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteEvent(id);
    await fetchData();
  };

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div className="calendar-nav">
        <button className="nav-btn" onClick={prevMonth}>‹</button>
        <h2>{MONTHS_FR[month]} {year}</h2>
        <button className="nav-btn" onClick={nextMonth}>›</button>
      </div>

      <div className="calendar-grid">
        {DAYS_FR.map(d => (
          <div key={d} className="calendar-header-cell">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="calendar-cell empty" />;
          const dayStr = toDateStr(year, month, day);
          const dayEvents = eventsForDay(day);
          return (
            <div
              key={i}
              className={`calendar-cell${dayStr === todayStr ? ' today' : ''}`}
              onClick={() => openDay(day)}
            >
              <span className="day-number">{day}</span>
              <div className="event-dots">
                {dayEvents.slice(0, 3).map(e => (
                  <span key={e.id} className="event-dot" style={{ backgroundColor: e.member_color || '#9CA3AF' }} />
                ))}
                {dayEvents.length > 3 && <span className="more-events">+{dayEvents.length - 3}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && selectedDay !== null && (
        <Modal
          title={`${selectedDay} ${MONTHS_FR[month]} ${year}`}
          onClose={() => { setShowModal(false); setEditingEvent(null); }}
        >
          {!editingEvent && (
            <div className="event-list">
              {eventsForDay(selectedDay).map(ev => (
                <div key={ev.id} className="event-item" style={{ borderLeftColor: ev.member_color || '#9CA3AF' }}>
                  <div className="event-item-content">
                    <strong>{ev.title}</strong>
                    {ev.member_name && <span className="event-member"> · {ev.member_name}</span>}
                    {ev.description && <p className="event-desc">{ev.description}</p>}
                  </div>
                  <div className="event-actions">
                    <button className="btn-icon" onClick={() => openEdit(ev)}>✏️</button>
                    <button className="btn-icon" onClick={() => handleDelete(ev.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="add-event-section">
            <h3>{editingEvent ? 'Modifier l\'événement' : 'Ajouter un événement'}</h3>
            <label className="form-label">Titre</label>
            <input
              className="input"
              placeholder="Titre de l'événement"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <label className="form-label">Membre concerné</label>
            <select className="select" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">Toute la famille</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <label className="form-label">Description (optionnel)</label>
            <textarea
              className="textarea"
              placeholder="Détails..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <button className="btn-primary" onClick={handleSubmit} disabled={loading || !form.title.trim()}>
              {loading ? '...' : editingEvent ? 'Modifier' : 'Ajouter'}
            </button>
            {editingEvent && (
              <button className="btn-secondary" onClick={() => { setEditingEvent(null); setForm({ title: '', description: '', member_id: '' }); }}>
                Annuler la modification
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
