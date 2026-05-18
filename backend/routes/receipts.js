const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month, category } = req.query;
    let sql = `SELECT id, filename, mimetype, amount, date, category, description, member_id, created_at
               FROM receipts WHERE family_id = ?`;
    const args = [req.user.familyId];
    if (year && month) {
      sql += ` AND strftime('%Y-%m', date) = ?`;
      args.push(`${year}-${String(month).padStart(2, '0')}`);
    } else if (year) {
      sql += ` AND strftime('%Y', date) = ?`;
      args.push(year);
    }
    if (category) {
      sql += ` AND category = ?`;
      args.push(category);
    }
    sql += ' ORDER BY date DESC, created_at DESC';
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/file', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute(
      { sql: 'SELECT filename, mimetype, data FROM receipts WHERE id = ? AND family_id = ?', args: [req.params.id, req.user.familyId] }
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvé' });
    const { filename, mimetype, data } = result.rows[0];
    const buf = Buffer.from(data, 'base64');
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { filename, mimetype, data, amount, date, category, description, member_id } = req.body;
    if (!filename || !mimetype || !data || !date || !category) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    const result = await db.execute({
      sql: `INSERT INTO receipts (family_id, filename, mimetype, data, amount, date, category, description, member_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [req.user.familyId, filename, mimetype, data, amount || null, date, category, description || '', member_id || null]
    });
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM receipts WHERE id = ? AND family_id = ?', args: [req.params.id, req.user.familyId] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
