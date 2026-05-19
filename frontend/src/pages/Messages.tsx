import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Message } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function Messages() {
  const { member, family } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteMessage(id);
    setMessages(m => m.filter(msg => msg.id !== id));
  };

  const senderName = member?.name || family?.name || 'Famille';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p>Aucun message pour l'instant</p>
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
                {!isMe && <div className="chat-sender">{msg.member_name}</div>}
                <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`}>
                  {msg.text}
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

      <form className="chat-input-bar" onSubmit={handleSend}>
        <input
          ref={inputRef}
          className="chat-input-field"
          placeholder="Écrire un message..."
          value={text}
          onChange={e => setText(e.target.value)}
          autoComplete="off"
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !text.trim()}
        >
          {loading ? '…' : '➤'}
        </button>
      </form>
    </div>
  );
}
