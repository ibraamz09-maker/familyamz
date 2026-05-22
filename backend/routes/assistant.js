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
    "title": "...",
    "date": "YYYY-MM-DD",
    "time": "HH:MM ou vide",
    "end_time": "HH:MM ou vide",
    "description": "...",
    "members": [],
    "recurrence": "none ou daily",
    "amount": 0,
    "category": "...",
    "text": "..."
  }
}

Règles:
- "demain" = ${new Date(Date.now()+86400000).toISOString().slice(0,10)}
- Si l'heure n'est pas mentionnée, mets ""
- Si le montant n'est pas clair, mets 0
- Sois précis sur la catégorie selon le contexte`;

    let raw = '';
    let lastError = '';

    // ── 1. Groq (Llama 3 — 14 400 req/jour gratuit) ──
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    if (groqKey) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
          }),
        });
        if (response.ok) {
          const json = await response.json();
          raw = json.choices?.[0]?.message?.content || '';
          console.log('[Assistant] Succès via Groq');
        } else {
          const err = await response.json().catch(() => ({}));
          lastError = `Groq error ${response.status}: ${err?.error?.message || 'inconnu'}`;
          console.warn('[Assistant]', lastError);
        }
      } catch (e) {
        lastError = `Groq exception: ${e.message}`;
        console.warn('[Assistant]', lastError);
      }
    }

    // ── 2. Gemini (5 modèles en cascade) ──
    if (!raw) {
      const geminiKey = (process.env.GEMINI_API_KEY_ASSISTANT || process.env.GEMINI_API_KEY || '').trim();
      if (geminiKey) {
        const GEMINI_MODELS = [
          { model: 'gemini-2.5-flash-preview-05-20', version: 'v1beta' },
          { model: 'gemini-2.0-flash',               version: 'v1beta' },
          { model: 'gemini-2.0-flash-lite',          version: 'v1beta' },
        ];
        for (const { model, version } of GEMINI_MODELS) {
          try {
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
              console.log(`[Assistant] Succès via Gemini (${model})`);
              break;
            }
            const err = await response.json().catch(() => ({}));
            lastError = `Gemini error ${response.status} (${model}): ${err?.error?.message || 'inconnu'}`;
            console.warn('[Assistant]', lastError);
          } catch (e) {
            lastError = `Gemini exception (${model}): ${e.message}`;
          }
        }
      }
    }

    // ── 3. Mistral (fallback final) ──
    if (!raw) {
      const mistralKey = (process.env.MISTRAL_API_KEY || '').trim();
      if (mistralKey) {
        try {
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
            console.log('[Assistant] Succès via Mistral');
          } else {
            const err = await response.json().catch(() => ({}));
            lastError = `Mistral error ${response.status}: ${err?.message || 'inconnu'}`;
            console.warn('[Assistant]', lastError);
          }
        } catch (e) {
          lastError = `Mistral exception: ${e.message}`;
        }
      }
    }

    if (!raw) return res.status(500).json({ error: lastError || 'Tous les modèles IA ont échoué' });

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
