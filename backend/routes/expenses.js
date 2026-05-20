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
      sql += ` AND strftime('%Y-%m', e.date) = ?`;
      args.push(`${year}-${String(month).padStart(2, '0')}`);
    } else if (year) {
      sql += ` AND strftime('%Y', e.date) = ?`;
      args.push(year);
    }
    sql += ' ORDER BY e.date DESC, e.created_at DESC';
    const result = await db.execute({ sql, args });

    // Charger tous les membres pour enrichir members_info (comme calendar.js)
    const allMembersRes = await db.execute('SELECT id, name, color FROM members WHERE family_id = ?', [req.user.familyId]);
    const memberMap = {};
    for (const m of allMembersRes.rows) {
      memberMap[Number(m.id)] = m;
    }

    const expenses = result.rows.map(ex => {
      let membersInfo = [];
      if (ex.member_ids) {
        try {
          const ids = JSON.parse(ex.member_ids).map(Number);
          membersInfo = ids.map(id => memberMap[id]).filter(Boolean);
        } catch {}
      }
      const effectiveColor = membersInfo.length > 0 ? membersInfo[0].color : (ex.member_color || null);
      return { ...ex, members_info: membersInfo, member_color: effectiveColor };
    });

    res.json(expenses);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { amount, date, category, member_id, member_ids, description } = req.body;
    if (!amount || !date || !category) return res.status(400).json({ error: 'Montant, date et catégorie requis' });
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    const result = await db.execute(
      'INSERT INTO expenses (family_id, member_id, amount, date, category, description, member_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.familyId, member_id || null, amount, date, category, description || '', memberIdsJson]
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
    const { amount, date, category, member_id, member_ids, description } = req.body;
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    await db.execute(
      'UPDATE expenses SET amount = ?, date = ?, category = ?, member_id = ?, description = ?, member_ids = ? WHERE id = ? AND family_id = ?',
      [amount, date, category, member_id || null, description || '', memberIdsJson, req.params.id, req.user.familyId]
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
