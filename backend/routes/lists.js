const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET all lists (with items)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const lists = await db.execute('SELECT * FROM lists WHERE family_id = ? ORDER BY created_at DESC', [req.user.familyId]);
    const items = await db.execute(
      'SELECT li.* FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.family_id = ? ORDER BY li.created_at ASC',
      [req.user.familyId]
    );
    const result = lists.rows.map(l => ({
      ...l,
      items: items.rows.filter(i => i.list_id === l.id),
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create list
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const r = await db.execute('INSERT INTO lists (family_id, name) VALUES (?, ?)', [req.user.familyId, name]);
    res.json({ id: Number(r.lastInsertRowid), family_id: req.user.familyId, name, items: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE list
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM list_items WHERE list_id = ?', [req.params.id]);
    await db.execute('DELETE FROM lists WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST add item to list
router.post('/:id/items', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });
    // Verify list belongs to family
    const l = await db.execute('SELECT id FROM lists WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    if (!l.rows[0]) return res.status(404).json({ error: 'Liste introuvable' });
    const r = await db.execute('INSERT INTO list_items (list_id, text) VALUES (?, ?)', [req.params.id, text]);
    res.json({ id: Number(r.lastInsertRowid), list_id: Number(req.params.id), text, done: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT toggle item
router.put('/:listId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { done } = req.body;
    await db.execute('UPDATE list_items SET done = ? WHERE id = ?', [done ? 1 : 0, req.params.itemId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE item
router.delete('/:listId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM list_items WHERE id = ?', [req.params.itemId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
