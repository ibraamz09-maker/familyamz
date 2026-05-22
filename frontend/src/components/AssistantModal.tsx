import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { EXPENSE_CATEGORIES, MONTHS_FR } from '../types';

interface Props {
  onClose: () => void;
  members: { id: number; name: string; color: string }[];
  onDone: () => void;
}

const ACTION_LABELS: Record<string, { emoji: string; label: string }> = {
  add_event:   { emoji: '📅', label: 'Ajouter un événement' },
  add_task:    { emoji: '✅', label: 'Ajouter une tâche' },
  add_expense: { emoji: '💶', label: 'Ajouter une dépense' },
  send_message:{ emoji: '💬', label: 'Envoyer un message' },
  unknown:     { emoji: '❓', label: 'Commande non reconnue' },
};

export default function AssistantModal({ onClose, members, onDone }: Props) {
  const [step, setStep] = useState<'listen' | 'analyzing' | 'confirm' | 'executing' | 'done' | 'error'>('listen');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<{ action: string; summary: string; data: Record<string, unknown> } | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const recogRef = useRef<any>(null);
  const transcriptRef = useRef('');

  // Nettoyage au démontage
  useEffect(() => () => { recogRef.current?.stop(); }, []);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('La reconnaissance vocale n\'est pas supportée sur ce navigateur. Essaie Chrome ou Safari.');
      setStep('error');
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = 'fr-FR';
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      setTranscript(t);
      transcriptRef.current = t; // toujours à jour, même dans les closures
    };
    recog.onend = () => {
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final) analyze(final);
    };
    recog.onerror = () => { setListening(false); };

    recog.start();
    recogRef.current = recog;
    setListening(true);
    setTranscript('');
    transcriptRef.current = '';
  };

  const stopListening = () => {
    recogRef.current?.stop();
    setListening(false);
  };

  const analyze = async (text: string) => {
    setStep('analyzing');
    try {
      const res = await api.analyzeVoice(text);
      setResult(res);
      setEditData({ ...res.data });
      setStep('confirm');
    } catch (e: any) {
      setError(e.message || 'Erreur Gemini');
      setStep('error');
    }
  };

  const execute = async () => {
    if (!result) return;
    setStep('executing');
    try {
      const d = editData;
      if (result.action === 'add_event') {
        const memberIds = members
          .filter(m => (d.members as string[] || []).includes(m.name))
          .map(m => m.id);
        await api.createEvent({
          title: String(d.title || ''),
          date: String(d.date || new Date().toISOString().slice(0, 10)),
          time: String(d.time || ''),
          end_time: String(d.end_time || ''),
          description: String(d.description || ''),
          member_ids: memberIds,
          recurrence: d.recurrence && d.recurrence !== 'none' ? String(d.recurrence) : undefined,
          recurrence_count: d.recurrence_count ? Number(d.recurrence_count) : undefined,
        } as any);
      } else if (result.action === 'add_task') {
        await api.createTask(String(d.title || ''), d.recurrence === 'daily' ? 'daily' : 'none');
      } else if (result.action === 'add_expense') {
        await api.createExpense({
          amount: Number(d.amount) || 0,
          date: String(d.date || new Date().toISOString().slice(0, 10)),
          category: String(d.category || 'Autres'),
          description: String(d.description || ''),
        });
      } else if (result.action === 'send_message') {
        await api.sendMessage(String(d.text || ''));
      }
      setStep('done');
      setTimeout(() => { onDone(); onClose(); }, 1500);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'exécution');
      setStep('error');
    }
  };

  const info = result ? (ACTION_LABELS[result.action] || ACTION_LABELS.unknown) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={step === 'listen' ? onClose : undefined}>
      <div style={{
        background: 'var(--surface)', borderRadius: '24px 24px 0 0',
        width: '100%', maxWidth: 480,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '88vh',
      }} onClick={e => e.stopPropagation()}>

        {/* Zone scrollable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px 20px 8px' }}>

          {/* ── ÉCOUTE ── */}
          {step === 'listen' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--text-1)' }}>Assistant FamilyAmz</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
                {listening ? 'Je t\'écoute...' : 'Appuie sur le micro et parle'}
              </div>

              {transcript && (
                <div style={{
                  background: 'var(--bg)', borderRadius: 12, padding: '10px 14px',
                  fontSize: 14, color: 'var(--text-1)', marginBottom: 16, fontStyle: 'italic',
                }}>"{transcript}"</div>
              )}

              <button
                onClick={listening ? stopListening : startListening}
                style={{
                  width: 80, height: 80, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: listening ? '#EF4444' : 'var(--primary)',
                  color: 'white', fontSize: 32, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 16px',
                  boxShadow: listening ? '0 0 0 12px rgba(239,68,68,0.2)' : '0 4px 16px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s',
                  animation: listening ? 'pulse 1.5s infinite' : 'none',
                }}
              >
                {listening ? '⏹️' : '🎙️'}
              </button>

              {listening && (
                <div style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>
                  Parle... appuie pour arrêter
                </div>
              )}

              {!listening && !transcript && (
                <div style={{ marginTop: 20, textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, marginBottom: 8 }}>Exemples :</div>
                  {[
                    '📅 "Rendez-vous docteur lundi à 14h"',
                    '✅ "Rappelle-moi de nourrir le chat chaque jour"',
                    '💶 "J\'ai dépensé 45€ de courses"',
                    '💬 "Dis à Ibrahim de rentrer tôt"',
                  ].map(ex => (
                    <div key={ex} style={{ fontSize: 12, color: 'var(--text-2)', padding: '4px 0' }}>{ex}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ANALYSE ── */}
          {step === 'analyzing' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Gemini analyse ta demande...</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, fontStyle: 'italic' }}>"{transcript}"</div>
            </div>
          )}

          {/* ── CONFIRMATION ── */}
          {step === 'confirm' && result && info && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>{info.emoji}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{info.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{result.summary}</div>
                </div>
              </div>

              {result.action === 'unknown' ? (
                <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
                  Je n'ai pas compris ta demande. Réessaie en étant plus précis.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {result.action === 'add_event' && (<>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Titre</label>
                      <input className="input" value={String(editData.title || '')} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Date</label>
                      <input className="input" type="date" value={String(editData.date || '')} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Heure début</label>
                        <input className="input" type="time" value={String(editData.time || '')} onChange={e => setEditData(d => ({ ...d, time: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                      <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Heure fin</label>
                        <input className="input" type="time" value={String(editData.end_time || '')} onChange={e => setEditData(d => ({ ...d, end_time: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                    </div>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Description</label>
                      <input className="input" value={String(editData.description || '')} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} style={{ marginBottom: 0 }} /></div>

                    {/* Récurrence */}
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>🔄 Récurrence</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {[
                          { val: 'none', label: 'Aucune' },
                          { val: 'weekly', label: 'Chaque semaine' },
                          { val: 'monthly', label: 'Chaque mois' },
                          { val: 'yearly', label: 'Chaque année' },
                        ].map(opt => {
                          const sel = (editData.recurrence || 'none') === opt.val;
                          return <button key={opt.val} type="button"
                            onClick={() => setEditData(d => ({ ...d, recurrence: opt.val, recurrence_count: opt.val === 'none' ? undefined : (d.recurrence_count || 4) }))}
                            style={{ padding: '5px 12px', borderRadius: 16, border: `2px solid ${sel ? '#6366F1' : 'var(--border)'}`, background: sel ? '#EEF2FF' : 'var(--surface)', color: sel ? '#4338CA' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            {opt.label}
                          </button>;
                        })}
                      </div>
                      {(editData.recurrence as string) && (editData.recurrence as string) !== 'none' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Nombre de fois :
                          </label>
                          <input className="input" type="number" min={1} max={52}
                            value={String(editData.recurrence_count || 4)}
                            onChange={e => setEditData(d => ({ ...d, recurrence_count: parseInt(e.target.value) || 1 }))}
                            style={{ marginBottom: 0, width: 70 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {editData.recurrence === 'weekly' ? 'semaines' : editData.recurrence === 'monthly' ? 'mois' : 'ans'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Membres</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {members.map(m => {
                          const sel = (editData.members as string[] || []).includes(m.name);
                          return <button key={m.id} type="button" onClick={() => setEditData(d => {
                            const cur = (d.members as string[] || []);
                            return { ...d, members: sel ? cur.filter(n => n !== m.name) : [...cur, m.name] };
                          })} style={{ padding: '4px 12px', borderRadius: 16, border: `2px solid ${sel ? m.color : 'var(--border)'}`, background: sel ? m.color : 'var(--surface)', color: sel ? 'white' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{m.name}</button>;
                        })}
                      </div>
                    </div>
                  </>)}

                  {result.action === 'add_task' && (<>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Tâche</label>
                      <input className="input" value={String(editData.title || '')} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                    <button type="button" onClick={() => setEditData(d => ({ ...d, recurrence: d.recurrence === 'daily' ? 'none' : 'daily' }))}
                      style={{ padding: '8px 14px', borderRadius: 10, border: `2px solid ${editData.recurrence === 'daily' ? '#6366F1' : 'var(--border)'}`, background: editData.recurrence === 'daily' ? '#EEF2FF' : 'var(--surface)', color: editData.recurrence === 'daily' ? '#4338CA' : 'var(--text-2)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      🔄 {editData.recurrence === 'daily' ? 'Tâche quotidienne activée' : 'Rendre quotidienne'}
                    </button>
                  </>)}

                  {result.action === 'add_expense' && (<>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Montant (€)</label>
                        <input className="input" type="number" step="0.01" value={String(editData.amount || '')} onChange={e => setEditData(d => ({ ...d, amount: parseFloat(e.target.value) }))} style={{ marginBottom: 0 }} /></div>
                      <div style={{ flex: 1 }}><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Date</label>
                        <input className="input" type="date" value={String(editData.date || '')} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                    </div>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Catégorie</label>
                      <select className="select" value={String(editData.category || 'Autres')} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))}>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Description</label>
                      <input className="input" value={String(editData.description || '')} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} style={{ marginBottom: 0 }} /></div>
                  </>)}

                  {result.action === 'send_message' && (
                    <div><label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Message</label>
                      <textarea className="textarea" value={String(editData.text || '')} onChange={e => setEditData(d => ({ ...d, text: e.target.value }))} rows={3} style={{ marginBottom: 0 }} /></div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── EXÉCUTION ── */}
          {step === 'executing' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Exécution en cours...</div>
            </div>
          )}

          {/* ── SUCCÈS ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#16A34A' }}>C'est fait !</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>{result?.summary}</div>
            </div>
          )}

          {/* ── ERREUR ── */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>😕</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#EF4444' }}>Erreur</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>{error}</div>
            </div>
          )}

        </div>

        {/* ── BOUTONS FIXES EN BAS ── toujours visibles */}
        <div style={{ padding: '12px 20px 36px', borderTop: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '0 0 24px 24px', flexShrink: 0 }}>
          {step === 'listen' && (
            <button onClick={onClose} style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-2)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Fermer
            </button>
          )}
          {step === 'confirm' && result && (
            <div style={{ display: 'flex', gap: 8 }}>
              {result.action !== 'unknown' && (
                <button className="btn-primary" style={{ flex: 2, padding: '14px', fontSize: 16 }} onClick={execute}>
                  ✅ Accepter
                </button>
              )}
              <button className="btn-secondary" style={{ flex: 1, padding: '14px' }}
                onClick={() => { setStep('listen'); setTranscript(''); setResult(null); }}>
                🎙️ Réessayer
              </button>
            </div>
          )}
          {step === 'error' && (
            <button className="btn-secondary" style={{ width: '100%', padding: '14px' }} onClick={() => { setStep('listen'); setError(''); }}>
              🎙️ Réessayer
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 8px rgba(239,68,68,0.15); }
          50% { box-shadow: 0 0 0 16px rgba(239,68,68,0.08); }
        }
      `}</style>
    </div>
  );
}
