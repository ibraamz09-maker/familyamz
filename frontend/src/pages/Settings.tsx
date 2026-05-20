import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

type Theme = 'light' | 'dark' | 'rose' | 'blue';
type FontSize = 'small' | 'medium' | 'large';

const THEMES: { id: Theme; emoji: string; label: string; color: string }[] = [
  { id: 'light', emoji: '☀️', label: 'Clair', color: '#5B6EF5' },
  { id: 'dark', emoji: '🌙', label: 'Sombre', color: '#818CF8' },
  { id: 'rose', emoji: '🌸', label: 'Rose', color: '#EC4899' },
  { id: 'blue', emoji: '💙', label: 'Bleu', color: '#0EA5E9' },
];

const FONT_SIZES: { id: FontSize; label: string; preview: string }[] = [
  { id: 'small', label: 'Petit', preview: '13px' },
  { id: 'medium', label: 'Moyen', preview: '15px' },
  { id: 'large', label: 'Grand', preview: '18px' },
];

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
  localStorage.setItem('familyamz_theme', theme);
}

export function applyFontSize(size: FontSize) {
  const px = size === 'small' ? '14px' : size === 'large' ? '18px' : '16px';
  document.documentElement.setAttribute('data-font', size === 'medium' ? '' : size);
  // Forcer sur html ET body pour passer au-dessus de "body { font-size: 16px }"
  document.documentElement.style.fontSize = px;
  document.body.style.fontSize = px;
  localStorage.setItem('familyamz_font', size);
}

export default function Settings() {
  const { logout, member, family } = useAuth();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('familyamz_theme') as Theme) || 'light'
  );
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem('familyamz_font') as FontSize) || 'medium'
  );
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifLoading, setNotifLoading] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('familyamz_gemini_key') || '');
  const [geminiSaved, setGeminiSaved] = useState(false);

  const saveGeminiKey = () => {
    localStorage.setItem('familyamz_gemini_key', geminiKey.trim());
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  };

  useEffect(() => {
    if (!('Notification' in window)) {
      setNotifPerm('unsupported');
    } else {
      setNotifPerm(Notification.permission);
    }
  }, []);

  const enableNotifications = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Les notifications push ne sont pas supportées sur cet appareil.\n\nSur iPhone : installez l\'app sur l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil), puis réessayez.');
      return;
    }
    setNotifLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setNotifPerm(perm);
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        let sub = existing;
        if (!existing) {
          const { key } = await api.getVapidKey();
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        if (sub) await api.subscribePush(sub.toJSON());
        alert('✅ Notifications activées ! Vous recevrez des alertes pour les messages, tâches et événements urgents.');
      } else {
        alert('❌ Notifications refusées.\n\nPour les activer : Réglages → Safari → Notifications → FamilyAmz → Autoriser');
      }
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : 'Impossible d\'activer les notifications'));
    } finally {
      setNotifLoading(false);
    }
  };

  const handleTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  const handleFont = (f: FontSize) => {
    setFontSize(f);
    applyFontSize(f);
  };

  return (
    <div>
      {/* Profil */}
      {member && (
        <div className="settings-profile">
          <div className="settings-avatar" style={{ backgroundColor: member.color }}>
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{member.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Famille {family?.name}</div>
          </div>
        </div>
      )}

      {/* Thème */}
      <p className="section-title">Thème de couleurs</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="theme-grid">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-btn ${theme === t.id ? 'selected' : ''}`}
              style={theme === t.id ? { borderColor: t.color, background: t.color + '18' } : {}}
              onClick={() => handleTheme(t.id)}
            >
              <span style={{ fontSize: 22 }}>{t.emoji}</span>
              <span>{t.label}</span>
              {theme === t.id && (
                <span style={{ marginLeft: 'auto', color: t.color, fontSize: 16 }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Taille du texte */}
      <p className="section-title">Taille du texte</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="font-row">
          {FONT_SIZES.map(f => (
            <button
              key={f.id}
              className={`font-btn ${fontSize === f.id ? 'selected' : ''}`}
              style={{ fontSize: f.preview }}
              onClick={() => handleFont(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10, textAlign: 'center' }}>
          Aperçu : <span style={{ fontWeight: 600 }}>FamilyAmz</span>
        </div>
      </div>

      {/* À propos */}
      <p className="section-title">Application</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-2)', fontSize: 14 }}>Version</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>1.0.0</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-2)', fontSize: 14 }}>Famille</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{family?.name || '–'}</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <p className="section-title">Notifications push</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {notifPerm === 'granted' ? 'Notifications activées ✅' :
                 notifPerm === 'denied' ? 'Notifications bloquées ❌' :
                 notifPerm === 'unsupported' ? 'Non supporté sur cet appareil' :
                 'Notifications désactivées'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                {notifPerm === 'granted' ? 'Vous recevez des alertes en temps réel' :
                 notifPerm === 'denied' ? 'Allez dans Réglages Safari pour les débloquer' :
                 notifPerm === 'unsupported' ? 'Sur iPhone : installez l\'app sur l\'écran d\'accueil d\'abord' :
                 'Appuyez pour recevoir des alertes messages, tâches...'}
              </div>
            </div>
          </div>
        </div>
        {notifPerm !== 'denied' && notifPerm !== 'unsupported' && (
          <button
            onClick={enableNotifications}
            disabled={notifLoading || notifPerm === 'granted'}
            style={{
              width: '100%', padding: '12px', borderRadius: 'var(--radius)',
              background: notifPerm === 'granted' ? 'var(--bg)' : 'var(--primary)',
              color: notifPerm === 'granted' ? 'var(--text-2)' : 'white',
              border: notifPerm === 'granted' ? '1px solid var(--border)' : 'none',
              fontWeight: 700, fontSize: 15, cursor: notifPerm === 'granted' ? 'default' : 'pointer',
            }}
          >
            {notifLoading ? '...' : notifPerm === 'granted' ? '✅ Déjà activées' : '🔔 Activer les notifications'}
          </button>
        )}
        {notifPerm === 'denied' && (
          <div style={{ fontSize: 13, color: 'var(--danger)', background: '#FEE2E2', padding: '10px 12px', borderRadius: 8 }}>
            Les notifications ont été refusées. Pour les réactiver :<br />
            <strong>Réglages iPhone → Safari → {family?.name || 'ce site'} → Notifications → Autoriser</strong>
          </div>
        )}
      </div>

      {/* Déconnexion */}
      <p className="section-title">Compte</p>
      <div className="card">
        <button
          onClick={logout}
          style={{
            width: '100%',
            padding: '14px',
            background: '#FEE2E2',
            color: 'var(--danger)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          🚪 Se déconnecter
        </button>
      </div>
    </div>
  );
}
