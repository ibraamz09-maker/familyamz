const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM tasks WHERE family_id = ? ORDER BY created_at DESC', [req.user.familyId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const result = await db.execute('INSERT INTO tasks (family_id, title) VALUES (?, ?)', [req.user.familyId, title]);
    res.json({ id: Number(result.lastInsertRowid), family_id: req.user.familyId, title, done: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, done } = req.body;
    await db.execute('UPDATE tasks SET title = ?, done = ? WHERE id = ? AND family_id = ?', [title, done ? 1 : 0, req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM tasks WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
