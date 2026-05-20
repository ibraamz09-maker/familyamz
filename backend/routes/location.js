const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const crypto = require('crypto');

// Générer ou récupérer le token de localisation d'un membre
router.get('/token', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT location_token FROM members WHERE id = ? AND family_id = ?',
      args: [req.user.memberId, req.user.familyId],
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Membre introuvable' });

    let token = result.rows[0].location_token;
    // Générer un token si absent
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await db.execute({
        sql: 'UPDATE members SET location_token = ? WHERE id = ?',
        args: [token, req.user.memberId],
      });
    }
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Endpoint PUBLIC appelé par iOS Raccourcis — pas de JWT requis
// GET /api/location/update?token=XXX&lat=48.8566&lng=2.3522
router.get('/update', async (req, res) => {
  try {
    const { token, lat, lng } = req.query;
    if (!token || !lat || !lng) return res.status(400).json({ error: 'Paramètres manquants' });

    const result = await db.execute({
      sql: 'SELECT id FROM members WHERE location_token = ?',
      args: [token],
    });
    if (result.rows.length === 0) return res.status(401).json({ error: 'Token invalide' });

    const memberId = result.rows[0].id;
    await db.execute({
      sql: 'UPDATE members SET lat = ?, lng = ?, location_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [parseFloat(lat), parseFloat(lng), memberId],
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
