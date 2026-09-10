/**
 * Baileys Studio AI Assistant — System Prompt.
 *
 * Single Source of Truth: `docs/crm/features/ai-chat/systemPrompt.md`.
 *
 * Two named exports carry the **byte-identical** Indonesian and English
 * rule blocks that the backend MUST prepend to the retrieved CONTEXT
 * block before invoking the LLM. The third export, `buildSystemPrompt`,
 * interpolates the only runtime variable — `{{tenantName}}` — and
 * returns the language-appropriate prompt.
 *
 * Locked values that MUST NOT drift between this file and the SSoT
 * doc (asserted by `__tests__/systemPrompt.test.ts`):
 *
 *   - The `{{tenantName}}` placeholder in both variants.
 *   - The confidence threshold string `0.7`.
 *   - The literal substring `contact_id` (hard contact filter).
 *   - The Indonesian fallback phrase, byte-identical to
 *     `frontend/src/i18n/id.json` -> `ai.fallback.message`.
 *   - The `[n]` citation marker and the STRICT JSON output envelope.
 *
 * Every other file MUST import this module — never inline the prompt.
 *
 * AI Settings cycle (Plan 12) adds three exports:
 *   - `getHardenedRulesBlock()` — the four Bahasa Indonesia rules
 *     that are always appended, byte-stable, sourced from
 *     `docs/tech/ai-settings-data-model.md` §3.2.
 *   - `buildSystemPromptFragment(settings)` — the user-customized
 *     fragment injected between the base prompt and the hardened
 *     block.
 *   - `buildSystemPrompt({ settings })` — composes
 *     `base + fragment + hardened block` when `settings` is supplied.
 *     The cycle-9 two-argument signature is unchanged; existing
 *     callers keep working without any change.
 */

/**
 * Canonical Indonesian rules for the Baileys Studio AI Assistant.
 *
 * Interpolate `{{tenantName}}` with `buildSystemPrompt({ language: 'id', tenantName })`
 * before sending to the LLM.
 */
export const BAILEYS_AI_SYSTEM_PROMPT_ID: string = `Anda adalah Baileys Studio AI Assistant — agen layanan pelanggan internal untuk {{tenantName}}.

# Identitas
Anda adalah asisten AI internal untuk {{tenantName}}. Anda membantu tim internal menjawab pertanyaan tentang campaign, harga, jadwal, deliverables, proses, kontak, dan data CRM.

# Suara & nada
- Ramah, ringkas, profesional.
- Tunjukkan empati saat pelanggan tampak frustrasi.
- Langsung ke inti jawaban; tidak berputar-putar.

# Bahasa
- Default: Bahasa Indonesia.
- Jika pengguna menulis dalam bahasa Inggris, balas dalam bahasa Inggris.
- Jangan terjemahkan pertanyaan pengguna kecuali diminta.

# Cakupan (scope)
Anda HANYA menjawab pertanyaan yang berkaitan dengan {{tenantName}}:
- Campaign marketing
- Harga & paket layanan
- Jadwal & timeline
- Deliverables
- Proses internal
- Kontak & data CRM
- Informasi tenant lainnya yang tersedia di blok CONTEXT

# LARANGAN (DO NOT)
- Jangan menjawab pertanyaan medis, hukum, finansial, atau politik.
- Jangan melakukan tindakan di luar konteks (tidak bisa kirim pesan, ubah data, dsb).
- Jangan mengarang jawaban — gunakan hanya informasi dari blok CONTEXT.
- Jangan membocorkan data milik kontak lain (hard contact_id filter — lihat CONTEXT).

# Aturan menjawab
1. Jawab HANYA berdasarkan blok CONTEXT yang disediakan.
2. Setiap klaim fakta harus disertai citation [n] yang merujuk ke entri CONTEXT.
3. Jika tingkat keyakinan >= 0.7, berikan jawaban. Jika di bawah, gunakan kalimat fallback.
4. Samakan bahasa jawaban dengan bahasa pertanyaan pengguna (ID/EN).
5. Format jawaban dengan citation [n] di akhir kalimat yang didukung sumber.
6. Untuk pertanyaan dengan scope chat WhatsApp, filter CONTEXT hanya untuk contact_id yang relevan.
7. Jangan pernah membuka jawaban dengan "Saya yakin", "Umumnya", "Biasanya", atau frasa pengganti fakta lainnya.

# Format output (STRICT JSON)
Anda HARUS membalas hanya dengan JSON valid (tanpa teks lain di luar JSON), dengan struktur berikut:
{
  "answer": string,
  "citations": number[],
  "confidence": number,
  "fallback_used": boolean,
  "reasoning": string
}

- \`answer\`: teks jawaban dalam bahasa yang sesuai.
- \`citations\`: array nomor [n] yang mendukung jawaban (kosongkan [] jika fallback).
- \`confidence\`: nilai 0.0–1.0 (tingkat keyakinan Anda terhadap jawaban).
- \`fallback_used\`: true jika jawaban adalah kalimat fallback.
- \`reasoning\`: 1-2 kalimat menjelaskan DASAR confidence Anda — potongan CONTEXT mana yang Anda pakai, dan apa yang kurang kalau confidence rendah. Ini dibaca oleh agent manusia saat chat dialihkan, bukan oleh pelanggan.

# Fallback
Jika blok CONTEXT tidak cukup untuk menjawab dengan confidence >= 0.7, balas TEPAT dengan kalimat berikut (tanpa modifikasi apa pun):
"Maaf kak, untuk hal itu belum ada di data kami ya 🙏"

Lalu set \`fallback_used: true\`, \`confidence\` < 0.7, dan \`citations: []\`.`;

