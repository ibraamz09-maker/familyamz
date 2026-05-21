const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { VAPID_PUBLIC, notifyMember } = require('../push');

// Retourne la clé publique VAPID (nécessaire côté client pour s'abonner)
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

// Enregistre un abonnement push
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Abonnement invalide' });
    }
    const memberId = req.user.memberId || null;
    // Upsert : si endpoint existe déjà on met à jour
    await db.execute(
      `INSERT INTO push_subscriptions (family_id, member_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET member_id=excluded.member_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      [req.user.familyId, memberId, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Supprime un abonnement push
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await db.execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Envoie un rappel ciblé à un membre spécifique
router.post('/notify-member', authMiddleware, async (req, res) => {
  try {
    const { member_id, title, body } = req.body;
    if (!member_id || !title) return res.status(400).json({ error: 'member_id et title requis' });
    // Vérifier que le membre appartient bien à la famille
    const check = await db.execute(
      'SELECT id FROM members WHERE id = ? AND family_id = ?',
      [member_id, req.user.familyId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Membre introuvable' });
    await notifyMember(req.user.familyId, member_id, title, body || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
