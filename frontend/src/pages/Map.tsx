import { useState, useEffect } from 'react';
import { api } from '../api';
import { Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function MapPage() {
  const { member: currentMember } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [sharing, setSharing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchMembers = async () => {
    const data = await api.getMembers();
    setMembers(data as Member[]);
  };

  useEffect(() => {
    fetchMembers();
    const interval = setInterval(fetchMembers, 30000);
    return () => clearInterval(interval);
  }, []);

  const shareLocation = async () => {
    if (!currentMember) {
      setStatusMsg('Connecte-toi en tant que membre pour partager ta position');
      return;
    }
    if (!navigator.geolocation) {
      setStatusMsg('Géolocalisation non supportée par ce navigateur');
      return;
    }
    setSharing(true);
    setStatusMsg('Localisation en cours...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude);
          setStatusMsg('✅ Position partagée !');
          await fetchMembers();
          setTimeout(() => setStatusMsg(''), 3000);
        } catch {
          setStatusMsg('Erreur lors du partage');
        } finally {
          setSharing(false);
        }
      },
      (err) => {
        setStatusMsg('Impossible de te localiser : ' + err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const openInMaps = (m: Member) => {
    if (m.lat == null || m.lng == null) return;
    window.open(`https://www.google.com/maps?q=${m.lat},${m.lng}`, '_blank');
  };

  const locatedMembers = members.filter(m => m.lat != null && m.lng != null);

  // Build a Google Maps embed URL with all located members
  const mapSrc = locatedMembers.length > 0
    ? `https://maps.google.com/maps?q=${locatedMembers[0].lat},${locatedMembers[0].lng}&z=14&output=embed`
    : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          onClick={shareLocation}
          disabled={sharing}
          style={{ flex: 1, minWidth: 160 }}
        >
          {sharing ? '📡 Localisation...' : '📍 Partager ma position'}
        </button>
        <button
          className="btn-secondary"
          onClick={fetchMembers}
          style={{ flex: 1, minWidth: 120 }}
        >
          🔄 Actualiser
        </button>
      </div>

      {statusMsg && (
        <div className="info-banner" style={{ marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}

      {/* Membres et leurs positions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {members.map(m => (
          <div key={m.id} className="member-item" style={{ cursor: m.lat != null ? 'pointer' : 'default' }}
            onClick={() => openInMaps(m)}>
            <div className="member-color-badge" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {m.lat != null
                  ? `🟢 Localisé${m.location_at ? ' à ' + new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''} · Voir sur Maps →`
                  : '⚪ Position inconnue'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Carte Google Maps embed */}
      {mapSrc ? (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
          <iframe
            title="Carte famille"
            src={mapSrc}
            width="100%"
            height="380"
            style={{ border: 'none', display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <div className="empty-state-icon">🗺️</div>
          <p>Aucun membre n'a partagé sa position</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Appuie sur "Partager ma position" pour apparaître</p>
        </div>
      )}
    </div>
  );
}
