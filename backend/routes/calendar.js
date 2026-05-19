const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month, start_date, end_date } = req.query;
    let sql = `SELECT e.*, m.name as member_name, m.color as member_color
      FROM events e LEFT JOIN members m ON e.member_id = m.id
      WHERE e.family_id = ?`;
    const args = [req.user.familyId];
    if (start_date && end_date) {
      sql += ' AND e.date >= ? AND e.date <= ?';
      args.push(start_date, end_date);
    } else if (year && month) {
      sql += ' AND strftime("%Y-%m", e.date) = ?';
      args.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    sql += ' ORDER BY e.date, e.time, e.created_at';
    const result = await db.execute({ sql, args });
    // Enrichir avec les noms des membres concernés
    const events = await Promise.all(result.rows.map(async (ev) => {
      let membersInfo = [];
      if (ev.member_ids) {
        try {
          const ids = JSON.parse(ev.member_ids);
          if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            const mRes = await db.execute({ sql: `SELECT id, name, color FROM members WHERE id IN (${placeholders})`, args: ids });
            membersInfo = mRes.rows;
          }
        } catch {}
      }
      return { ...ev, members_info: membersInfo };
    }));
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, date, time, member_id, member_ids, description } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Titre et date requis' });
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    const result = await db.execute(
      'INSERT INTO events (family_id, member_id, title, date, time, description, member_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.familyId, member_id || null, title, date, time || '', description || '', memberIdsJson]
    );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, date, time, member_id, member_ids, description } = req.body;
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    await db.execute(
      'UPDATE events SET title = ?, date = ?, time = ?, member_id = ?, description = ?, member_ids = ? WHERE id = ? AND family_id = ?',
      [title, date, time || '', member_id || null, description || '', memberIdsJson, req.params.id, req.user.familyId]
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
