const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyFamily } = require('../push');

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT * FROM tasks WHERE family_id = ? ORDER BY recurrence DESC, created_at DESC',
      [req.user.familyId]
    );
    const today = todayStr();
    const rows = result.rows.map(t => ({
      ...t,
      id: Number(t.id),
      family_id: Number(t.family_id),
      // Pour les tâches quotidiennes, done = 1 seulement si faite aujourd'hui
      done: t.recurrence === 'daily' ? (t.done_date === today ? 1 : 0) : (t.done === 1 ? 1 : 0),
    }));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, recurrence } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const rec = recurrence === 'daily' ? 'daily' : 'none';
    const result = await db.execute(
      'INSERT INTO tasks (family_id, title, recurrence) VALUES (?, ?, ?)',
      [req.user.familyId, title, rec]
    );
    const senderName = req.user.memberName || req.user.name || 'Famille';
    const newTask = { id: Number(result.lastInsertRowid), family_id: req.user.familyId, title, done: 0, recurrence: rec, done_date: '' };
    res.json(newTask);
    notifyFamily(req.user.familyId, req.user.memberId, `✅ Nouvelle tâche`, `${senderName} a ajouté : ${title}`).catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, done } = req.body;
    const today = todayStr();

    // Récupérer la tâche pour connaître sa récurrence
    const existing = await db.execute(
      'SELECT recurrence FROM tasks WHERE id = ? AND family_id = ?',
      [req.params.id, req.user.familyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });

    const rec = existing.rows[0].recurrence;

    if (rec === 'daily') {
      // Tâche quotidienne : on met à jour done_date (aujourd'hui si done, '' si décoché)
      const newDoneDate = done ? today : '';
      await db.execute(
        'UPDATE tasks SET title = ?, done_date = ? WHERE id = ? AND family_id = ?',
        [title, newDoneDate, req.params.id, req.user.familyId]
      );
    } else {
      // Tâche normale
      await db.execute(
        'UPDATE tasks SET title = ?, done = ? WHERE id = ? AND family_id = ?',
        [title, done ? 1 : 0, req.params.id, req.user.familyId]
      );
    }

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
