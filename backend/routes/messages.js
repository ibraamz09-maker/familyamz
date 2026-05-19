const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyFamily } = require('../push');

// GET last 100 messages
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Mettre à jour last_seen du membre connecté
    if (req.user.memberId) {
      await db.execute('UPDATE members SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [req.user.memberId]).catch(() => {});
    }
    const result = await db.execute(
      'SELECT * FROM messages WHERE family_id = ? ORDER BY created_at ASC LIMIT 100',
      [req.user.familyId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE messages éphémères (plus vieux que X jours)
router.delete('/ephemeral/:days', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 7;
    await db.execute(
      "DELETE FROM messages WHERE family_id = ? AND created_at < datetime('now', ?)",
      [req.user.familyId, `-${days} days`]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST send message
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message vide' });
    const memberName = req.user.memberName || req.user.name || 'Famille';
    const memberColor = req.user.memberColor || '#9CA3AF';
    const memberId = req.user.memberId || null;
    const r = await db.execute(
      'INSERT INTO messages (family_id, member_id, member_name, member_color, text) VALUES (?, ?, ?, ?, ?)',
      [req.user.familyId, memberId, memberName, memberColor, text.trim()]
    );
    const msg = {
      id: Number(r.lastInsertRowid),
      family_id: req.user.familyId,
      member_id: memberId,
      member_name: memberName,
      member_color: memberColor,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    res.json(msg);
    // Notification push aux autres membres (sans await pour ne pas bloquer)
    notifyFamily(req.user.familyId, memberId, `💬 ${memberName}`, text.trim()).catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE message
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM messages WHERE id = ? AND family_id = ?', [req.params.id, req.user.familyId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
