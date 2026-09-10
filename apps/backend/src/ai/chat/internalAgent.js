'use strict';
/**
 * The internal AI chat agent.
 *
 * DELIBERATELY SEPARATE from the WhatsApp auto-reply. They are different
 * functions with opposite requirements, and they used to share everything:
 *
 *   - the auto-reply talks to CUSTOMERS. It must never improvise, so it is
 *     locked to knowledge-base hits and, below a confidence threshold, sends
 *     a fixed apology and hands off to a human.
 *   - this agent talks to STAFF. It needs the whole database, including
 *     questions retrieval cannot answer ("how many invoices over 5 million",
 *     "which chats are waiting on a human"), and a fixed customer apology is
 *     a useless answer to an operator.
 *
 * Before this module, /api/crm/ai/chat and /ask used the auto-reply's system
 * prompt verbatim, gated on `settings.whatsappAutoReply.confidenceThreshold`
 * (the CUSTOMER-facing setting), and on a low score replaced the answer with
 * the literal Indonesian customer apology — shown to internal staff.
 *
 * Mechanism: the LLM gateway is single-shot (no native tool calling), so the
 * loop is explicit. Each round the model returns JSON that is either a tool
 * call or a final answer. Rounds are hard-capped, so a model that keeps
 * asking for tools terminates instead of spinning.
 */
const {
  runTool,
  describeTools,
  SCOPE_INTERNAL,
  SCOPE_CHAT,
} = require('../tools/dbTools');
const logger = require('../../utils/logger');

/** Rounds of tool calls before we force a final answer. */
const MAX_ROUNDS = Number(process.env.AI_CHAT_MAX_TOOL_ROUNDS || 4);

/**
 * Whether the assistant may answer from general model knowledge when the
 * database has nothing.
 *
 * Defaults to false: an operator needs to be able to trust that a number
 * came from their data. Set AI_CHAT_ALLOW_GENERAL_KNOWLEDGE=true to let it
 * answer from its own knowledge, clearly labelled as not database-sourced.
 */
const ALLOW_GENERAL_KNOWLEDGE =
  String(process.env.AI_CHAT_ALLOW_GENERAL_KNOWLEDGE || 'false').toLowerCase() === 'true';

/**
 * @param {'internal'|'chat'} mode which reach level's tool catalogue to
 *   advertise. The catalogue is not the enforcement boundary — runTool is —
 *   but advertising only reachable tools stops the model wasting rounds on
 *   calls that will be refused.
 */
/**
 * Staff-facing prompt. Free to reason over everything, expected to be terse,
 * and expected to say plainly when the data is not there.
 */
function buildInternalPrompt() {
  const groundingRule = ALLOW_GENERAL_KNOWLEDGE
    ? 'Kalau data internal tidak memuat jawabannya, Anda BOLEH menjawab dari pengetahuan umum Anda \u2014 tapi tandai jelas, misalnya "(dari pengetahuan umum, bukan dari database)". Jangan pernah menyajikan pengetahuan umum sebagai fakta dari database.'
    : 'Kalau data internal tidak memuat jawabannya, katakan terus terang bahwa datanya tidak ada dan sebutkan tool apa yang sudah Anda coba. JANGAN mengarang angka, harga, nama, atau isi record. Anda tetap boleh menjelaskan cara mencarinya atau data apa yang perlu diisi lebih dulu.';

  return `Anda adalah asisten AI INTERNAL untuk tim yang mengoperasikan Baileys Studio. Pengguna Anda adalah STAF INTERNAL, bukan pelanggan.

Anda punya akses baca ke SELURUH database: semua entity CRM dan record-nya, SEMUA percakapan WhatsApp beserta pesannya, dan seluruh knowledge base.

# Tools
${describeTools(SCOPE_INTERNAL)}

# Protokol
Setiap balasan HARUS satu objek JSON valid, tanpa markdown fencing:

  panggil tool  -> {"action":"tool","tool":"<nama>","args":{...},"why":"<1 kalimat>"}
  jawab         -> {"action":"answer","answer":"<jawaban>","sources":["<tool>"],"grounded":true|false}

Aturan:
- Satu tool per balasan. Hasilnya dikirim balik, lalu Anda boleh memanggil tool lain atau menjawab.
- "berapa banyak" / "total" / "rata-rata" -> pakai aggregate_records, jangan hitung baris sendiri.
- Belum tahu nama entity-nya -> list_entities dulu.
- Maksimal ${MAX_ROUNDS} panggilan tool, lalu Anda WAJIB menjawab dengan hasil yang ada.
- \`grounded\` true HANYA kalau jawaban benar-benar berasal dari hasil tool.
- ${groundingRule}
- Bahasa Indonesia, ringkas, langsung. Ini alat internal: tanpa sapaan pelanggan, tanpa emoji basa-basi.
- Angka, harga, dan tanggal dikutip persis seperti yang dikembalikan tool.`;
}

