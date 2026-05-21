const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyFamily } = require('../push');

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
    // Charger tous les membres de la famille une seule fois (évite les soucis IN clause Turso)
    const allMembersRes = await db.execute('SELECT id, name, color FROM members WHERE family_id = ?', [req.user.familyId]);
    const memberMap = {};
    for (const m of allMembersRes.rows) {
      memberMap[Number(m.id)] = m;
    }
    // Enrichir chaque événement avec members_info
    const events = result.rows.map(ev => {
      let membersInfo = [];
      if (ev.member_ids) {
        try {
          const ids = JSON.parse(ev.member_ids).map(Number);
          membersInfo = ids.map(id => memberMap[id]).filter(Boolean);
        } catch {}
      }
      // Si plusieurs membres sélectionnés, utiliser la couleur du premier pour les points calendrier
      const effectiveColor = membersInfo.length > 0 ? membersInfo[0].color : (ev.member_color || null);
      return { ...ev, members_info: membersInfo, member_color: effectiveColor };
    });
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, date, time, end_time, member_id, member_ids, description, urgent, recurrence } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Titre et date requis' });
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    const isUrgent = urgent ? 1 : 0;
    const rec = recurrence || 'none';

    const result = await db.execute(
      'INSERT INTO events (family_id, member_id, title, date, time, end_time, description, member_ids, urgent, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.familyId, member_id || null, title, date, time || '', end_time || '', description || '', memberIdsJson, isUrgent, rec]
    );
    const firstId = Number(result.lastInsertRowid);

    // Créer les occurrences récurrentes
    if (rec === 'weekly') {
      const baseDate = new Date(date + 'T00:00:00');
      for (let i = 1; i <= 12; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i * 7);
        const ds = d.toISOString().split('T')[0];
        await db.execute(
          'INSERT INTO events (family_id, member_id, title, date, time, end_time, description, member_ids, urgent, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [req.user.familyId, member_id || null, title, ds, time || '', end_time || '', description || '', memberIdsJson, 0, 'weekly']
        ).catch(() => {});
      }
    } else if (rec === 'monthly') {
      const baseDate = new Date(date + 'T00:00:00');
      for (let i = 1; i <= 6; i++) {
        const d = new Date(baseDate);
        d.setMonth(baseDate.getMonth() + i);
        const ds = d.toISOString().split('T')[0];
        await db.execute(
          'INSERT INTO events (family_id, member_id, title, date, time, end_time, description, member_ids, urgent, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [req.user.familyId, member_id || null, title, ds, time || '', end_time || '', description || '', memberIdsJson, 0, 'monthly']
        ).catch(() => {});
      }
    }

    // Notification push si urgent
    if (isUrgent) {
      const senderName = req.user.memberName || 'Famille';
      notifyFamily(
        req.user.familyId, req.user.memberId,
        `🚨 Urgence : ${title}`,
        `${senderName} a ajouté un événement urgent le ${date}${time ? ' à ' + time : ''}`
      ).catch(() => {});
    }

    res.json({ id: firstId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, date, time, end_time, member_id, member_ids, description, urgent, recurrence } = req.body;
    const memberIdsJson = member_ids && member_ids.length > 0 ? JSON.stringify(member_ids) : '';
    const isUrgent = urgent ? 1 : 0;
    const rec = recurrence || 'none';
    await db.execute(
      'UPDATE events SET title = ?, date = ?, time = ?, end_time = ?, member_id = ?, description = ?, member_ids = ?, urgent = ?, recurrence = ? WHERE id = ? AND family_id = ?',
      [title, date, time || '', end_time || '', member_id || null, description || '', memberIdsJson, isUrgent, rec, req.params.id, req.user.familyId]
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
