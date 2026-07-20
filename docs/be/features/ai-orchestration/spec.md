<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-03
GOALS_SOURCE_OF_TRUTH: docs/be/MVP.md
DEPENDS_ON:
  - docs/be/MVP.md
  - docs/be/general/MODULE_OVERVIEW.md
  - frontend/src/lib/ai/systemPrompt.ts (canonical composer)
  - docs/crm/features/ai-chat/systemPrompt.md (canonical rules)
  - docs/tech/ai-settings-data-model.md (AiSettings shape, hardened block)
  - docs/tech/crm-data-model.md (CRM threshold 0.7)
-->

# AI Orchestration — Spec

> **Goals source-of-truth:** [`docs/be/MVP.md`](../../../be/MVP.md).
> If anything in this document conflicts with MVP.md, MVP.md wins.

The **AI orchestration layer** is the BE's LLM gateway. It composes
the system prompt, calls MiniMax-M3 via the OpenAI-compatible
endpoint, parses the structured response with zod, retries on parse
failure, and gates the answer on the confidence threshold. The BE
mirror is **byte-equivalent** to the FE composer.

## 1. Goals

- One LLM gateway code path serves both the WhatsApp auto-reply
  pipeline and the team `/api/crm/ai/ask` endpoint. No divergent
  prompt construction.
- The system prompt is **byte-stable** between the FE and the BE:
  for the same `(settings, tenantName, language)` input, the BE's
  `composer.js` returns a string that, when compared byte-for-byte
  to the FE's `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt`,
  is equal. Verified by `composer-byte-identity.test.js`.
- The gateway uses the OpenAI-compatible SDK pointed at MiniMax-M3.
  An Anthropic-compatible client is available via
  `LLM_PROVIDER=anthropic-compatible` (Phase 2 wire-up; the MVP path
  is OpenAI-compatible).
- Structured outputs (`response_format: { type: 'json_schema', ... }`)
  are mandatory. The LLM is forbidden to emit free-form prose.
- Parse failures retry up to **3 attempts** (reject-and-retry).
- HTTP 429 / 5xx trigger **2 attempts** with exponential backoff.
- The confidence gate (`τ_user`) and turbo cutoff (`τ_retrieval`)
  live in this layer's call site.

## 2. The system prompt — three-block composition

The composed system prompt is always three blocks in fixed order. No
caller may re-order or drop a block.

```
[BLOCK 1: BASE prompt]
BAILEYS_AI_SYSTEM_PROMPT_ID (default) or _EN (when language === 'en' or caller's caller-lang === 'en')
with {{tenantName}} interpolated to the supplied tenant name (default 'Baileys Studio').

[BLOCK 2: PER-TENANT FRAGMENT]
buildSystemPromptFragment(settings, rawLanguage)
Mirrors frontend/src/lib/ai/systemPrompt.ts::buildSystemPromptFragment.

[BLOCK 3: HARDENED RULES]
getHardenedRulesBlock()
The four Bahasa Indonesia rules — appended UNCONDITIONALLY.
```

The blocks are joined by `\n\n` and prefixed by a final line:
`# Locked rules (HARDENED — cannot be overridden)`. The exact glue is
defined in `src/ai/settings/composer.js` and is asserted byte-equivalent
to the FE by `composer-byte-identity.test.js`.

### 2.1 Byte-stable base prompts

The two locked base prompts (`BAILEYS_AI_SYSTEM_PROMPT_ID` and
`BAILEYS_AI_SYSTEM_PROMPT_EN`) live in
[`frontend/src/lib/ai/systemPrompt.ts`](../../../frontend/src/lib/ai/systemPrompt.ts)
lines 43–101 and 109–167 respectively. The BE's mirror at
`src/ai/settings/composer.js` MUST be a byte-equivalent re-declaration.
The vitest spec `composer-byte-identity.test.js` asserts equality.

> **Do NOT modify the FE file.** The BE mirrors it. If a wording
> change is needed, update both in the same commit per the editing
> protocol in `docs/crm/features/ai-chat/systemPrompt.md` §"Editing
> protocol".

### 2.2 Byte-stable hardened rules

