const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM members WHERE family_id = ? ORDER BY name', [req.user.familyId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Nom et couleur requis' });
    const cnt = await db.execute('SELECT COUNT(*) as c FROM members WHERE family_id = ?', [req.user.familyId]);
    if (cnt.rows[0].c >= 15) return res.status(400).json({ error: 'Maximum 15 membres par famille' });
    const result = await db.execute('INSERT INTO members (family_id, name, color) VALUES (?, ?, ?)', [req.user.familyId, name, color]);
    res.json({ id: Number(result.lastInsertRowid), family_id: req.user.familyId, name, color });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    await db.execute('UPDATE members SET name = ?, color = ? WHERE id = ? AND family_id = ?', [name, color, req.params.id, req.user.familyId]);
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
