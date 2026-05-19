const webpush = require('web-push');
const { db } = require('./db');

const VAPID_PUBLIC  = 'BBO2LA0D5bB8Ovk3kcKizp2D-WD2zg1AzLRohqyaUZaysOawgWATquOxbQWqP9AYFsjy9kRXxK_yl4cz2wz2_QY';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '9SoJrQ78DM-08xif_Bulzp7MPYqnwlInztqfLvMJKow';

webpush.setVapidDetails('mailto:familyamz@onrender.com', VAPID_PUBLIC, VAPID_PRIVATE);

/**
 * Envoie une notification push à toute la famille
 * sauf au membre qui a déclenché l'action (excludeMemberId)
 */
async function notifyFamily(familyId, excludeMemberId, title, body) {
  try {
    const subs = await db.execute(
      'SELECT * FROM push_subscriptions WHERE family_id = ?',
      [familyId]
    );
    const payload = JSON.stringify({ title, body });
    for (const sub of subs.rows) {
      // Ne pas notifier l'émetteur
      if (excludeMemberId && sub.member_id === excludeMemberId) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        // Abonnement expiré → on le supprime
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[Push] Erreur:', e.message);
  }
}

module.exports = { notifyFamily, VAPID_PUBLIC };
