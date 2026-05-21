const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

const CATEGORIES = ['Courses', 'Restauration', 'Loisirs', 'Vêtements', 'Santé', 'Abonnements', 'Électricité', 'Essence', 'Autres'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const today = todayStr();
    const prompt = `Tu es l'assistant familial de l'app FamilyAmz.
Date du jour: ${today} (${new Date().toLocaleDateString('fr-FR', { weekday: 'long' })})
Membres de la famille: Papa, Ibrahim, Imen, Assia, Sabah
Catégories de dépenses: ${CATEGORIES.join(', ')}

L'utilisateur dit: "${text}"

Détermine l'action à effectuer et réponds UNIQUEMENT avec ce JSON sans markdown ni explication:
{
  "action": "add_event|add_task|add_expense|send_message|unknown",
  "summary": "Ce que tu vas faire en 1 courte phrase",
  "data": {
    // add_event → title (string), date (YYYY-MM-DD), time (HH:MM ou ""), end_time (HH:MM ou ""), description (string), members (tableau de noms parmi Papa/Ibrahim/Imen/Assia/Sabah, vide = tous)
    // add_task → title (string), recurrence ("daily" si tâche quotidienne sinon "none")
    // add_expense → amount (nombre décimal), category (une parmi les catégories), date (YYYY-MM-DD), description (string)
    // send_message → text (string)
    // unknown → {}
  }
}

Règles:
- Pour les dates relatives: "demain" = ${new Date(Date.now()+86400000).toISOString().slice(0,10)}, "lundi prochain" = calcule la prochaine occurrence
- Si l'heure n'est pas mentionnée, mets ""
- Si le montant n'est pas clair pour une dépense, mets 0
- Sois précis sur la catégorie de dépense selon le contexte`;

    let raw = '';
    let lastError = '';

    // ── 1. Essayer Gemini (5 modèles en cascade) ──
    const geminiKey = (process.env.GEMINI_API_KEY_ASSISTANT || process.env.GEMINI_API_KEY || '').trim();
    if (geminiKey) {
      const GEMINI_MODELS = [
        { model: 'gemini-1.5-flash-8b', version: 'v1beta' },
        { model: 'gemini-1.5-flash-8b', version: 'v1' },
        { model: 'gemini-1.5-flash',    version: 'v1' },
        { model: 'gemini-2.0-flash-lite', version: 'v1beta' },
        { model: 'gemini-2.0-flash',    version: 'v1beta' },
      ];
      for (const { model, version } of GEMINI_MODELS) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
            }),
          }
        );
        if (response.ok) {
          const json = await response.json();
          raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          break;
        }
        const err = await response.json().catch(() => ({}));
        lastError = `Gemini error ${response.status} (${model}): ${err?.error?.message || 'inconnu'}`;
        console.warn(`[Assistant] ${lastError}`);
      }
    }

    // ── 2. Fallback Mistral si Gemini a échoué ──
    if (!raw) {
      const mistralKey = (process.env.MISTRAL_API_KEY || '').trim();
      if (mistralKey) {
        console.log('[Assistant] Gemini épuisé, tentative Mistral...');
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralKey}`,
          },
          body: JSON.stringify({
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
          }),
        });
        if (response.ok) {
          const json = await response.json();
          raw = json.choices?.[0]?.message?.content || '';
        } else {
          const err = await response.json().catch(() => ({}));
          lastError = `Mistral error ${response.status}: ${err?.message || 'inconnu'}`;
          console.warn(`[Assistant] ${lastError}`);
        }
      }
    }

    if (!raw) return res.status(500).json({ error: lastError || 'Tous les modèles IA ont échoué' });

    // Extraire le JSON de la réponse
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Réponse IA invalide' });

    const result = JSON.parse(match[0]);
    res.json(result);
  } catch (e) {
    console.error('[Assistant] Erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
