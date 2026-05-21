const express = require('express');
const router = express.Router();
const { db } = require('../db');
const bcrypt = require('bcryptjs');

/**
 * OwnTracks HTTP mode
 * POST /api/owntracks?family=amenzou
 * Basic Auth : username = nom du membre, password = son mot de passe FamilyAmz
 *
 * OwnTracks envoie aussi les headers :
 *   X-Limit-U : username
 *   X-Limit-D : device name
 */
router.post('/', async (req, res) => {
  try {
    // ── 1. Identifier la famille ────────────────────────────────────────────
    const familyId_q = req.query.family; // ex: ?family=amenzou
    let familyId = null;

    if (familyId_q) {
      const fam = await db.execute({
        sql: 'SELECT id FROM families WHERE identifier = ?',
        args: [familyId_q],
      });
      if (fam.rows.length > 0) familyId = Number(fam.rows[0].id);
    }
    if (!familyId) return res.status(400).json({ error: 'Famille inconnue — ajoutez ?family=VOTRE_ID dans l\'URL' });

    // ── 2. Authentifier le membre via Basic Auth ou headers OwnTracks ───────
    let username = null;
    let password = null;

    // Header X-Limit-U envoyé par OwnTracks
    if (req.headers['x-limit-u']) {
      username = req.headers['x-limit-u'];
    }

    // Basic Auth (prioritaire)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        username = decoded.slice(0, colonIdx);
        password = decoded.slice(colonIdx + 1);
      }
    }

    if (!username) return res.status(401).json({ error: 'Authentification requise (Basic Auth : nom:motdepasse)' });

    // Chercher le membre
    const memberRes = await db.execute({
      sql: 'SELECT id, password_hash FROM members WHERE family_id = ? AND LOWER(name) = LOWER(?)',
      args: [familyId, username],
    });
    if (memberRes.rows.length === 0) return res.status(401).json({ error: `Membre "${username}" introuvable dans cette famille` });

    const member = memberRes.rows[0];

    // Vérifier le mot de passe si fourni
    if (password && member.password_hash) {
      const ok = bcrypt.compareSync(password, member.password_hash);
      if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const memberId = Number(member.id);

    // ── 3. Traiter le payload OwnTracks ────────────────────────────────────
    const payload = req.body;

    if (payload._type === 'location') {
      const lat = parseFloat(payload.lat);
      const lon = parseFloat(payload.lon);

      if (isNaN(lat) || isNaN(lon)) return res.json([]);

      await db.execute({
        sql: 'UPDATE members SET lat = ?, lng = ?, location_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [lat, lon, memberId],
      });

      console.log(`[OwnTracks] Position mise à jour — ${username}: ${lat}, ${lon}`);
    }

    // ── 4. Retourner les positions des autres membres (OwnTracks les affiche) ─
    const others = await db.execute({
      sql: `SELECT name, lat, lng, location_at FROM members
            WHERE family_id = ? AND id != ? AND lat IS NOT NULL AND lng IS NOT NULL`,
      args: [familyId, memberId],
    });

    const response = others.rows.map(m => ({
      _type: 'location',
      lat: m.lat,
      lon: m.lng,
      tst: m.location_at ? Math.floor(new Date(m.location_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
      tid: (m.name || '??').slice(0, 2).toUpperCase(),
      topic: `owntracks/${familyId_q}/${m.name}`,
    }));

    res.json(response);
  } catch (e) {
    console.error('[OwnTracks] Erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
