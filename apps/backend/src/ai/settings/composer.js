'use strict';
/**
 * System prompt composer.
 * Source: docs/crm/plans/16-settings-store-composer-hardened.md step 4.
 * Mirror of frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt.
 *
 * The composer is intentionally framework-free (no zustand, no React) so
 * it is byte-identical to the FE composer for the same inputs.
 */
const { getHardenedRulesBlock } = require('./hardened-rules');

const TONE_DESCRIPTIONS = Object.freeze({
  formal: 'Gunakan bahasa baku, sopan, dan terstruktur. Hindari bahasa santai.',
  casual: 'Gunakan bahasa santai, seperti berbicara dengan teman dekat.',
  friendly: 'Gunakan bahasa ramah dan hangat, mudah dipahami.',
  concise: 'Gunakan kalimat pendek dan langsung ke inti jawaban.',
  enthusiastic: 'Gunakan bahasa penuh semangat dan energi positif.',
  'warm-casual-indo': 'Gunakan bahasa kasual-modern Indonesia yang hangat dan personal. Sapa dengan "kak". Hindari bahasa formal/korporat. Emoji diperbolehkan (🙏✨😊👍). PENTING: Jika blok CONTEXT tidak langsung menjawab pertanyaan pengguna, gunakan kalimat fallback (fallback_used: true, confidence < 0.7, citations: []) meskipun kamu merasa bisa menjawab dari potongan CONTEXT yang tidak relevan. Jangan menggabungkan potongan CONTEXT yang tidak relevan untuk menyusun jawaban.',
});

/**
 * Build the per-tenant fragment — identical algorithm to FE.
 * @param {object} settings - AiSettings-like object.
 * @param {'id'|'en'|'id-mod'} [resolvedLanguage]
 * @returns {string}
 */
function buildSystemPromptFragment(settings, resolvedLanguage) {
  if (resolvedLanguage === undefined) {
    resolvedLanguage = settings.language;
  }
  const lines = [];
  lines.push('# Pengaturan tenant');
  lines.push('');
  lines.push('## Identitas');
  const desc = (settings.identity.description || '').trim();
  lines.push(`Anda adalah ${settings.identity.name} — ${settings.identity.role}.`);
  if (desc) lines.push(desc);
  lines.push('');
  lines.push('## Suara & nada');
  lines.push(`- ${TONE_DESCRIPTIONS[settings.tone] || TONE_DESCRIPTIONS.friendly}`);
  lines.push('');
  lines.push('## Bahasa');
  lines.push(`Bahasa yang digunakan: ${resolvedLanguage}.`);

  // NEW (BUG-WARM-PERSONA-1): optional greeting template (FE-controlled)
  if (settings.identity && typeof settings.identity.greeting === 'string' && settings.identity.greeting.trim()) {
    lines.push('');
    lines.push('## Salam pembuka');
    lines.push(settings.identity.greeting.trim());
  }

  // NEW (BUG-WARM-PERSONA-1): optional closing template (FE-controlled)
  if (settings.identity && typeof settings.identity.closing === 'string' && settings.identity.closing.trim()) {
    lines.push('');
    lines.push('## Penutup');
    lines.push(settings.identity.closing.trim());
  }

  // NEW (BUG-WARM-PERSONA-1): style examples (positive / negative) — shows the
  // LLM concrete good vs bad phrasings. Both arrays optional; render the
  // section only if at least one example is present.
  const positive = (settings.styleExamples && Array.isArray(settings.styleExamples.positive))
    ? settings.styleExamples.positive.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  const negative = (settings.styleExamples && Array.isArray(settings.styleExamples.negative))
    ? settings.styleExamples.negative.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  if (positive.length > 0 || negative.length > 0) {
    lines.push('');
    lines.push('## Contoh gaya bahasa');
    if (positive.length > 0) {
      lines.push('### Jawaban yang bagus');
      for (const s of positive) lines.push(`> ${s}`);
    }
    if (negative.length > 0) {
      lines.push('');
      lines.push('### Jawaban yang harus dihindari');
      for (const s of negative) lines.push(`> ${s}`);
    }
  }

  // NEW (BUG-WARM-PERSONA-1): scope.bannedPhrases — phrases the LLM must
  // never produce. Rendered as a hard list so the LLM treats it as a
  // constraint alongside the HARDENED rules block.
  const bannedPhrases = (settings.scope && Array.isArray(settings.scope.bannedPhrases))
    ? settings.scope.bannedPhrases.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  if (bannedPhrases.length > 0) {
    lines.push('');
    lines.push('## Frasa yang dilarang');
    lines.push('Dilarang keras menggunakan frasa berikut dalam jawaban:');
    for (const s of bannedPhrases) lines.push(`- ${s}`);
  }

  if (settings.scope.topics.length > 0) {
    lines.push('');
    lines.push('## Topik yang dibahas');
    for (const t of settings.scope.topics) {
      const v = (t || '').trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.scope.excludedTopics.length > 0) {
    lines.push('');
    lines.push('## Topik yang dikecualikan');
    for (const t of settings.scope.excludedTopics) {
      const v = (t || '').trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.rules.length > 0) {
    lines.push('');
    lines.push('## Aturan tambahan');
    settings.rules.forEach((r, i) => {
      const v = (r || '').trim();
      if (v) lines.push(`${i + 1}. ${v}`);
    });
  }
  return lines.join('\n');
}

/**
 * Compose base + fragment + hardened block.
 * @param {object} opts
 * @param {object} opts.settings
 * @param {string} [opts.tenantName='Baileys Studio']
 * @param {'id'|'en'|'id-mod'} [opts.language='id']
 * @param {string} opts.basePrompt  - The caller passes the ID or EN base literal.
 * @returns {string}
 */
function buildSystemPrompt(opts) {
  const tenantName = (opts && opts.tenantName) || 'Baileys Studio';
  const language = (opts && opts.language) || 'id';
  const base = opts && opts.basePrompt;
  if (typeof base !== 'string') {
    throw new Error('buildSystemPrompt: basePrompt is required');
  }
  // Literal replace (not regex) to avoid surprises with regex metachars.
  const interpolatedBase = base.split('{{tenantName}}').join(tenantName);

  if (!opts.settings) return interpolatedBase;

  const fragment = buildSystemPromptFragment(opts.settings, language);
  const hardened = getHardenedRulesBlock();
  return `${interpolatedBase}\n\n${fragment}\n\n# Locked rules (HARDENED — cannot be overridden)\n\n${hardened}`;
}

module.exports = { buildSystemPrompt, buildSystemPromptFragment };