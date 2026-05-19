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

  const shareLocation = () => {
    if (!currentMember) {
      setStatusType('error');
      setStatusMsg('⚠️ Connecte-toi en tant que membre pour partager ta position');
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

    // Essai sans haute précision (plus compatible iOS Safari)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude);
          setStatusType('success');
          setStatusMsg('✅ Position partagée avec la famille !');
          await fetchMembers();
          setTimeout(() => setStatusMsg(''), 4000);
        } catch {
          setStatusType('error');
          setStatusMsg('❌ Erreur réseau lors du partage');
        } finally {
          setSharing(false);
        }
      },
      (err) => {
        setSharing(false);
        setStatusType('error');
        if (err.code === 1) {
          setStatusMsg('🔒 Accès refusé. Sur iPhone : Réglages → Confidentialité → Service de localisation → Safari Sites web → "Lors de l\'utilisation"');
        } else if (err.code === 2) {
          setStatusMsg('❌ Position introuvable. Active le GPS et réessaie en extérieur.');
        } else {
          setStatusMsg('❌ Délai dépassé. Réessaie dans quelques secondes.');
        }
      },
      // Pas de enableHighAccuracy pour meilleure compatibilité iOS
      { timeout: 20000, maximumAge: 60000 }
    );
  };

  const locatedMembers = members.filter(m => m.lat != null && m.lng != null);

  // Carte statique OpenStreetMap avec tous les membres localisés
  const getMapUrl = () => {
    if (locatedMembers.length === 0) return null;

    // Calculer le centre
    const avgLat = locatedMembers.reduce((s, m) => s + m.lat!, 0) / locatedMembers.length;
    const avgLng = locatedMembers.reduce((s, m) => s + m.lng!, 0) / locatedMembers.length;

    // Marqueurs pour chaque membre
    const markers = locatedMembers
      .map(m => `${m.lat},${m.lng},red-pushpin`)
      .join('|');

    // Zoom adapté au nombre de membres
    const zoom = locatedMembers.length === 1 ? 15 : 13;

    return `https://staticmap.openstreetmap.de/staticmap.php?center=${avgLat},${avgLng}&zoom=${zoom}&size=400x300&markers=${markers}`;
  };

  const mapUrl = getMapUrl();

  const openMemberInMaps = (m: Member) => {
    if (m.lat == null || m.lng == null) return;
    window.open(`https://maps.google.com/maps?q=${m.lat},${m.lng}`, '_blank');
  };

  return (
    <div>
      {/* Boutons */}
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

      {/* Message statut */}
      {statusMsg && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.5,
          background: statusType === 'success' ? '#DCFCE7' : statusType === 'error' ? '#FEE2E2' : 'var(--primary-light)',
          color: statusType === 'success' ? '#166534' : statusType === 'error' ? '#991B1B' : 'var(--primary-dark)',
        }}>
          {statusMsg}
        </div>
      )}

      {/* Avertissement si pas membre */}
      {!currentMember && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>
          💡 Connecte-toi avec ton prénom (onglet "Membre") pour partager ta position.
        </div>
      )}

      {/* Carte avec tous les membres */}
      {mapUrl ? (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 14, background: '#f0f0f0' }}>
          <img
            src={mapUrl}
            alt="Carte famille"
            style={{ width: '100%', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
            © OpenStreetMap · {locatedMembers.length} membre{locatedMembers.length > 1 ? 's' : ''} localisé{locatedMembers.length > 1 ? 's' : ''}
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ marginBottom: 14 }}>
          <div className="empty-state-icon">🗺️</div>
          <p>Aucune position partagée</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>La carte apparaîtra ici dès qu'un membre partage sa position</p>
        </div>
      )}

      {/* Liste des membres */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map(m => (
          <div
            key={m.id}
            className="member-item"
            style={{ cursor: m.lat != null ? 'pointer' : 'default' }}
            onClick={() => openMemberInMaps(m)}
          >
            <div className="member-color-badge" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {m.lat != null
                  ? `🟢 ${m.location_at ? new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'localisé'} · Voir sur Google Maps →`
                  : '⚪ Position non partagée'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
