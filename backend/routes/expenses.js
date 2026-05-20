const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyFamily } = require('../push');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    let sql = `SELECT e.*, m.name as member_name, m.color as member_color
      FROM expenses e LEFT JOIN members m ON e.member_id = m.id
      WHERE e.family_id = ?`;
    const args = [req.user.familyId];
    if (year && month) {
      sql += ' AND strftime("%Y-%m", e.date) = ?';
      args.push(`${year}-${String(month).padStart(2, '0')}`);
    } else if (year) {
      sql += ' AND strftime("%Y", e.date) = ?';
      args.push(year);
    }
    sql += ' ORDER BY e.date DESC, e.created_at DESC';
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { amount, date, category, member_id, description } = req.body;
    if (!amount || !date || !category) return res.status(400).json({ error: 'Montant, date et catégorie requis' });
    const result = await db.execute(
      'INSERT INTO expenses (family_id, member_id, amount, date, category, description) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.familyId, member_id || null, amount, date, category, description || '']
    );
    const senderName = req.user.memberName || 'Famille';
    notifyFamily(
      req.user.familyId, req.user.memberId,
      '💶 Nouvelle dépense',
      `${senderName} a ajouté ${parseFloat(amount).toFixed(2)}€ (${category})`
    ).catch(() => {});
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { amount, date, category, member_id, description } = req.body;
    await db.execute(
      'UPDATE expenses SET amount = ?, date = ?, category = ?, member_id = ?, description = ? WHERE id = ? AND family_id = ?',
      [amount, date, category, member_id || null, description || '', req.params.id, req.user.familyId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM expenses WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
