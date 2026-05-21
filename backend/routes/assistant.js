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

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return res.status(400).json({ error: 'Clé Gemini non configurée' });

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

    // Essayer plusieurs modèles en cascade
    const MODELS = [
      { model: 'gemini-1.5-flash-8b', version: 'v1beta' },
      { model: 'gemini-1.5-flash-8b', version: 'v1' },
      { model: 'gemini-1.5-flash',    version: 'v1' },
      { model: 'gemini-2.0-flash-lite', version: 'v1beta' },
      { model: 'gemini-2.0-flash',    version: 'v1beta' },
    ];

    let raw = '';
    let lastError = '';
    for (const { model, version } of MODELS) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`.replace('v1beta/models', `${version}/models`),
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

    if (!raw) return res.status(500).json({ error: lastError || 'Tous les modèles Gemini ont échoué' });

    // Extraire le JSON de la réponse
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Réponse Gemini invalide' });

    const result = JSON.parse(match[0]);
    res.json(result);
  } catch (e) {
    console.error('[Assistant] Erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
