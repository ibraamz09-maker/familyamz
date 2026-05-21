const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const CATEGORIES = ['Courses', 'Restauration', 'Loisirs', 'Vêtements', 'Santé', 'Abonnements', 'Électricité', 'Essence', 'Autres'];

const PROMPT = (today) =>
  `Analyse ce ticket de caisse ou cette facture. Catégories disponibles: ${CATEGORIES.join(', ')}. Date du jour si non trouvée: ${today}. Réponds UNIQUEMENT avec ce JSON sans markdown: {"amount": <montant total décimal ou null>, "date": "<YYYY-MM-DD>", "category": "<une des catégories>", "description": "<nom du magasin>"}`;

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

// ── Mistral (Pixtral) ────────────────────────────────────────────────────────
async function analyzeWithMistral(base64Data, mimetype) {
  const apiKey = (process.env.MISTRAL_API_KEY || '').trim();
  if (!apiKey) return null;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64Data}` } },
            { type: 'text', text: PROMPT(today) },
          ],
        }],
        max_tokens: 300,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(`Mistral: ${data.error.message}`);
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    console.log('[Mistral] Réponse:', raw.slice(0, 200));
    return extractJSON(raw);
  } catch (e) {
    console.error('[Mistral] Erreur:', e.message);
    return null;
  }
}

// ── Gemini (fallback) ────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  { model: 'gemini-1.5-flash-8b', version: 'v1beta' },
  { model: 'gemini-1.5-flash-8b', version: 'v1' },
  { model: 'gemini-1.5-flash',    version: 'v1' },
  { model: 'gemini-2.0-flash-lite', version: 'v1beta' },
  { model: 'gemini-2.0-flash',    version: 'v1beta' },
];

async function callGemini(apiKey, model, version, parts) {
  const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
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
  if (!apiKey) return null;

  const today = new Date().toISOString().slice(0, 10);
  const parts = [
    { inline_data: { mime_type: mimetype, data: base64Data } },
    { text: PROMPT(today) },
  ];

  for (const { model, version } of GEMINI_MODELS) {
    try {
      const data = await callGemini(apiKey, model, version, parts);
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      console.log(`[Gemini] Réponse (${model}):`, raw.slice(0, 200));
      const parsed = extractJSON(raw);
      if (parsed) return parsed;
    } catch (e) {
      console.error(`[Gemini] Échec ${model} (${version}):`, e.message);
      if (e.message.includes('API_KEY') || e.message.includes('401') || e.message.includes('403')) break;
    }
  }
  return null;
}

// ── Analyse principale : Mistral en priorité, Gemini en fallback ─────────────
async function analyzeReceipt(base64Data, mimetype) {
  const result = await analyzeWithMistral(base64Data, mimetype);
  if (result) { console.log('[IA] Succès via Mistral'); return result; }
  const result2 = await analyzeWithGemini(base64Data, mimetype);
  if (result2) { console.log('[IA] Succès via Gemini'); return result2; }
  return null;
}

// ── Endpoint diagnostic ──────────────────────────────────────────────────────
router.get('/test-gemini', authMiddleware, async (req, res) => {
  const mistralKey = (process.env.MISTRAL_API_KEY || '').trim();
  const geminiKey  = (process.env.GEMINI_API_KEY  || '').trim();
  const results = [];

  // Test Mistral
  if (mistralKey) {
    try {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralKey}` },
        body: JSON.stringify({ model: 'pixtral-12b-2409', messages: [{ role: 'user', content: 'Réponds juste ok' }], max_tokens: 10 }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      results.push({ model: 'Mistral pixtral-12b', ok: true, response: d.choices?.[0]?.message?.content || '' });
    } catch (e) {
      results.push({ model: 'Mistral pixtral-12b', ok: false, error: e.message });
    }
  } else {
    results.push({ model: 'Mistral', ok: false, error: 'MISTRAL_API_KEY non défini' });
  }

  // Test Gemini
  if (geminiKey) {
    for (const { model, version } of GEMINI_MODELS) {
      try {
        const data = await callGemini(geminiKey, model, version, [{ text: 'Réponds juste ok' }]);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        results.push({ model: `Gemini ${model}`, ok: true, response: text.slice(0, 50) });
        break;
      } catch (e) {
        results.push({ model: `Gemini ${model}`, ok: false, error: e.message });
        if (e.message.includes('401') || e.message.includes('403')) break;
      }
    }
  } else {
    results.push({ model: 'Gemini', ok: false, error: 'GEMINI_API_KEY non défini' });
  }

  res.json({ results });
});

