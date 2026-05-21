import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Message, Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

// Génère une forme d'onde fictive pour les messages vocaux
const WAVE_BARS = [4, 8, 12, 6, 14, 10, 8, 16, 12, 6, 10, 14, 8, 4, 12, 8, 6, 14, 10, 8];

function VoiceBubble({ audio, isMe }: { audio: string; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.src = audio;
      a.onended = () => setPlaying(false);
      a.onerror = () => { setPlaying(false); };
      audioRef.current = a;
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise.then(() => setPlaying(true)).catch(() => {
          // Sur iOS, relancer depuis l'event handler direct
          audioRef.current?.play().catch(() => {});
          setPlaying(true);
        });
      } else {
        setPlaying(true);
      }
    }
  };

  return (
    <div className="voice-bubble">
      <button className={`voice-play-btn ${isMe ? '' : 'other-voice'}`} onClick={toggle}>
        {playing ? '⏹' : '▶'}
      </button>
      <div className="voice-waveform">
        {WAVE_BARS.map((h, i) => (
          <div
            key={i}
            className={`voice-bar ${isMe ? '' : 'other-bar'}`}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>🎤 vocal</span>
    </div>
  );
}

export default function Messages() {
  const { member, family } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Rappel ciblé
  const [showReminder, setShowReminder] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<Member | null>(null);
  const [reminderText, setReminderText] = useState('');
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderDone, setReminderDone] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async () => {
    try {
      const data = await api.getMessages();
      setMessages(data as Message[]);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.getMembers().then(d => setMembers(d as Member[])).catch(() => {});
  }, []);

  const sendReminder = async () => {
    if (!reminderTarget || !reminderText.trim()) return;
    setReminderSending(true);
    try {
      await api.notifyMember(reminderTarget.id, `📲 Rappel de ${member?.name || 'la famille'}`, reminderText.trim());
      setReminderDone(true);
      setTimeout(() => {
        setShowReminder(false);
        setReminderTarget(null);
        setReminderText('');
        setReminderDone(false);
      }, 1500);
    } catch { alert('Erreur lors de l\'envoi du rappel'); }
    finally { setReminderSending(false); }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    try {
      await api.sendMessage(text.trim());
      setText('');
      await fetchMessages();
      inputRef.current?.focus();
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    await api.deleteMessage(id);
    setMessages(m => m.filter(msg => msg.id !== id));
  };

  const handleEphemeral = async (days: number) => {
    setDeleting(true);
    try {
      await api.deleteEphemeral(days);
      await fetchMessages();
      setShowSettings(false);
    } finally { setDeleting(false); }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Votre navigateur ne supporte pas l\'enregistrement audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Détecter le meilleur format supporté
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const actualType = mr.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (blob.size < 100) return; // Enregistrement vide
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          setLoading(true);
          try {
            await api.sendMessage('', base64);
            await fetchMessages();
          } finally { setLoading(false); }
        };
        reader.readAsDataURL(blob);
      };
      mr.start(100); // Collecter les données toutes les 100ms
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions dans les réglages de votre navigateur.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingSeconds(0);
    }
  };

  const senderName = member?.name || family?.name || 'Famille';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const formatRecSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="chat-container">
      {/* Rappel ciblé — modal */}
      {showReminder && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setShowReminder(false)}>
          <div style={{
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            padding: '24px 20px 32px', width: '100%', maxWidth: 480,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>📲 Envoyer un rappel</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              La notification sera envoyée uniquement à la personne choisie.
            </div>

            {/* Sélection du membre */}
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>À qui ?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {members.filter(m => m.id !== member?.id).map(m => (
                <button
                  key={m.id}
                  onClick={() => setReminderTarget(m)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14,
                    border: `2px solid ${reminderTarget?.id === m.id ? m.color : 'var(--border)'}`,
                    background: reminderTarget?.id === m.id ? m.color : 'var(--surface)',
                    color: reminderTarget?.id === m.id ? 'white' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >{m.name}</button>
              ))}
            </div>

            {/* Message */}
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>Message</div>
            <input
              className="input"
              placeholder="Ex : N'oublie pas ton rendez-vous à 15h !"
              value={reminderText}
              onChange={e => setReminderText(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <button
              className="btn-primary"
              style={{ width: '100%', fontSize: 15, padding: '12px' }}
              disabled={!reminderTarget || !reminderText.trim() || reminderSending}
              onClick={sendReminder}
            >
              {reminderDone ? '✅ Rappel envoyé !' : reminderSending ? 'Envoi...' : `📲 Envoyer à ${reminderTarget?.name || '...'}`}
            </button>
          </div>
        </div>
      )}

      {/* Bouton paramètres + rappel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '6px 14px', fontSize: 13,
            fontWeight: 600, color: 'var(--primary)', cursor: 'pointer',
          }}
          onClick={() => setShowReminder(true)}
        >📲 Rappel ciblé</button>
        <button
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-2)', padding: '4px 8px' }}
          onClick={() => setShowSettings(!showSettings)}
          title="Paramètres"
        >⚙️</button>
      </div>

      {/* Panneau paramètres éphémères */}
      {showSettings && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🗑️ Supprimer les messages de plus de :</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[7, 14, 30].map(d => (
              <button key={d} className="btn-secondary" disabled={deleting} style={{ flex: 1, fontSize: 13 }} onClick={() => handleEphemeral(d)}>
                {d} jours
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>Les messages récents seront conservés.</div>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p>Aucun message</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Soyez le premier à écrire !</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.member_name === senderName;
          return (
            <div key={msg.id} className={`chat-bubble-row ${isMe ? 'me' : 'other'}`}>
              {!isMe && (
                <div className="chat-avatar" style={{ backgroundColor: msg.member_color }}>
                  {msg.member_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="chat-bubble-wrap">
                <div className={`chat-sender ${isMe ? 'chat-sender-me' : ''}`}>
                  {isMe ? 'Moi' : msg.member_name}
                </div>
                <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`}>
                  {msg.audio ? (
                    <VoiceBubble audio={msg.audio} isMe={isMe} />
                  ) : (
                    msg.text
                  )}
                  {isMe && (
                    <button className="chat-delete" onClick={() => handleDelete(msg.id)} title="Supprimer">×</button>
                  )}
                </div>
                <div className="chat-time">{formatTime(msg.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Barre de saisie */}
      <form className="chat-input-bar" onSubmit={handleSend}>
        {isRecording ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#FEE2E2', borderRadius: 24, border: '1.5px solid var(--danger)' }}>
            <span style={{ fontSize: 18 }}>🔴</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>
              Enregistrement… {formatRecSecs(recordingSeconds)}
            </span>
          </div>
        ) : (
          <input
            ref={inputRef}
            className="chat-input-field"
            placeholder="Écrire un message..."
            value={text}
            onChange={e => setText(e.target.value)}
            autoComplete="off"
          />
        )}

        {/* Bouton micro */}
        <button
          type="button"
          className={`record-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          title={isRecording ? 'Arrêter l\'enregistrement' : 'Message vocal'}
        >
          {isRecording ? '⏹' : '🎤'}
        </button>

        {/* Bouton envoyer (désactivé si enregistrement) */}
        {!isRecording && (
          <button type="submit" className="chat-send-btn" disabled={loading || !text.trim()}>
            {loading ? '…' : '➤'}
          </button>
        )}
      </form>
    </div>
  );
}
