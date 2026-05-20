const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const CATEGORIES = ['Loisirs', 'Vêtements', 'Abonnements', 'Électricité', 'Essence', 'Autres'];

async function analyzeWithGemini(base64Data, mimetype) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Analyse ce ticket de caisse ou cette facture. Catégories disponibles: ${CATEGORIES.join(', ')}. Date du jour si non trouvée: ${today}. Réponds UNIQUEMENT avec ce JSON sans markdown: {"amount": <montant total décimal ou null>, "date": "<YYYY-MM-DD>", "category": "<une des catégories>", "description": "<nom du magasin>"}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimetype, data: base64Data } }, { text: prompt }] }] }),
    });
    const data = await response.json();
    if (data.error) { console.error('Gemini error:', data.error.message); return null; }
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().replace(/```json\n?|\n?```/g, '');
    return JSON.parse(text);
  } catch (e) {
    console.error('Gemini error:', e.message);
    return null;
  }
}

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
