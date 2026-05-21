import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { CalendarEvent, Member, MONTHS_FR } from '../types';
import Modal from '../components/Modal';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function dateToStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function getMondayOf(d: Date) {
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day);
  return mon;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ title: '', description: '', member_ids: [] as number[], time: '', end_time: '', urgent: false, recurrence: 'none' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [calView, setCalView] = useState<'day' | 'week'>('day');
  const [viewDate, setViewDate] = useState(new Date(today));
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const savedScrollY = useRef<number>(0);

  const navigateWeek = (dir: -1 | 1) => {
    savedScrollY.current = window.scrollY;
    setViewDate(d => addDays(d, dir * 7));
  };

  const navigateDay = (dir: -1 | 1) => {
    savedScrollY.current = window.scrollY;
    setViewDate(d => addDays(d, dir));
  };

  // Charger les membres séparément (indépendamment des events)
  useEffect(() => {
    api.getMembers().then(mbrs => setMembers(mbrs as Member[])).catch(() => {});
  }, []);

  const fetchMonthData = useCallback(async () => {
    try {
      const evts = await api.getEvents(year, month + 1);
      setEvents(evts as CalendarEvent[]);
    } catch { /* ignore */ }
  }, [year, month]);

  useEffect(() => { fetchMonthData(); }, [fetchMonthData]);

  const fetchWeekData = useCallback(async () => {
    try {
      const monday = getMondayOf(viewDate);
      const sunday = addDays(monday, 6);
      const evts = await api.getEvents(undefined, undefined, dateToStr(monday), dateToStr(sunday));
      setWeekEvents(evts as CalendarEvent[]);
    } catch { /* ignore */ }
  }, [viewDate]);

  useEffect(() => {
    fetchWeekData().then(() => {
      if (savedScrollY.current > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollY.current, behavior: 'instant' });
        });
      }
    });
  }, [fetchWeekData]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= daysInMonth ? d : null;
  });

  const eventsForDayNum = (day: number) => events.filter(e => e.date === toDateStr(year, month, day));
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const openDay = (day: number) => {
    setSelectedDay(day);
    setEditingEvent(null);
    setDetailEvent(null);
    setError('');
    setForm({ title: '', description: '', member_ids: [], time: '', end_time: '', urgent: false, recurrence: 'none' });
    setShowModal(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setDetailEvent(null);
    setEditingEvent(ev);
    setError('');
    let ids: number[] = [];
    try { if (ev.member_ids) ids = JSON.parse(ev.member_ids); } catch {}
    setForm({ title: ev.title, description: ev.description, member_ids: ids, time: ev.time || '', end_time: (ev as any).end_time || '', urgent: !!(ev.urgent), recurrence: ev.recurrence || 'none' });
  };

  const toggleMember = (id: number) => {
    const nid = Number(id); // sécurité BigInt → number
    setForm(f => ({
      ...f,
      member_ids: f.member_ids.map(Number).includes(nid)
        ? f.member_ids.filter(x => Number(x) !== nid)
        : [...f.member_ids, nid]
    }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    if (!editingEvent && selectedDay === null) return;
    setError('');
    setLoading(true);
    try {
      const data = {
        title: form.title,
        description: form.description,
        member_id: form.member_ids.length === 1 ? form.member_ids[0] : null,
        member_ids: form.member_ids,
        date: editingEvent ? editingEvent.date : toDateStr(year, month, selectedDay!),
        time: form.time || '',
        end_time: form.end_time || '',
        urgent: form.urgent,
        recurrence: form.recurrence,
      };
      if (editingEvent) {
        await api.updateEvent(editingEvent.id, data);
        await fetchMonthData();
        await fetchWeekData();
        setEditingEvent(null);
        setShowModal(false);
      } else {
        await api.createEvent(data);
        await fetchMonthData();
        await fetchWeekData();
        setForm({ title: '', description: '', member_ids: [], time: '', end_time: '', urgent: false, recurrence: 'none' });
        setEditingEvent(null);
        setShowModal(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    await api.deleteEvent(id);
    await fetchMonthData();
    await fetchWeekData();
    setDetailEvent(null);
    setShowModal(false);
  };

  const getMembersLabel = (ev: CalendarEvent) => {
    if (ev.members_info && ev.members_info.length > 0) {
      return ev.members_info.map(m => m.name).join(', ');
    }
    if (ev.member_name) return ev.member_name;
    return 'Toute la famille';
  };

  // Variables pour le sélecteur de membres (calculées à chaque render)
  const allMemberIds = members.map(m => Number(m.id));
  const selectedIds = form.member_ids.map(Number);
  const allAreSelected = allMemberIds.length > 0 && allMemberIds.every(id => selectedIds.includes(id));
  const tousActive = selectedIds.length === 0 || allAreSelected;

  // Day view
  const viewDateStr = dateToStr(viewDate);
  const dayEvts = weekEvents.filter(e => e.date === viewDateStr);
  const allDayEvts = dayEvts.filter(e => !e.time);
  const timedEvts = dayEvts.filter(e => !!e.time);

  // Week view
  const monday = getMondayOf(viewDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <div>
      {/* Monthly calendar */}
      <div className="calendar-nav">
        <button className="nav-btn" onClick={prevMonth}>‹</button>
        <h2>{MONTHS_FR[month]} {year}</h2>
        <button className="nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-grid">
        {DAYS_FR.map(d => <div key={d} className="calendar-header-cell">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="calendar-cell empty" />;
          const dayStr = toDateStr(year, month, day);
          const dayEvents = eventsForDayNum(day);
          return (
            <div key={i} className={`calendar-cell${dayStr === todayStr ? ' today' : ''}`} onClick={() => openDay(day)}>
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

      {/* Day/Week toggle */}
      <div className="cal-section-header">
        <div className="view-toggle" style={{ marginBottom: 0 }}>
          <button className={`view-tab ${calView === 'day' ? 'active' : ''}`} onClick={() => setCalView('day')}>📅 Jour</button>
          <button className={`view-tab ${calView === 'week' ? 'active' : ''}`} onClick={() => setCalView('week')}>📆 Semaine</button>
        </div>
      </div>

      {/* Day view */}
      {calView === 'day' && (
        <div className="cal-day-view">
          <div className="month-nav">
            <button className="nav-btn" onClick={() => navigateDay(-1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {DAYS_FULL[(viewDate.getDay() + 6) % 7]} {viewDate.getDate()} {MONTHS_FR[viewDate.getMonth()]}
            </span>
            <button className="nav-btn" onClick={() => navigateDay(1)}>›</button>
          </div>

          {allDayEvts.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="cal-time-label" style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 12 }}>TOUTE LA JOURNÉE</div>
              {allDayEvts.map(ev => (
                <div key={ev.id} className="cal-day-event" style={{ borderLeftColor: ev.urgent ? '#EF4444' : (ev.member_color || '#9CA3AF'), cursor: 'pointer' }} onClick={() => setDetailEvent(ev)}>
                  <span className="cal-event-title">{ev.urgent ? '🚨 ' : ''}{ev.title}</span>
                  <span className="cal-event-member"> · {getMembersLabel(ev)}</span>
                </div>
              ))}
            </div>
          )}

          {HOURS.map(h => {
            const hStr = `${pad(h)}:`;
            const slotEvts = timedEvts.filter(e => e.time?.startsWith(hStr));
            return (
              <div key={h} className={`cal-hour-row${slotEvts.length ? ' has-events' : ''}`}>
                <div className="cal-time-label">{pad(h)}h</div>
                <div className="cal-hour-content">
                  {slotEvts.map(ev => (
                    <div key={ev.id} className="cal-day-event" style={{ borderLeftColor: ev.urgent ? '#EF4444' : (ev.member_color || '#9CA3AF'), cursor: 'pointer' }} onClick={() => setDetailEvent(ev)}>
                      <span className="cal-event-time">{ev.time}{(ev as any).end_time ? ` → ${(ev as any).end_time}` : ''}</span>
                      <span className="cal-event-title"> {ev.urgent ? '🚨 ' : ''}{ev.title}</span>
                      <span className="cal-event-member"> · {getMembersLabel(ev)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {dayEvts.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-icon">📭</div>
              <p>Aucun événement ce jour</p>
            </div>
          )}
        </div>
      )}

      {/* Week view — style Google Agenda */}
      {calView === 'week' && (
        <div className="cal-week-view">
          {/* Navigation semaine */}
          <div className="month-nav">
            <button className="nav-btn" onClick={() => navigateWeek(-1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {monday.getDate()} {MONTHS_FR[monday.getMonth()]} — {addDays(monday, 6).getDate()} {MONTHS_FR[addDays(monday, 6).getMonth()]} {monday.getFullYear()}
            </span>
            <button className="nav-btn" onClick={() => navigateWeek(1)}>›</button>
          </div>

          {/* Bande 7 jours cliquables */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 4 }}>
            {weekDays.map((d, i) => {
              const ds = dateToStr(d);
              const hasEvents = weekEvents.some(e => e.date === ds);
              const isToday = ds === todayStr;
              const isSelected = dateToStr(viewDate) === ds;
              return (
                <button
                  key={i}
                  onClick={() => setViewDate(d)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 2, padding: '6px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: isSelected ? 'var(--primary)' : isToday ? 'var(--primary-light, #EEF2FF)' : 'transparent',
                    color: isSelected ? 'white' : isToday ? 'var(--primary)' : 'var(--text-2)',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{DAYS_FR[i]}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{d.getDate()}</span>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: hasEvents ? (isSelected ? 'white' : 'var(--primary)') : 'transparent',
                  }} />
                </button>
              );
            })}
          </div>

          {/* Agenda liste pour la semaine */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {weekDays.map((d, i) => {
              const ds = dateToStr(d);
              const de = weekEvents
                .filter(e => e.date === ds)
                .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
              const isToday = ds === todayStr;
              if (de.length === 0) return null;
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  {/* En-tête du jour */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: isToday ? 'var(--primary)' : 'var(--surface)',
                      border: `2px solid ${isToday ? 'var(--primary)' : 'var(--border)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      color: isToday ? 'white' : 'var(--text-1)',
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1 }}>{DAYS_FR[i]}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  {/* Événements du jour */}
                  <div style={{ paddingLeft: 46, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {de.map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => setDetailEvent(ev)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                          background: (ev.member_color || '#9CA3AF') + '22',
                          borderLeft: `4px solid ${ev.urgent ? '#EF4444' : (ev.member_color || '#9CA3AF')}`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.urgent ? '🚨 ' : ''}{ev.title}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {ev.time && (
                              <span>🕐 {ev.time}{(ev as any).end_time ? ` → ${(ev as any).end_time}` : ''}</span>
                            )}
                            <span>👤 {getMembersLabel(ev)}</span>
                          </div>
                          {ev.description ? <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{ev.description}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {weekEvents.length === 0 && (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state-icon">📭</div>
                <p>Aucun événement cette semaine</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail modal — click on event */}
      {detailEvent && (
        <Modal title={detailEvent.title} onClose={() => setDetailEvent(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {detailEvent.time && (
              <div className="detail-row">
                <span className="detail-icon">🕐</span>
                <span>
                  {detailEvent.time}
                  {(detailEvent as any).end_time ? ` → ${(detailEvent as any).end_time}` : ''}
                  {' · '}{detailEvent.date}
                </span>
              </div>
            )}
            {!detailEvent.time && (
              <div className="detail-row">
                <span className="detail-icon">📅</span>
                <span>{detailEvent.date}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-icon">👥</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(detailEvent.members_info && detailEvent.members_info.length > 0)
                  ? detailEvent.members_info.map(m => (
                    <span key={m.id} style={{ background: m.color, color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  ))
                  : detailEvent.member_name
                    ? <span style={{ background: detailEvent.member_color || '#6B7280', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>{detailEvent.member_name}</span>
                    : <span style={{ color: 'var(--text-2)', fontSize: 14 }}>Toute la famille</span>
                }
              </div>
            </div>
            {detailEvent.description && (
              <div className="detail-row">
                <span className="detail-icon">📝</span>
                <span style={{ fontSize: 15 }}>{detailEvent.description}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => {
                setSelectedDay(parseInt(detailEvent.date.split('-')[2]));
                openEdit(detailEvent);
                setShowModal(true);
                setDetailEvent(null);
              }}>✏️ Modifier</button>
              <button className="btn-secondary" style={{ color: 'var(--danger)', flex: 1 }} onClick={() => handleDelete(detailEvent.id)}>🗑️ Supprimer</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit modal */}
      {showModal && selectedDay !== null && (
        <Modal title={`${selectedDay} ${MONTHS_FR[month]} ${year}`} onClose={() => { setShowModal(false); setEditingEvent(null); setError(''); }}>
          {!editingEvent && (
            <div className="event-list">
              {eventsForDayNum(selectedDay).map(ev => (
                <div key={ev.id} className="event-item" style={{ borderLeftColor: ev.urgent ? '#EF4444' : (ev.member_color || '#9CA3AF'), cursor: 'pointer' }} onClick={() => setDetailEvent(ev)}>
                  <div className="event-item-content">
                    {ev.time && <span className="event-time-badge">{ev.time}{(ev as any).end_time ? ` → ${(ev as any).end_time}` : ''}</span>}
                    {ev.urgent ? <strong>🚨 {ev.title}</strong> : <strong>{ev.title}</strong>}
                    {ev.recurrence && ev.recurrence !== 'none' && <span className="recurrence-badge">🔁 {ev.recurrence === 'weekly' ? 'Hebdo' : 'Mensuel'}</span>}
                    <span className="event-member"> · {getMembersLabel(ev)}</span>
                    {ev.description && <p className="event-desc">{ev.description}</p>}
                  </div>
                  <div className="event-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn-icon" onClick={() => openEdit(ev)}>✏️</button>
                    <button className="btn-icon" onClick={() => handleDelete(ev.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="add-event-section">
            <h3>{editingEvent ? 'Modifier' : 'Ajouter un événement'}</h3>
            {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
            <label className="form-label">Titre *</label>
            <input className="input" placeholder="Titre de l'événement" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <label className="form-label">Heure de début (optionnel)</label>
            <input className="input" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value, end_time: '' }))} />
            {form.time && (
              <>
                <label className="form-label">Heure de fin (optionnel)</label>
                <input className="input" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} min={form.time} />
              </>
            )}
            <label className="form-label">Qui est concerné ?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, member_ids: allAreSelected ? [] : [...allMemberIds] }))}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: '2px solid #6B7280',
                  background: tousActive ? '#6B7280' : 'var(--surface)',
                  color: tousActive ? 'white' : 'var(--text)',
                }}
              >
                👨‍👩‍👧‍👦 Tous
              </button>
              {members.map(m => {
                const isSelected = selectedIds.includes(Number(m.id));
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    style={{
                      padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      border: `2px solid ${isSelected ? m.color : 'var(--border)'}`,
                      background: isSelected ? m.color : 'var(--surface)',
                      color: isSelected ? 'white' : 'var(--text)',
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
              {members.length === 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-2)', paddingTop: 8 }}>Chargement des membres...</span>
              )}
            </div>
            <label className="form-label">Description (optionnel)</label>
            <textarea className="textarea" placeholder="Lieu, détails..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

            <label className="form-label">Récurrence</label>
            <select className="select" value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}>
              <option value="none">Aucune</option>
              <option value="weekly">Toutes les semaines (12 semaines)</option>
              <option value="monthly">Tous les mois (6 mois)</option>
            </select>

            <div
              onClick={() => setForm(f => ({ ...f, urgent: !f.urgent }))}
              style={{
                padding: '12px 16px', borderRadius: 12, cursor: 'pointer', marginBottom: 14,
                border: `2px solid ${form.urgent ? '#EF4444' : 'var(--border)'}`,
                background: form.urgent ? '#FEE2E2' : 'var(--surface)',
                display: 'flex', alignItems: 'center', gap: 12, userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 22 }}>{form.urgent ? '🚨' : '⚡'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: form.urgent ? '#EF4444' : 'var(--text)' }}>Urgent</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Notification immédiate envoyée à tous</div>
              </div>
              <span style={{ fontSize: 20 }}>{form.urgent ? '☑️' : '⬜'}</span>
            </div>
            <div className="modal-submit-sticky">
              <button className="btn-primary" onClick={handleSubmit} disabled={loading || !form.title.trim()} style={{ width: '100%' }}>
                {loading ? 'Enregistrement...' : editingEvent ? '✓ Modifier' : '✓ Ajouter'}
              </button>
              {editingEvent && (
                <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => { setEditingEvent(null); setForm({ title: '', description: '', member_ids: [], time: '', end_time: '', urgent: false, recurrence: 'none' }); }}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