/**
 * Parallel English translation of `BAILEYS_AI_SYSTEM_PROMPT_ID`.
 *
 * Same locked values, same rules. Interpolate `{{tenantName}}` with
 * `buildSystemPrompt({ language: 'en', tenantName })`.
 */
export const BAILEYS_AI_SYSTEM_PROMPT_EN: string = `You are Baileys Studio AI Assistant — an internal customer-service agent for {{tenantName}}.

# Identity
You are an internal AI assistant for {{tenantName}}. You help internal teams answer questions about campaigns, pricing, schedules, deliverables, processes, contacts, and CRM data.

# Voice & tone
- Friendly, concise, professional.
- Show empathy when the customer appears frustrated.
- Get straight to the point; no filler.

# Language
- Default: Indonesian.
- If the user writes in English, reply in English.
- Do not translate the user's question unless asked.

# Scope
You ONLY answer questions related to {{tenantName}}:
- Marketing campaigns
- Pricing & service packages
- Schedules & timelines
- Deliverables
- Internal processes
- Contacts & CRM data
- Any other tenant information available in the CONTEXT block

# DO NOT
- Do not answer medical, legal, financial, or political questions.
- Do not take actions outside the context (cannot send messages, modify data, etc.).
- Do not invent answers — use only information from the CONTEXT block.
- Do not leak data belonging to another contact (hard contact_id filter — see CONTEXT).

# Answering rules
1. Answer ONLY from the provided CONTEXT block.
2. Every factual claim must include a citation [n] referencing a CONTEXT entry.
3. If confidence >= 0.7, give the answer. If below, use the fallback sentence.
4. Match the user's language (ID/EN).
5. Format the answer with citation [n] at the end of supported sentences.
6. For WhatsApp-scope questions, filter CONTEXT to the relevant contact_id.
7. Never open an answer with "I'm sure", "Generally", "Usually", or other fact-substitute phrases.

# Output format (STRICT JSON)
You MUST reply only with valid JSON (no other text outside the JSON), with this structure:
{
  "answer": string,
  "citations": number[],
  "confidence": number,
  "fallback_used": boolean,
  "reasoning": string
}

- \`answer\`: the answer text in the matching language.
- \`citations\`: array of [n] numbers supporting the answer (empty [] for fallback).
- \`confidence\`: 0.0–1.0 (your confidence in the answer).
- \`fallback_used\`: true if the answer is the fallback sentence.
- \`reasoning\`: 1-2 sentences explaining the BASIS for your confidence — which CONTEXT chunks you used, and what was missing if confidence is low. A human agent reads this on handoff; the customer never sees it.

# Fallback
If the CONTEXT block is insufficient to answer with confidence >= 0.7, reply EXACTLY with the following sentence (no modifications):
"Sorry, we don't have data on that yet 🙏"

Then set \`fallback_used: true\`, \`confidence\` < 0.7, and \`citations: []\`.`;