/**
 * Customer-facing prompt for the WhatsApp auto-reply.
 *
 * Same tool loop, deliberately different policy. This one answers a CUSTOMER,
 * so it keeps the auto-reply's safety envelope: only this contact's own data,
 * no general knowledge, and a self-assessed confidence plus the locked
 * fallback phrase that lets trigger.js decide whether to send or hand off to
 * a human. The tools only widen WHAT it may look up about this one contact —
 * they do not relax any of those gates.
 */
function buildChatPrompt(basePrompt) {
  return `${basePrompt}

# Tools (baca-saja, hanya tentang kontak ini)
${describeTools(SCOPE_CHAT)}

Anda HANYA bisa melihat data kontak yang sedang Anda layani: percakapan ini dan record CRM milik kontak ini. Data pelanggan lain tidak dapat diakses \u2014 jangan menyebutkan atau menyiratkan keberadaannya.

# Protokol
Setiap balasan HARUS satu objek JSON valid, tanpa markdown fencing:

  panggil tool  -> {"action":"tool","tool":"<nama>","args":{...},"why":"<1 kalimat>"}
  jawab final   -> {"action":"answer","answer":"...","citations":[1,2],"confidence":0.0-1.0,"fallback_used":true|false,"reasoning":"..."}

Aturan:
- Pakai tool dulu kalau pertanyaannya menyangkut data (tagihan, pesanan, jadwal kontak ini). Jangan menebak.
- Satu tool per balasan. Maksimal ${MAX_ROUNDS} panggilan, lalu WAJIB menjawab.
- Field pada jawaban final mengikuti aturan format di atas: \`confidence\` sesuai keyakinan Anda, dan \`fallback_used\` true dengan frasa fallback yang dikunci itu kalau data tidak cukup.
- JANGAN mengarang angka, harga, tanggal, atau status. Semua harus berasal dari hasil tool atau CONTEXT.
- Pertanyaan soal total, jumlah, sisa, atau rata-rata DIJAWAB dengan \`aggregate_records\` (op sum/count/avg): panggil tool itu, lalu tulis angka yang dikembalikannya apa adanya. Kalau belum tahu nama entity atau field-nya, panggil \`list_entities\` dulu.
- Jangan pakai frasa fallback selama masih ada tool yang bisa menjawab. Coba tool-nya dulu; fallback hanya kalau tool sudah dipanggil dan datanya memang tidak ada.
- Hasil tool masuk ke percakapan sebagai entri CONTEXT baru bernomor [n]. Itu sumber yang SAH dan setara dengan CONTEXT lain: kutip dengan [n]-nya, dan itu sudah cukup untuk confidence tinggi. Aturan “jawab hanya dari CONTEXT” di atas mencakup hasil tool — jadi jangan menganggap data dari tool sebagai “tidak ada di CONTEXT”.`;
}

/**
 * @param {'internal'|'chat'} mode
 * @param {string} [basePrompt] the composed persona prompt, required for
 *   chat mode so the auto-reply keeps its configured tone and its locked
 *   fallback wording.
 */
function buildSystemPrompt(mode = SCOPE_INTERNAL, basePrompt) {
  return mode === SCOPE_CHAT ? buildChatPrompt(basePrompt || '') : buildInternalPrompt();
}

/**
 * Highest `[n]` citation marker already present in the caller's CONTEXT, so
 * tool results can be numbered after it instead of colliding with it.
 */
