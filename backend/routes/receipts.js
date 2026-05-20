const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const CATEGORIES = ['Loisirs', 'Vêtements', 'Abonnements', 'Électricité', 'Essence', 'Autres'];

// Modèles à essayer dans l'ordre
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
];

async function callGemini(apiKey, model, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`Gemini ${model}: ${data.error.message} (code ${data.error.code})`);
  return data;
}

async function analyzeWithGemini(base64Data, mimetype) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) { console.error('[Gemini] GEMINI_API_KEY non défini'); return null; }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Analyse ce ticket de caisse ou cette facture. Catégories disponibles: ${CATEGORIES.join(', ')}. Date du jour si non trouvée: ${today}. Réponds UNIQUEMENT avec ce JSON sans markdown: {"amount": <montant total décimal ou null>, "date": "<YYYY-MM-DD>", "category": "<une des catégories>", "description": "<nom du magasin>"}`;
  const parts = [
    { inline_data: { mime_type: mimetype, data: base64Data } },
    { text: prompt },
  ];

  for (const model of GEMINI_MODELS) {
    try {
      const data = await callGemini(apiKey, model, parts);
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      console.log(`[Gemini] Réponse brute (${model}):`, raw.slice(0, 200));

      // Extraire le JSON même s'il y a du texte autour
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { console.error(`[Gemini] Pas de JSON trouvé dans la réponse`); continue; }
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[Gemini] Succès avec ${model}:`, parsed);
      return parsed;
    } catch (e) {
      console.error(`[Gemini] Échec avec ${model}:`, e.message);
      // Clé invalide → inutile d'essayer les autres modèles
      if (e.message.includes('API_KEY') || e.message.includes('401') || e.message.includes('403')) break;
      // Modèle non dispo ou quota → essayer le suivant
      continue;
    }
  }
  return null;
}

// Endpoint de diagnostic — test la connexion Gemini sans image
router.get('/test-gemini', authMiddleware, async (req, res) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.json({ ok: false, error: 'GEMINI_API_KEY non défini dans les variables Render' });

  const results = [];
  for (const model of GEMINI_MODELS) {
    try {
      const data = await callGemini(apiKey, model, [{ text: 'Réponds juste "ok"' }]);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      results.push({ model, ok: true, response: text.slice(0, 50) });
      break; // Premier modèle qui fonctionne = on s'arrête
    } catch (e) {
      results.push({ model, ok: false, error: e.message });
    }
  }
  res.json({ keyPrefix: apiKey.slice(0, 8) + '...', results });
});

router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { data, mimetype } = req.body;
    if (!data || !mimetype) return res.status(400).json({ error: 'Image manquante' });
    const result = await analyzeWithGemini(data, mimetype);
    if (!result) return res.json({ amount: null, date: new Date().toISOString().slice(0, 10), category: 'Autres', description: '' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month, category } = req.query;
    let sql = `SELECT id, filename, mimetype, amount, date, category, description, member_id, expense_id, created_at
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

    let expenseId = null;

    // Si un montant est fourni, créer automatiquement une dépense
    if (amount && parseFloat(amount) > 0) {
      const desc = description ? `📎 ${description}` : `📎 Ticket`;
      const expResult = await db.execute({
        sql: `INSERT INTO expenses (family_id, member_id, amount, date, category, description) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [req.user.familyId, member_id || null, parseFloat(amount), date, category, desc]
      });
      expenseId = Number(expResult.lastInsertRowid);
    }

    const result = await db.execute({
      sql: `INSERT INTO receipts (family_id, filename, mimetype, data, amount, date, category, description, member_id, expense_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [req.user.familyId, filename, mimetype, data, amount || null, date, category, description || '', member_id || null, expenseId]
    });
    res.json({ id: Number(result.lastInsertRowid), expense_id: expenseId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // Supprimer la dépense liée si elle existe
    const rec = await db.execute({
      sql: 'SELECT expense_id FROM receipts WHERE id = ? AND family_id = ?',
      args: [req.params.id, req.user.familyId]
    });
    if (rec.rows.length > 0 && rec.rows[0].expense_id) {
      await db.execute({
        sql: 'DELETE FROM expenses WHERE id = ? AND family_id = ?',
        args: [rec.rows[0].expense_id, req.user.familyId]
      });
    }
    await db.execute({ sql: 'DELETE FROM receipts WHERE id = ? AND family_id = ?', args: [req.params.id, req.user.familyId] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
