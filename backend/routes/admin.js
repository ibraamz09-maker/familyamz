const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { adminMiddleware } = require('../middleware/auth');

router.get('/families', adminMiddleware, async (req, res) => {
  try {
    const result = await db.execute('SELECT id, identifier, name, created_at FROM families ORDER BY name');
    const families = await Promise.all(result.rows.map(async f => {
      const cnt = await db.execute('SELECT COUNT(*) as c FROM members WHERE family_id = ?', [f.id]);
      return { ...f, member_count: cnt.rows[0].c };
    }));
    res.json(families);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/families', adminMiddleware, async (req, res) => {
  try {
    const { identifier, password, name } = req.body;
    if (!identifier || !password || !name) return res.status(400).json({ error: 'Tous les champs sont requis' });
    const existing = await db.execute('SELECT id FROM families WHERE identifier = ?', [identifier]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Cet identifiant existe déjà' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.execute('INSERT INTO families (identifier, password_hash, name) VALUES (?, ?, ?)', [identifier, hash, name]);
    res.json({ id: Number(result.lastInsertRowid), identifier, name, member_count: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/families/:id/password', adminMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis' });
    const hash = bcrypt.hashSync(password, 10);
    await db.execute('UPDATE families SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/families/:id', adminMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM members WHERE family_id = ?', [req.params.id]);
    await db.execute('DELETE FROM events WHERE family_id = ?', [req.params.id]);
    await db.execute('DELETE FROM tasks WHERE family_id = ?', [req.params.id]);
    await db.execute('DELETE FROM expenses WHERE family_id = ?', [req.params.id]);
    await db.execute('DELETE FROM families WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