function highestContextMarker(text) {
  let max = 0;
  const re = /\[(\d{1,3})\]/g;
  let m;
  while ((m = re.exec(String(text || '')))) max = Math.max(max, Number(m[1]));
  return max;
}

function parseModelJson(raw) {
  const cleaned = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const o = JSON.parse(cleaned);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return o;
  } catch (_) {
    // Some models prepend prose. Salvage the first balanced JSON object.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        const o = JSON.parse(cleaned.slice(start, end + 1));
        if (o && typeof o === 'object' && !Array.isArray(o)) return o;
      } catch (_) {
        /* fall through */
      }
    }
    return null;
  }
}

/**
 * Answer one internal question, calling read-only DB tools as needed.
 *
 * @param {object} opts
 * @param {string} opts.question
 * @param {Array<{role,content}>} [opts.history]
 * @param {object} opts.llm            the LLM gateway (injectable for tests)
 * @param {(evt:{name,input,resultCount,error?})=>void} [opts.onTool]
 *   called per tool invocation so a streaming caller can surface progress
 * @param {()=>boolean} [opts.isAborted]
 * @returns {Promise<{answer, grounded, toolCalls, rounds, sources}>}
 */
async function runInternalChat(opts) {
  const { question, history = [], llm, onTool, isAborted } = opts;
  const scope = opts.scope || { mode: SCOPE_INTERNAL };
  const mode = scope.mode === SCOPE_CHAT ? SCOPE_CHAT : SCOPE_INTERNAL;
  const systemPrompt = buildSystemPrompt(mode, opts.basePrompt);

  const transcript = [];
  // Chat mode wraps the customer persona prompt, and that prompt states four
  // separate times that the CONTEXT block is the ONLY admissible source and
  // that every fact needs a [n] citation into it. A tool result labelled
  // "Hasil:" is therefore inadmissible by its own rules — observed: the model
  // called aggregate_records, got the right total, and still answered with the
  // locked fallback at low confidence in roughly one run out of three.
  // Numbering results as further CONTEXT entries makes those same rules work
  // FOR the tool data instead of against it.
  let contextNo = mode === SCOPE_CHAT ? highestContextMarker(opts.extraContext) : 0;
  // Context the caller already assembled (retrieved chunks, running summary).
  // The auto-reply builds this before calling in, and it must stay visible
  // alongside anything the tools return.
  if (opts.extraContext) transcript.push(String(opts.extraContext));
  // Chat mode is talking to a CUSTOMER, not to staff. The internal framing
  // leaked through here from the shared loop.
  const askerLabel = mode === SCOPE_CHAT ? 'pelanggan' : 'staf';
  if (history.length) {
    transcript.push(
      `Percakapan sebelumnya:\n${history
        .slice(-10)
        .map((h) => `${h.role === 'user' ? (mode === SCOPE_CHAT ? 'Pelanggan' : 'Staf') : 'Anda'}: ${h.content}`)
        .join('\n')}`
    );
  }
  transcript.push(`Pertanyaan ${askerLabel}: ${question}`);

  const toolCalls = [];
  // Raw tool output, accumulated so a caller can ground against what the
  // model actually saw. The auto-reply validates every figure in its reply
  // against retrieved text; now that tools can return figures too, that
  // text must include them or a correct answer looks hallucinated.
  const groundingParts = [];
  let rounds = 0;

  while (rounds < MAX_ROUNDS + 1) {
    if (isAborted && isAborted()) {
      return { answer: '', grounded: false, toolCalls, rounds, aborted: true, sources: [], groundingText: '' };
    }

    const forceAnswer = rounds >= MAX_ROUNDS;
    const userPrompt = [
      transcript.join('\n\n'),
      forceAnswer
        ? '\nBatas panggilan tool tercapai. Jawab SEKARANG dengan {"action":"answer",...} memakai hasil yang sudah ada.'
        : '\nBalas dengan satu objek JSON: {"action":"tool",...} atau {"action":"answer",...}.',
    ].join('\n');

    const r = await llm.createChatCompletion({
      systemPrompt,
      userPrompt,
      jsonSchema: {
        name: 'internal_chat_step',
        schema: { type: 'object', additionalProperties: true },
      },
    });

    const step = parseModelJson(r && r.content);
    if (!step) {
      // Unparseable: treat the raw text as the answer rather than failing the
      // request. An operator would rather see a rough answer than an error.
      return {
        answer: String((r && r.content) || '').trim() || 'Model tidak mengembalikan jawaban.',
        grounded: false,
        toolCalls,
        rounds,
        sources: toolCalls.map((t) => t.name),
        groundingText: groundingParts.join('\n'),
        unparsed: true,
      };
    }

    if (step.action === 'answer' || (!step.action && step.answer)) {
      return {
        answer: String(step.answer || '').trim(),
        // Never trust the model's own `grounded` flag alone — if it called no
        // tool, nothing it said came from the database. Chat mode's answer
        // contract has no `grounded` field at all (it reports `confidence`
        // instead), so asking for one there always yielded false; there,
        // "a tool ran" IS the grounding signal.
        grounded: toolCalls.length > 0 && (mode === SCOPE_CHAT || Boolean(step.grounded)),
        // Chat mode carries the auto-reply's decision fields through so
        // trigger.js's confidence gate, fallback handoff and numerical
        // grounding check keep working unchanged.
        confidence: typeof step.confidence === 'number' ? step.confidence : undefined,
        fallback_used: typeof step.fallback_used === 'boolean' ? step.fallback_used : undefined,
        citations: Array.isArray(step.citations) ? step.citations : [],
        reasoning: typeof step.reasoning === 'string' ? step.reasoning : undefined,
        toolCalls,
        rounds,
        sources: Array.isArray(step.sources) ? step.sources : toolCalls.map((t) => t.name),
        groundingText: groundingParts.join('\n'),
      };
    }

    if (step.action === 'tool' && step.tool) {
      rounds += 1;
      const result = await runTool(step.tool, step.args, scope);
      const rowCount =
        (result && (result.rowCount ?? (result.entities ? result.entities.length : undefined))) ??
        (result && result.value !== undefined ? 1 : 0);
      const record = {
        name: step.tool,
        input: step.args || {},
        why: step.why || null,
        resultCount: Number.isFinite(rowCount) ? rowCount : 0,
        error: result && result.error ? result.error : null,
      };
      toolCalls.push(record);
      if (onTool) {
        try {
          onTool(record);
        } catch (_) {
          /* progress reporting must never break the run */
        }
      }
      logger.debug({ tool: step.tool, args: step.args, scope: mode }, 'ai tool call');
      const resultJson = JSON.stringify(result);
      groundingParts.push(resultJson);
      const shown = resultJson.slice(0, 4000);
      // The persona prompt keys on the <CONTEXT>…</CONTEXT> block: answer only
      // from it, cite every fact as [n] into it, otherwise use the locked
      // fallback. A tool result appended after that block, unnumbered, met
      // none of those conditions — observed: the model called
      // aggregate_records, got the right total, and sent the fallback anyway
      // in roughly two runs out of five. Emitting results in that same block
      // shape, numbered after the chunks already in it, is what makes them
      // admissible to the rules the prompt already enforces.
      transcript.push(
        mode === SCOPE_CHAT
          ? `Anda memanggil ${step.tool}(${JSON.stringify(step.args || {})}).\n` +
            `<CONTEXT>\n[${++contextNo}] hasil ${step.tool} atas data kontak ini: ${shown}\n</CONTEXT>`
          : `Anda memanggil ${step.tool}(${JSON.stringify(step.args || {})}).\nHasil:\n${shown}`
      );
      continue;
    }

    // Recognisable JSON but neither shape — nudge once, then the round cap
    // ends it.
    rounds += 1;
    transcript.push(
      'Balasan Anda bukan {"action":"tool"} maupun {"action":"answer"}. Ulangi dengan salah satu bentuk itu.'
    );
  }

  return {
    answer: 'Tidak berhasil menyusun jawaban dalam batas panggilan tool.',
    grounded: false,
    toolCalls,
    rounds,
    sources: toolCalls.map((t) => t.name),
    groundingText: groundingParts.join('\n'),
  };
}

module.exports = {
  runInternalChat,
  buildSystemPrompt,
  buildInternalPrompt,
  buildChatPrompt,
  parseModelJson,
  MAX_ROUNDS,
  ALLOW_GENERAL_KNOWLEDGE,
};
