import { useState, useEffect } from 'react';
import { api } from '../api';
import { Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function MapPage() {
  const { member: currentMember } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [sharing, setSharing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');

  const fetchMembers = async () => {
    try {
      const data = await api.getMembers();
      setMembers(data as Member[]);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchMembers();
    const interval = setInterval(fetchMembers, 30000);
    return () => clearInterval(interval);
  }, []);

  const shareLocation = async () => {
    if (!currentMember) {
      setStatusType('error');
      setStatusMsg('⚠️ Connecte-toi en tant que membre (ex: Ibrahim) pour partager ta position');
      return;
    }
    if (!navigator.geolocation) {
      setStatusType('error');
      setStatusMsg('❌ Ce navigateur ne supporte pas la géolocalisation');
      return;
    }
    setSharing(true);
    setStatusType('info');
    setStatusMsg('📡 Récupération de ta position...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude);
          setStatusType('success');
          setStatusMsg('✅ Ta position a été partagée avec la famille !');
          await fetchMembers();
          setTimeout(() => setStatusMsg(''), 4000);
        } catch {
          setStatusType('error');
          setStatusMsg('❌ Erreur lors du partage');
        } finally {
          setSharing(false);
        }
      },
      (err) => {
        setSharing(false);
        setStatusType('error');
        if (err.code === 1) {
          setStatusMsg('🔒 Géolocalisation refusée. Va dans les réglages de ton navigateur → autorise la localisation pour ce site.');
        } else if (err.code === 2) {
          setStatusMsg('❌ Position introuvable. Vérifie que le GPS est activé.');
        } else {
          setStatusMsg('❌ Délai dépassé. Réessaie en extérieur ou avec le WiFi.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const openInMaps = (m: Member) => {
    if (m.lat == null || m.lng == null) return;
    window.open(`https://www.google.com/maps?q=${m.lat},${m.lng}`, '_blank');
  };

  const locatedMembers = members.filter(m => m.lat != null && m.lng != null);
  const mapSrc = locatedMembers.length > 0
    ? `https://maps.google.com/maps?q=${locatedMembers[0].lat},${locatedMembers[0].lng}&z=14&output=embed`
    : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          onClick={shareLocation}
          disabled={sharing}
          style={{ flex: 1, minWidth: 160 }}
        >
          {sharing ? '📡 Localisation...' : '📍 Partager ma position'}
        </button>
        <button className="btn-secondary" onClick={fetchMembers} style={{ flex: 1, minWidth: 120 }}>
          🔄 Actualiser
        </button>
      </div>

      {statusMsg && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 500,
          background: statusType === 'success' ? '#DCFCE7' : statusType === 'error' ? '#FEE2E2' : 'var(--primary-light)',
          color: statusType === 'success' ? '#166534' : statusType === 'error' ? '#991B1B' : 'var(--primary-dark)',
        }}>
          {statusMsg}
        </div>
      )}

      {!currentMember && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>
          💡 Connecte-toi avec ton compte membre (onglet "Membre" sur la page de connexion) pour partager ta position.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {members.map(m => (
          <div
            key={m.id}
            className="member-item"
            style={{ cursor: m.lat != null ? 'pointer' : 'default' }}
            onClick={() => openInMaps(m)}
          >
            <div className="member-color-badge" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {m.lat != null
                  ? `🟢 Localisé${m.location_at ? ' à ' + new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''} · Ouvrir Maps →`
                  : '⚪ Position non partagée'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {mapSrc ? (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <iframe
            title="Carte famille"
            src={mapSrc}
            width="100%"
            height="360"
            style={{ border: 'none', display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 8 }}>
          <div className="empty-state-icon">🗺️</div>
          <p>Aucune position partagée</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Connecte-toi en tant que membre et appuie sur "Partager ma position"</p>
        </div>
      )}
    </div>
  );
}
