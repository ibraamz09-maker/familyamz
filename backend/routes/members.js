const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Heartbeat : met à jour last_seen sans renvoyer tous les membres
router.post('/ping', authMiddleware, async (req, res) => {
  try {
    if (req.user.memberId) {
      await db.execute('UPDATE members SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [req.user.memberId]);
    }
    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    // Mettre à jour last_seen du membre connecté
    if (req.user.memberId) {
      await db.execute('UPDATE members SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [req.user.memberId]).catch(() => {});
    }
    const result = await db.execute('SELECT id, family_id, name, color, lat, lng, location_at, last_seen FROM members WHERE family_id = ? ORDER BY name', [req.user.familyId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, color, password } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Nom et couleur requis' });
    const cnt = await db.execute('SELECT COUNT(*) as c FROM members WHERE family_id = ?', [req.user.familyId]);
    if (cnt.rows[0].c >= 15) return res.status(400).json({ error: 'Maximum 15 membres par famille' });
    const hash = password ? bcrypt.hashSync(password, 10) : '';
    const result = await db.execute('INSERT INTO members (family_id, name, color, password_hash) VALUES (?, ?, ?, ?)', [req.user.familyId, name, color, hash]);
    res.json({ id: Number(result.lastInsertRowid), family_id: req.user.familyId, name, color });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, color, password } = req.body;
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await db.execute('UPDATE members SET name = ?, color = ?, password_hash = ? WHERE id = ? AND family_id = ?', [name, color, hash, req.params.id, req.user.familyId]);
    } else {
      await db.execute('UPDATE members SET name = ?, color = ? WHERE id = ? AND family_id = ?', [name, color, req.params.id, req.user.familyId]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/location', authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await db.execute('UPDATE members SET lat = ?, lng = ?, location_at = CURRENT_TIMESTAMP WHERE id = ? AND family_id = ?', [lat, lng, req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM members WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