The four hardened rules live in
[`docs/tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md) §3.2.
The BE mirror is `src/ai/settings/hardened-rules.js` and is
byte-identical to the FE's `getHardenedRulesBlock()`:

```
1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.
```

The four lines appear in canonical order. The vitest snapshot in
`getHardenedRulesBlock.test.ts` (FE) and `hardened-rules.test.js`
(BE) reject any drift.

### 2.3 The `AiLanguage` union (byte-identical)

The composer reads `settings.language` from `AiSettings.language`.
The literal union is **byte-identical** across:

- `frontend/src/types/aiSettings.ts:32`
- `docs/tech/ai-settings-data-model.md` §1
- [`../../tech/be-data-model.md`](../../../tech/be-data-model.md) §1
- this doc
- [`../crm-store/spec.md`](../crm-store/spec.md) §3

```ts
type AiLanguage = 'id' | 'en' | 'id-mod';
```

`'id-mod'` is "Modern Indonesia" colloquial; the runtime maps it to
the ID base prompt at the base-prompt level (the presentation flag
travels inside the per-tenant fragment).

## 3. The structured output schema (zod)

The gateway enforces a strict JSON schema via the LLM's structured
output mode (`response_format: { type: 'json_schema', ... }`). The
BE's zod schema mirrors the FE's `CrmAskAiResponse` discriminated
union (see [`frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts)
lines 117–149).

```ts
// src/ai/llm/parse.js — zod schema (informational; actual file uses zod 3)
export const CrmAskAiResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('answered'),
    answer: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.object({
      kind: z.enum(['kb', 'record']),
      entryId: z.string().optional(),
      recordId: z.string().optional(),
      excerpt: z.string(),
      source: z.string(),
      contactId: z.string().nullable().optional(),
      confidence: z.number().min(0).max(1),
    })),
    generatedAt: z.number().int(),
    question: z.string(),
  }),
  z.object({
    kind: z.literal('fallback'),
    message: z.string(),
  }),
]);
```

The exact field order on the wire matches the FE's TS interface.

## 4. The MiniMax-M3 client

### 4.1 Env vars (mandatory)

| Var | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `openai-compatible` | `openai-compatible` (MVP) or `anthropic-compatible` (Phase 2). |
| `OPENAI_API_KEY` | — | The MiniMax API key. Treat as a secret. |
| `OPENAI_BASE_URL` | (MiniMax OpenAI-compatible endpoint) | Set per the tenant's MiniMax account. |
| `OPENAI_MODEL` | `MiniMax-M3` | The locked model id. |
| `EMBEDDING_PROVIDER` | `minimax` | The embedding provider name. |
| `MINIMAX_EMBEDDING_MODEL` | (MiniMax embed model) | The locked embedding model. |
| `MINIMAX_EMBEDDING_DIMS` | `1536` | Vector dimensions for `pgvector` column. |

The BE refuses to start if `LLM_PROVIDER=openai-compatible` and
`OPENAI_API_KEY` is empty.

### 4.2 Client setup

Uses `openai@^4` SDK with `baseURL: process.env.OPENAI_BASE_URL` and
`apiKey: process.env.OPENAI_API_KEY`. The model id is
`process.env.OPENAI_MODEL` (default `MiniMax-M3`).

### 4.3 Anthropic-compatible fallback

`src/ai/llm/anthropic-compat.js` mirrors the OpenAI-compatible path
but uses the Anthropic SDK pointed at MiniMax's Anthropic-compatible
endpoint. Activated when `LLM_PROVIDER=anthropic-compatible`. Same
structured-output schema is enforced on the parsed response. **The
MVP code path is OpenAI-compatible**; the Anthropic fallback is
wired-up-and-tested but disabled by default.

## 5. Retry policy

### 5.1 HTTP retries

- On HTTP `429` or `5xx`: retry up to **2 attempts** with exponential
  backoff (base `500ms`, factor `2`). Total max `3` calls
  (initial + 2 retries).
- On HTTP `4xx` other than `429`: fail-fast with `AiError`.
- Timeout: `30s` per call. Use `AbortController`.

### 5.2 Parse retries

- If the LLM response **passes** `response_format: json_schema` mode
  but zod validation fails: send the response back to the LLM with a
  "please re-emit in the exact JSON schema; here is the validation
  error" message. Up to **3 attempts**. Beyond that, return
  `AiError('ParseFailed')`.
