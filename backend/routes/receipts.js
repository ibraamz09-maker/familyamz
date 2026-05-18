const express = require('express');
const router = express.Router();
const { db } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const { year, month, category } = req.query;
  let sql = `
    SELECT id, filename, mimetype, amount, date, category, description, member_id, created_at
    FROM receipts WHERE family_id = ?`;
  const args = [req.familyId];
  if (year && month) {
    const m = String(month).padStart(2, '0');
    sql += ` AND date LIKE '${year}-${m}%'`;
  } else if (year) {
    sql += ` AND date LIKE '${year}%'`;
  }
  if (category) {
    sql += ` AND category = ?`;
    args.push(category);
  }
  sql += ' ORDER BY date DESC, created_at DESC';
  const result = await db.execute(sql, args);
  res.json(result.rows);
});

router.get('/:id/file', async (req, res) => {
  const result = await db.execute(
    'SELECT filename, mimetype, data FROM receipts WHERE id = ? AND family_id = ?',
    [req.params.id, req.familyId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Non trouvé' });
  const { filename, mimetype, data } = result.rows[0];
  const buf = Buffer.from(data, 'base64');
  res.setHeader('Content-Type', mimetype);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

router.post('/', async (req, res) => {
  const { filename, mimetype, data, amount, date, category, description, member_id } = req.body;
  if (!filename || !mimetype || !data || !date || !category) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  const result = await db.execute(
    `INSERT INTO receipts (family_id, filename, mimetype, data, amount, date, category, description, member_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.familyId, filename, mimetype, data, amount || null, date, category, description || '', member_id || null]
  );
  res.json({ id: Number(result.lastInsertRowid) });
});

router.delete('/:id', async (req, res) => {
  await db.execute('DELETE FROM receipts WHERE id = ? AND family_id = ?', [req.params.id, req.familyId]);
  res.json({ ok: true });
});

module.exports = router;
