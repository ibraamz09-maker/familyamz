import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

/* Leaflet chargé via CDN dans index.html */
declare global { interface Window { L: any } }

export default function MapPage() {
  const { member: currentMember } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [sharing, setSharing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [cityInput, setCityInput] = useState('');
  const [showCityInput, setShowCityInput] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [locationUrl, setLocationUrl] = useState<string | null>(null);
  const [showShortcut, setShowShortcut] = useState(false);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

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

  // Partage automatique à l'ouverture si la permission est déjà accordée
  useEffect(() => {
    if (!currentMember || !navigator.geolocation) return;
    const tryAuto = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude).catch(() => {});
          await fetchMembers();
        },
        () => {}, // silencieux si refusé
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };
    // Vérifie si la permission est déjà accordée (sans pop-up)
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
        if (result.state === 'granted') tryAuto();
      }).catch(() => {});
    }
  }, [currentMember]);

  // Suivi en temps réel avec watchPosition (se déclenche dès que tu bouges)
  useEffect(() => {
    if (!autoUpdate || !currentMember || !navigator.geolocation) return;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        // Throttle : envoyer au serveur max toutes les 15 secondes pour éviter la surcharge
        const now = Date.now();
        if (now - lastSent < 15000) return;
        lastSent = now;
        await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude).catch(() => {});
        await fetchMembers();
      },
      () => {}, // échec silencieux
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [autoUpdate, currentMember]);

  /* Initialise la carte Leaflet une seule fois */
  useEffect(() => {
    const L = window.L;
    if (!L || !mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView([46.8, 2.3], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OSM</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* Met à jour les marqueurs quand les membres changent */
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;
    const map = mapRef.current;

    /* Supprimer anciens marqueurs */
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const located = members.filter(m => m.lat != null && m.lng != null);
    if (located.length === 0) return;

    const latLngs: [number, number][] = [];
    located.forEach(m => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${m.color || '#6B7280'};
          color:white;width:38px;height:38px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:15px;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.35)">
          ${m.name.charAt(0).toUpperCase()}
        </div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -22],
      });
      const locationTime = m.location_at
        ? new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '';
      const marker = L.marker([m.lat!, m.lng!], { icon })
        .addTo(map)
        .bindPopup(`<b style="font-size:15px">${m.name}</b>${locationTime ? `<br><span style="color:#6B7280;font-size:12px">Mis à jour à ${locationTime}</span>` : ''}`);
      markersRef.current.push(marker);
      latLngs.push([m.lat!, m.lng!]);
    });

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 15);
    } else {
      map.fitBounds(latLngs, { padding: [30, 30] });
    }
    /* Force le redimensionnement de la carte */
    setTimeout(() => map.invalidateSize(), 100);
  }, [members]);

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

    const success = async (pos: GeolocationPosition) => {
      try {
        await api.updateLocation(currentMember.id, pos.coords.latitude, pos.coords.longitude);
        setStatusType('success');
        setStatusMsg('✅ Position partagée avec la famille !');
        await fetchMembers();
        setTimeout(() => setStatusMsg(''), 4000);
      } catch {
        setStatusType('error');
        setStatusMsg('❌ Erreur réseau lors du partage');
      } finally { setSharing(false); }
    };

    const error = (err: GeolocationPositionError) => {
      setSharing(false);
      setStatusType('error');
      if (err.code === 1) {
        setStatusMsg('🔒 Accès refusé. Sur iPhone : Réglages → Confidentialité → Service de localisation → Safari Sites web → "Lors de l\'utilisation". Ensuite dans Safari, appuie sur "AA" → Réglages du site web → Localisation → Autoriser.');
      } else if (err.code === 2) {
        setStatusMsg('❌ Position introuvable. Active le GPS et réessaie en extérieur.');
      } else {
        setStatusMsg('❌ Délai dépassé. Réessaie dans quelques secondes.');
      }
    };

    /* Essai 1 : avec haute précision (GPS chip, meilleur sur iPhone) */
    navigator.geolocation.getCurrentPosition(success, (err) => {
      if (err.code === 1) { error(err); setShowCityInput(true); return; }
      /* Essai 2 : sans haute précision (réseau) */
      navigator.geolocation.getCurrentPosition(success, (err2) => {
        error(err2);
        setShowCityInput(true);
      }, { enableHighAccuracy: false, timeout: 30000, maximumAge: 0 });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const shareByCity = async () => {
    if (!cityInput.trim() || !currentMember) return;
    setSharing(true);
    setStatusType('info');
    setStatusMsg('🔍 Recherche de la ville...');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityInput)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'fr' } }
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        setStatusType('error');
        setStatusMsg('❌ Ville introuvable. Essaie avec un nom plus précis.');
        setSharing(false);
        return;
      }
      const { lat, lon } = data[0];
      await api.updateLocation(currentMember.id, parseFloat(lat), parseFloat(lon));
      setStatusType('success');
      setStatusMsg(`✅ Position partagée : ${data[0].display_name.split(',').slice(0, 2).join(', ')}`);
      setShowCityInput(false);
      setCityInput('');
      await fetchMembers();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch {
      setStatusType('error');
      setStatusMsg('❌ Erreur lors de la recherche');
    } finally { setSharing(false); }
  };

  const locatedMembers = members.filter(m => m.lat != null && m.lng != null);

  return (
    <div>
      {/* Boutons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={shareLocation} disabled={sharing} style={{ flex: 1 }}>
          {sharing ? '📡 Localisation...' : '📍 Partager ma position'}
        </button>
        <button className="btn-secondary" onClick={fetchMembers} style={{ flex: '0 0 auto', padding: '14px 16px' }}>
          🔄
        </button>
      </div>
      {currentMember && (
        <button
          onClick={() => setAutoUpdate(a => !a)}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 12,
            border: `2px solid ${autoUpdate ? '#22C55E' : 'var(--border)'}`,
            background: autoUpdate ? '#F0FDF4' : 'var(--surface)',
            color: autoUpdate ? '#166534' : 'var(--text-2)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <span>{autoUpdate ? '🟢' : '⚪'}</span>
          {autoUpdate ? 'Mise à jour auto activée (toutes les heures)' : 'Activer la mise à jour auto'}
        </button>
      )}

      {/* Message statut */}
      {statusMsg && (
        <div style={{
          padding: '12px 14px', borderRadius: 10, marginBottom: 12,
          fontSize: 13, fontWeight: 500, lineHeight: 1.5,
          background: statusType === 'success' ? '#DCFCE7' : statusType === 'error' ? '#FEE2E2' : 'var(--primary-light)',
          color: statusType === 'success' ? '#166534' : statusType === 'error' ? '#991B1B' : 'var(--primary-dark)',
        }}>
          {statusMsg}
        </div>
      )}

      {/* Saisie manuelle de ville (fallback géoloc) */}
      {showCityInput && currentMember && (
        <div style={{ background: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#92400E' }}>
            📍 GPS non disponible — entre ta ville :
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ marginBottom: 0, flex: 1 }}
              placeholder="ex: Paris, Lyon, Marseille..."
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && shareByCity()}
            />
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '0 16px', whiteSpace: 'nowrap' }}
              onClick={shareByCity}
              disabled={sharing || !cityInput.trim()}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Configuration OwnTracks */}
      {currentMember && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', marginBottom: 12, boxShadow: 'var(--shadow)' }}>
          <button
            onClick={() => setShowShortcut(s => !s)}
            style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>📍 Localisation automatique (OwnTracks)</span>
            <span style={{ fontSize: 18 }}>{showShortcut ? '▲' : '▼'}</span>
          </button>

          {showShortcut && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                ✅ OwnTracks envoie ta position automatiquement, même téléphone verrouillé, iOS et Android.
              </div>

              {/* Étape 1 */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>① Installe OwnTracks</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <a href="https://apps.apple.com/app/owntracks/id692824497" target="_blank" rel="noreferrer"
                  style={{ flex: 1, display: 'block', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                  🍎 App Store (iPhone)
                </a>
                <a href="https://play.google.com/store/apps/details?id=org.owntracks.android" target="_blank" rel="noreferrer"
                  style={{ flex: 1, display: 'block', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                  🤖 Play Store (Android)
                </a>
              </div>

              {/* Étape 2 : Configuration */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>② Configure OwnTracks (une seule fois)</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.9, marginBottom: 10 }}>
                Dans OwnTracks → <strong>⚙️ Préférences → Connexion</strong> :<br />
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
                  <div><strong>Mode :</strong> HTTP</div>
                  <div><strong>URL :</strong>
                    <span
                      style={{ color: 'var(--primary)', cursor: 'pointer', marginLeft: 6 }}
                      onClick={() => {
                        navigator.clipboard.writeText('https://familyamz.onrender.com/api/owntracks?family=amenzou');
                        alert('✅ URL copiée !');
                      }}
                    >
                      https://familyamz.onrender.com/api/owntracks?family=amenzou 📋
                    </span>
                  </div>
                  <div><strong>Identifiant :</strong> {currentMember.name}</div>
                  <div><strong>Mot de passe :</strong> ton mot de passe FamilyAmz</div>
                  <div><strong>ID appareil :</strong> {currentMember.name.slice(0, 2).toUpperCase()}</div>
                </div>
              </div>

              {/* Étape 3 */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>③ Active le suivi en arrière-plan</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                <strong>iPhone :</strong> Réglages → OwnTracks → Localisation → <strong>"Toujours"</strong><br />
                <strong>Android :</strong> Applis → OwnTracks → Autorisations → Localisation → <strong>"Toujours autoriser"</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Avertissement si pas membre */}
      {!currentMember && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, background: '#FEF3C7', color: '#92400E' }}>
          💡 Connecte-toi avec ton prénom (onglet "Membre") pour partager ta position.
        </div>
      )}

      {/* Carte Leaflet */}
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 14, height: 280, background: '#e8f0e8', position: 'relative' }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
        {locatedMembers.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(248,250,248,0.92)',
            gap: 8, pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 36 }}>🗺️</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>
              Aucune position partagée
            </span>
          </div>
        )}
      </div>

      {/* Liste membres */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map(m => (
          <div key={m.id} className="member-item"
            style={{ cursor: m.lat != null ? 'pointer' : 'default' }}
            onClick={() => {
              if (m.lat == null || !mapRef.current) return;
              mapRef.current.setView([m.lat!, m.lng!], 15);
              markersRef.current.find(mk => {
                const ll = mk.getLatLng();
                return ll.lat === m.lat && ll.lng === m.lng;
              })?.openPopup();
            }}
          >
            <div className="member-color-badge" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {m.lat != null
                  ? `📍 ${m.location_at ? new Date(m.location_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'localisé'} · Appuie pour centrer`
                  : '⚪ Position non partagée'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
