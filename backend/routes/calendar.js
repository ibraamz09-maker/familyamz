const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    let sql = `SELECT e.*, m.name as member_name, m.color as member_color
      FROM events e LEFT JOIN members m ON e.member_id = m.id
      WHERE e.family_id = ?`;
    const args = [req.user.familyId];
    if (year && month) {
      sql += ' AND strftime("%Y-%m", e.date) = ?';
      args.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    sql += ' ORDER BY e.date, e.created_at';
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, date, member_id, description } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Titre et date requis' });
    const result = await db.execute(
      'INSERT INTO events (family_id, member_id, title, date, description) VALUES (?, ?, ?, ?, ?)',
      [req.user.familyId, member_id || null, title, date, description || '']
    );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, date, member_id, description } = req.body;
    await db.execute(
      'UPDATE events SET title = ?, date = ?, member_id = ?, description = ? WHERE id = ? AND family_id = ?',
      [title, date, member_id || null, description || '', req.params.id, req.user.familyId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM events WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