router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { data, mimetype } = req.body;
    if (!data || !mimetype) return res.status(400).json({ error: 'Image manquante' });
    const result = await analyzeReceipt(data, mimetype);
    if (!result) return res.json({ amount: null, date: new Date().toISOString().slice(0, 10), category: 'Autres', description: '' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Export ZIP de tous les tickets d'une année ───────────────────────────────
router.get('/export/:year', authMiddleware, async (req, res) => {
  try {
    const { year } = req.params;
    const result = await db.execute({
      sql: `SELECT id, filename, mimetype, data, amount, date, category, description FROM receipts WHERE family_id = ? AND strftime('%Y', date) = ? ORDER BY date ASC`,
      args: [req.user.familyId, year],
    });
    const rows = result.rows;
    if (rows.length === 0) return res.status(404).json({ error: 'Aucun ticket pour cette année' });

    const archiver = require('archiver');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${year}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    // Ajouter chaque image
    const nameCount = {};
    for (const r of rows) {
      const buf = Buffer.from(r.data, 'base64');
      const ext = r.mimetype === 'application/pdf' ? '.pdf' : r.mimetype.includes('png') ? '.png' : '.jpg';
      const base = `${r.date}_${(r.description || r.filename || 'ticket').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)}`;
      nameCount[base] = (nameCount[base] || 0) + 1;
      const name = nameCount[base] > 1 ? `${base}_${nameCount[base]}${ext}` : `${base}${ext}`;
      archive.append(buf, { name });
    }

    // Ajouter un résumé CSV
    const lines = ['Date,Montant,Catégorie,Description'];
    for (const r of rows) {
      lines.push(`${r.date},${r.amount != null ? r.amount : ''},${r.category},"${(r.description || '').replace(/"/g, '""')}"`);
    }
    archive.append(lines.join('\n'), { name: `resume-${year}.csv` });

    archive.finalize();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Supprimer les images d'une année (garde les dépenses liées) ───────────────
router.delete('/year/:year', authMiddleware, async (req, res) => {
  try {
    const { year } = req.params;
    const result = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM receipts WHERE family_id = ? AND strftime('%Y', date) = ?`,
      args: [req.user.familyId, year],
    });
    const count = Number(result.rows[0].cnt);
    await db.execute({
      sql: `DELETE FROM receipts WHERE family_id = ? AND strftime('%Y', date) = ?`,
      args: [req.user.familyId, year],
    });
    res.json({ ok: true, deleted: count });
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
    if (category) { sql += ` AND category = ?`; args.push(category); }
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
    const { filename, mimetype, data, amount, date, category, description, member_id, account } = req.body;
    if (!filename || !mimetype || !data || !date || !category) {
      return res.status(400).json({ error: 'Champs manquants' });
    }
    const validCategories = ['Courses', 'Restauration', 'Loisirs', 'Vêtements', 'Santé', 'Abonnements', 'Électricité', 'Essence', 'Autres'];
    const safeCategory = validCategories.includes(category) ? category : 'Autres';
    let expenseId = null;
    if (amount && parseFloat(amount) > 0) {
      const desc = description ? `📎 ${description}` : `📎 Ticket`;
      const expResult = await db.execute({
        sql: `INSERT INTO expenses (family_id, member_id, amount, date, category, description, account) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [req.user.familyId, member_id || null, parseFloat(amount), date, safeCategory, desc, account || 'Non placé']
      });
      expenseId = Number(expResult.lastInsertRowid);
    }
    const result = await db.execute({
      sql: `INSERT INTO receipts (family_id, filename, mimetype, data, amount, date, category, description, member_id, expense_id, account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [req.user.familyId, filename, mimetype, data, amount || null, date, safeCategory, description || '', member_id || null, expenseId, account || '']
    });
    res.json({ id: Number(result.lastInsertRowid), expense_id: expenseId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
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