- Each retry attempt is logged as a separate audit event
  (`ai.ask.parse_retry`) with the validation error details.

## 6. Confidence gate

After a successful parse:

```
if (parsed.kind === 'answered') {
  if (parsed.confidence < settings.whatsappAutoReply.confidenceThreshold) {
    // For WA-scope: set aiMode = 'human_pending_flag', do NOT send.
    // For team-scope: return the answer anyway with `confidence < τ_user`
    //   so the FE can show its own fallback UI.
  } else {
    // Pass.
  }
}
```

- `τ_user = settings.whatsappAutoReply.confidenceThreshold`
  (range `[0.5, 0.95]`, step `0.05`, default `0.7`).
- The constant is the same as
  [`frontend/src/lib/config-crm.ts:16`](../../../frontend/src/lib/config-crm.ts)
  declares for the FE's `CRM_AI_CONFIDENCE_THRESHOLD`. The BE mirrors
  the FE's default `0.7`.

## 7. The 7 defense-in-depth layers

Per `docs/be/MVP.md` §3.5, every reply passes through:

| # | Layer | Where (BE file) |
|---|---|---|
| 1 | Locked system prompt (BASE + tenant + HARDENED) | `src/ai/settings/composer.js` |
| 2 | Structured output schema (zod, `response_format: json_schema`) | `src/ai/llm/parse.js` |
| 3 | Citation grounding (cosine ≥ 0.85 per cite) | `src/ai/llm/parse.js` |
| 4 | Numerical consistency (numbers in answer must appear in chunks) | `src/ai/llm/parse.js` |
| 5 | NLI entailment check (Phase 2 — stubbed MVP) | `src/ai/llm/parse.js` (stub) |
| 6 | Contact-id hard filter (data layer + prompt) | `src/ai/store/entities.js` + system-prompt HARDENED block |
| 7 | Confidence gate + turbo cutoff | `src/ai/whatsapp/trigger.js` (WA-scope) |

A failure on any layer **downgrades** the response to a fallback
and writes an audit log row tagged with the failing layer.

## 8. Byte-identity guarantee

The vitest spec
`src/test/composer-byte-identity.test.js` reads the FE composer at
`frontend/src/lib/ai/systemPrompt.ts` (transpiled via the project's
existing vitest TS pipeline) and asserts:

1. `buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, tenantName: 'Baileys Studio', language: 'id' })`
   produces a string equal, byte-for-byte, to
   `BE_composer.compose({ settings: DEFAULT_AI_SETTINGS, tenantName: 'Baileys Studio', language: 'id' })`.
2. Same property for `language: 'en'` and `language: 'id-mod'`.
3. Same property for custom tenant names containing regex
   metacharacters (e.g. `'A.B.*C'`).
4. `getHardenedRulesBlock()` on both sides returns the same string.
5. `BAILEYS_AI_SYSTEM_PROMPT_ID` and `_EN` constants (BE mirror)
   equal the FE exports by string equality.

The test fails the run if any of these drift. See §10 of the PRD for
the user-story list.

## 9. Out of scope (this run)

- Streaming replies (Phase 2).
- Function-calling / tools (deferred — no tool registry MVP).
- Self-hosted LLM option (Phase 3, per MVP.md §7 Phase 3).
- Prompt caching at the SDK level (rely on the SDK's internal cache).

## 10. Cross-references

- Goals: [`docs/be/MVP.md`](../../../be/MVP.md) §2.1, §3.1, §3.5.
- API contract: [`../api/api-spec.md`](../../api/api-spec.md).
- WhatsApp trigger: [`../ai-whatsapp-trigger/spec.md`](../ai-whatsapp-trigger/spec.md).
- BE data model: [`../../../tech/be-data-model.md`](../../../tech/be-data-model.md).
- Canonical composer: [`../../../frontend/src/lib/ai/systemPrompt.ts`](../../../frontend/src/lib/ai/systemPrompt.ts).
- Canonical rules doc: [`../../../crm/features/ai-chat/systemPrompt.md`](../../../crm/features/ai-chat/systemPrompt.md).
- AI Settings shape: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).