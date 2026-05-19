import { useState, useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { api } from '../api';
import { Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function MapPage() {
  const { member: currentMember } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [sharing, setSharing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const fetchMembers = async () => {
    const data = await api.getMembers();
    setMembers(data as Member[]);
  };

  useEffect(() => {
    fetchMembers();
    const interval = setInterval(fetchMembers, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        center: [48.8566, 2.3522],
        zoom: 12,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    updateMarkers(members);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  function updateMarkers(memberList: Member[]) {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const located = memberList.filter(m => m.lat != null && m.lng != null);
    if (located.length === 0) return;

    const bounds: [number, number][] = [];

    located.forEach(m => {
      const lat = m.lat!;
      const lng = m.lng!;
      bounds.push([lat, lng]);

      const icon = L.divIcon({
        html: `<div style="
          background:${m.color};
          color:white;
          width:36px;height:36px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:15px;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
        ">${m.name.charAt(0).toUpperCase()}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const timeStr = m.location_at
        ? new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '';

      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${m.name}</b>${timeStr ? `<br>🕐 ${timeStr}` : ''}`);

      markersRef.current.push(marker);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

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

  const locatedCount = members.filter(m => m.lat != null).length;

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

      <div className="map-legend">
        {members.map(m => (
          <div key={m.id} className="map-legend-item">
            <div className="map-legend-dot" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {m.lat != null
                  ? `🟢 ${m.location_at ? new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'localisé'}`
                  : '⚪ Position inconnue'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        ref={mapRef}
        className="map-container"
        style={{ height: 400, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}
      />

      {locatedCount === 0 && (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <div className="empty-state-icon">🗺️</div>
          <p>Aucun membre n'a partagé sa position</p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Appuie sur "Partager ma position" pour apparaître sur la carte</p>
        </div>
      )}
    </div>
  );
}