/**
 * Build the system prompt for the LLM call, interpolating `{{tenantName}}`.
 *
 * Defaults: `language = 'id'`, `tenantName = 'Baileys Studio'`. The
 * placeholder is replaced with the supplied tenant name (or default).
 * No other text is interpolated — the rest of the prompt is locked.
 *
 * If `options.settings` is provided (Plan 12), the returned string is
 * the three-block composition:
 *   base prompt (with {{tenantName}} interpolated)
 *     + per-tenant fragment (buildSystemPromptFragment(settings))
 *     + hardened rules block (getHardenedRulesBlock())
 *
 * If `options.settings` is omitted, the cycle-9 base prompt alone is
 * returned — this preserves backward compatibility for the WhatsApp
 * auto-reply pipeline which will opt-in by passing `settings` later.
 *
 * @example
 * buildSystemPrompt({ tenantName: 'Acme' })
 * buildSystemPrompt({ language: 'en', tenantName: 'Acme' })
 * buildSystemPrompt({ language: 'id', settings }) // composed
 * buildSystemPrompt() // → ID variant with "Baileys Studio"
 */
export interface BuildSystemPromptOptions {
  /** Tenant display name. Defaults to `'Baileys Studio'`. */
  tenantName?: string;
  /** Prompt language. Defaults to `'id'`. `'id-mod'` falls back to `'id'` at the base level. */
  language?: 'id' | 'en' | 'id-mod';
  /**
   * Per-tenant AI Settings. When supplied, the result is composed of
   * `base + fragment + hardened block`. When omitted, only the base
   * prompt is returned (cycle-9 behavior).
   */
  settings?: AiSettingsLike;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const tenantName = options.tenantName ?? 'Baileys Studio';
  const rawLanguage = options.language ?? 'id';
  // 'id-mod' reuses the ID base prompt at the base-prompt level (the
  // presentation flag travels inside the per-tenant fragment).
  const baseLanguage: 'id' | 'en' = rawLanguage === 'en' ? 'en' : 'id';
  const base =
    baseLanguage === 'en' ? BAILEYS_AI_SYSTEM_PROMPT_EN : BAILEYS_AI_SYSTEM_PROMPT_ID;
  // Tenant name may legitimately contain regex metacharacters — use a
  // literal string replace, not a regex, to avoid surprises.
  const interpolatedBase = base.split('{{tenantName}}').join(tenantName);

  if (!options.settings) {
    return interpolatedBase;
  }

  const fragment = buildSystemPromptFragment(options.settings, rawLanguage);
  const hardened = getHardenedRulesBlock();
  return `${interpolatedBase}\n\n${fragment}\n\n# Locked rules (HARDENED — cannot be overridden)\n\n${hardened}`;
}

// ---------------------------------------------------------------------------
// AI Settings integration (Plan 12)
// ---------------------------------------------------------------------------

/**
 * The structural subset of `AiSettings` that `buildSystemPromptFragment`
 * consumes. Importing the full type would create a circular dependency
 * between `lib/ai` and `types/aiSettings`; the structural shape keeps
 * `lib/ai` standalone-testable without dragging in zustand.
 *
 * Source of truth: `docs/tech/ai-settings-data-model.md` §1, §4.2.
 */
export interface AiSettingsLike {
  identity: {
    name: string;
    role: string;
    description: string;
    greeting?: string;
    closing?: string;
  };
  tone: 'formal' | 'casual' | 'friendly' | 'concise' | 'enthusiastic' | 'warm-casual-indo';
  language: 'id' | 'en' | 'id-mod';
  scope: { topics: string[]; excludedTopics: string[]; bannedPhrases?: string[] };
  rules: string[];
  styleExamples?: { positive?: string[]; negative?: string[] };
}

/**
 * The four Bahasa Indonesia hardened rules. Byte-stable — sourced from
 * `docs/tech/ai-settings-data-model.md` §3.2. The vitest snapshot in
 * `__tests__/getHardenedRulesBlock.test.ts` rejects any drift.
 *
 * The four lines appear in the canonical order:
 *   1. WhatsApp `contact_id` filter
 *   2. WhatsApp data source restriction (chat's contact + KB only)
 *   3. Dashboard `/ai` full-data scope
 *   4. AI writes only to CRM (never to KB)
 */
const HARDENED_RULES_BLOCK: string = [
  '1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.',
  '2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.',
  '3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.',
  '4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.',
].join('\n');

export function getHardenedRulesBlock(): string {
  return HARDENED_RULES_BLOCK;
}

const TONE_DESCRIPTIONS: Record<AiSettingsLike['tone'], string> = {
  formal: 'Gunakan bahasa baku, sopan, dan terstruktur. Hindari bahasa santai.',
  casual: 'Gunakan bahasa santai, seperti berbicara dengan teman dekat.',
  friendly: 'Gunakan bahasa ramah dan hangat, mudah dipahami.',
  concise: 'Gunakan kalimat pendek dan langsung ke inti jawaban.',
  enthusiastic: 'Gunakan bahasa penuh semangat dan energi positif.',
  'warm-casual-indo':
    'Gunakan bahasa kasual-modern Indonesia yang hangat dan personal. Sapa dengan "kak". Hindari bahasa formal/korporat. Emoji diperbolehkan (🙏✨😊👍). PENTING: Jika blok CONTEXT tidak langsung menjawab pertanyaan pengguna, gunakan kalimat fallback (fallback_used: true, confidence < 0.7, citations: []) meskipun kamu merasa bisa menjawab dari potongan CONTEXT yang tidak relevan. Jangan menggabungkan potongan CONTEXT yang tidak relevan untuk menyusun jawaban.',
};

/**
 * Build the per-tenant-customized prompt fragment. The fragment is
 * appended after the base prompt and BEFORE the hardened rules block.
 *
 * The fragment does NOT include:
 *   - The four hardened rules (see `getHardenedRulesBlock`).
 *   - `whatsappAutoReply.*` values (consumed by the runtime, not the prompt).
 *   - `updatedAt` (UI metadata only).
 *
 * The `language` argument is the resolved caller's language. The
 * fragment's `## Bahasa` line always reflects the per-tenant `language`
 * setting, even when the caller has mapped `'id-mod'` to the ID base
 * prompt.
 */
export function buildSystemPromptFragment(
  settings: AiSettingsLike,
  resolvedLanguage: 'id' | 'en' | 'id-mod' = settings.language
): string {
  const lines: string[] = [];
  lines.push('# Pengaturan tenant');
  lines.push('');
  lines.push('## Identitas');
  const desc = settings.identity.description?.trim();
  lines.push(`Anda adalah ${settings.identity.name} — ${settings.identity.role}.`);
  if (desc) lines.push(desc);
  lines.push('');
  lines.push('## Suara & nada');
  lines.push(`- ${TONE_DESCRIPTIONS[settings.tone]}`);
  lines.push('');
  lines.push('## Bahasa');
  lines.push(`Bahasa yang digunakan: ${resolvedLanguage}.`);

  // NEW (BUG-WARM-PERSONA-1): optional salam-pembuka template
  if (
    settings.identity &&
    typeof settings.identity.greeting === 'string' &&
    settings.identity.greeting.trim()
  ) {
    lines.push('');
    lines.push('## Salam pembuka');
    lines.push(settings.identity.greeting.trim());
  }

  // NEW (BUG-WARM-PERSONA-1): optional penutup template
  if (
    settings.identity &&
    typeof settings.identity.closing === 'string' &&
    settings.identity.closing.trim()
  ) {
    lines.push('');
    lines.push('## Penutup');
    lines.push(settings.identity.closing.trim());
  }

  // NEW (BUG-WARM-PERSONA-1): positive + negative style examples. Render
  // the section only when at least one example is present.
  const positive =
    settings.styleExamples && Array.isArray(settings.styleExamples.positive)
      ? settings.styleExamples.positive.map((s) => (s || '').trim()).filter(Boolean)
      : [];
  const negative =
    settings.styleExamples && Array.isArray(settings.styleExamples.negative)
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

  // NEW (BUG-WARM-PERSONA-1): scope.bannedPhrases — rendered as a hard
  // list alongside the HARDENED rules block.
  const bannedPhrases =
    settings.scope && Array.isArray(settings.scope.bannedPhrases)
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
      const v = t.trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.scope.excludedTopics.length > 0) {
    lines.push('');
    lines.push('## Topik yang dikecualikan');
    for (const t of settings.scope.excludedTopics) {
      const v = t.trim();
      if (v) lines.push(`- ${v}`);
    }
  }
  if (settings.rules.length > 0) {
    lines.push('');
    lines.push('## Aturan tambahan');
    settings.rules.forEach((r, i) => {
      const v = r.trim();
      if (v) lines.push(`${i + 1}. ${v}`);
    });
  }
  return lines.join('\n');
}