# Plan 16: Settings Store + Composer (Byte-Equal Mirror) + Hardened Rules + Defaults + Zod

**Goal**: Ship `src/ai/settings/{store,composer,hardened-rules,defaults,schema}.js` — the BE-side settings persistence layer plus a system-prompt composer that is **byte-for-byte identical** to `frontend/src/lib/ai/systemPrompt.ts::buildSystemPrompt({ settings, tenantName, language })`. The composer must pass Plan 23's `composer-byte-identity.test.js` against the FE's own vitest fixtures.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- _(none — composer has no runtime dependency on the DB; `store.js` is consumed by later plans but its contract is stable here.)_

## Micro-Tasks

1. **Author `src/ai/settings/defaults.js` (`DEFAULT_AI_SETTINGS`)**
   - Export `DEFAULT_AI_SETTINGS` as a frozen `Object.freeze({...})` whose shape mirrors `frontend/src/stores/aiSettingsStore.ts::DEFAULT_AI_SETTINGS` field-for-field: `identity: { name, role, description }`, `tone: 'formal'|'casual'|'friendly'|'concise'|'enthusiastic'`, `language: 'id'|'en'|'id-mod'`, `scope: { topics: [], excludedTopics: [] }`, `rules: []`, `whatsappAutoReply: { enabled: false, confidenceThreshold: 0.7 }`.
   - The default `confidenceThreshold` is `0.7` (CRM/RAG threshold from `docs/tech/crm-data-model.md` §3) — distinct from the legacy WhatsApp module's `0.65`.
   - `enabled: false` default matches MVP.md §8 risk mitigation ("operators enable manually after testing via `reply-preview`").
   - **Acceptance**: importing `DEFAULT_AI_SETTINGS` from two test files returns reference-equal (`Object.is`) frozen objects; a vitest spec asserts every required field is present with the exact locked value `0.7`.

2. **Author `src/ai/settings/schema.js` (zod schema)**
   - Export `AiSettingsSchema = z.object({...})` with the same shape as `DEFAULT_AI_SETTINGS`. Use `z.enum(['formal','casual','friendly','concise','enthusiastic'])` for `tone`, `z.enum(['id','en','id-mod'])` for `language`, `z.object({ enabled: z.boolean(), confidenceThreshold: z.number().min(0.5).max(0.95).multipleOf(0.05) })` for `whatsappAutoReply`.
   - Export `PartialAiSettingsSchema = AiSettingsSchema.partial().deepPartial()` for the PATCH endpoint in Plan 21.
   - Use the same `@hapi/iron`-style error messages as `frontend/src/types/aiSettings.ts` (so FE↔BE error strings round-trip identically when the future wiring lands).
   - **Acceptance**: `AiSettingsSchema.parse(DEFAULT_AI_SETTINGS)` succeeds; a payload with `confidenceThreshold: 0.7` succeeds; a payload with `confidenceThreshold: 0.71` fails with a clear "multipleOf 0.05" message.

3. **Author `src/ai/settings/hardened-rules.js` (byte-stable 4-rule block)**
   - Export `getHardenedRulesBlock(): string` that returns the exact four-line Indonesian block from `frontend/src/lib/ai/systemPrompt.ts::getHardenedRulesBlock` (introduced in Plan 12). The four lines, in canonical order, are:
     1. WhatsApp `contact_id` hard filter (defense-in-depth layer 6).
     2. WhatsApp data sources = chat's contact records + KB only (no cross-contact).
     3. Dashboard `/ai` full-data scope (team scope).
     4. AI writes ONLY to CRM, NEVER to KB (defense-in-depth layer 1 + structural).
   - The block is **byte-stable**: copy-pasted verbatim from the FE. No reformatting, no translation, no trim changes, no leading/trailing newline, four lines joined by single `\n`.
   - **Acceptance**: `expect(getHardenedRulesBlock()).toBe('<hardcoded 4-line literal>')` is a green spec; Plan 23's `composer-byte-identity.test.js` asserts BE output matches FE output byte-for-byte.

4. **Author `src/ai/settings/composer.js` (mirror of `buildSystemPrompt`)**
   - Export `buildSystemPrompt({ settings, tenantName, language, basePrompt }): string` that composes three blocks in this exact order, joined by a single `\n\n`:
     ```
     <basePrompt>             // passed in by caller (caller chooses ID/EN base)
     <per-tenant fragment>    // buildSystemPromptFragment(settings)
     <hardened block>         // getHardenedRulesBlock()
     ```
   - Export `buildSystemPromptFragment(settings: AiSettings): string` that emits a Markdown fragment per `docs/tech/ai-settings-data-model.md` §4.2: `# Pengaturan tenant` heading + `## Identitas` / `## Suara & nada` / `## Bahasa` / optional `## Topik yang dibahas` / optional `## Topik yang dikecualikan` / optional `## Aturan tambahan`. The fragment NEVER contains the four hardened rules. The fragment NEVER contains `whatsappAutoReply.*` values. The fragment NEVER inlines the Indonesian fallback phrase (it references the constant from `frontend/src/i18n/id.json -> ai.fallback.message`; for BE purposes, the constant is imported from `src/i18n/ai-fallback.js` which re-exports the same string).
   - The function uses the same language→base-prompt selection rule as the FE: `language === 'en'` picks `BAILEYS_AI_SYSTEM_PROMPT_EN`, otherwise (`'id'` or `'id-mod'`) picks `BAILEYS_AI_SYSTEM_PROMPT_ID`. The base prompts are read from `src/ai/llm/base-prompts.js` (a tiny module that exports the same two byte-stable literals as the FE).
   - **Acceptance**: `expect(buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, tenantName: 'Test', language: 'id', basePrompt: BAILEYS_AI_SYSTEM_PROMPT_ID })).toBe(<expected composed string>)` is a green spec — the expected string is generated by calling the FE's own `buildSystemPrompt` with identical inputs and saved as a fixture.

5. **Author `src/ai/llm/base-prompts.js` (byte-stable base prompts)**
   - Export `BAILEYS_AI_SYSTEM_PROMPT_ID` and `BAILEYS_AI_SYSTEM_PROMPT_EN` as frozen string constants. These are **byte-for-byte copies** of the corresponding FE constants in `frontend/src/lib/ai/systemPrompt.ts` (lines 1–N for ID, lines N+1–M for EN).
   - The constants include the `{{tenantName}}` interpolation slot that the FE interpolates at runtime; the BE `composer.js` substitutes the same slot via `String.prototype.replace('{{tenantName}}', tenantName)`.
   - **Acceptance**: a vitest spec loads the FE's `systemPrompt.ts` file at test time, extracts the two constants via a regex, and asserts BE's exported constants equal the FE's byte-for-byte (or, if the FE source is unavailable in CI, asserts against a checked-in copy of the constants).

6. **Author `src/ai/settings/store.js` (Postgres-backed CRUD)**
   - Export `getSettings(): Promise<AiSettings>`, `updateSettings(patch: Partial<AiSettings>): Promise<AiSettings>`, `resetSettings(): Promise<AiSettings>`.
   - For the MVP, all three read/write the single `ai_settings` row with `id = 1` (single-tenant). The `tenant_id` column is reserved for Phase 3 multi-tenant (see MVP.md §1 #2 and §7).
   - `updateSettings` validates the merged result with `AiSettingsSchema.parse(...)` before writing; on failure the function throws a typed `SettingsValidationError` (the controller in Plan 21 maps this to HTTP 400).
   - On `db:migrate`, the migration runner inserts a default row with `id = 1` and the JSON-serialized `DEFAULT_AI_SETTINGS` so `getSettings` works before the first PATCH.
   - **Acceptance**: a vitest spec seeds an `ai_settings` row, calls `getSettings`, asserts it returns the parsed shape; calling `updateSettings({ whatsappAutoReply: { enabled: true, confidenceThreshold: 0.75 } })` then `getSettings` returns the new value; calling `updateSettings` with an invalid `confidenceThreshold: 0.71` throws `SettingsValidationError`.

7. **Add cross-component test fixture `__fixtures__/systemPrompt/expected-id.txt` and `expected-en.txt`**
   - Commit two fixture files containing the exact strings the FE's `buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, tenantName: 'TestCo', language: 'id' })` and `_EN` produce.
   - The fixtures are generated **once** by running the FE's vitest suite in fixture-export mode and copying the result. They become the contract for Plan 23's `composer-byte-identity.test.js`.
   - **Acceptance**: the two fixture files exist, are non-empty, and are byte-equal to the FE's output (verified manually by the BE during plan authoring).

## Cross-References
- Composer invariants: `docs/be/MVP.md` §3.1 + §3.2 (byte-equivalence + hardened rules).
- `AiSettings` shape & default values: `docs/tech/ai-settings-data-model.md` §1, §4.
- Hardened rules text (source): `docs/tech/ai-settings-data-model.md` §3.2.
- Per-tenant fragment shape: `docs/tech/ai-settings-data-model.md` §4.2 + §4.3.
- Locked threshold `0.7`: `docs/tech/crm-data-model.md` §3 (distinct from the legacy WhatsApp `0.65`).
- FE composer (mirror source): `frontend/src/lib/ai/systemPrompt.ts` (Plan 12).
- FE settings store (mirror source): `frontend/src/stores/aiSettingsStore.ts` (Plan 09).
- FE zod schema (mirror source): `frontend/src/types/aiSettings.ts` (Plan 09).
- Locked Indonesian fallback phrase (referenced, never inlined): `frontend/src/i18n/id.json -> ai.fallback.message`.
- FE byte-identity test (mirrored in BE): `frontend/__tests__/systemPrompt.test.ts` (47 specs in cycle-9 + round-2).
- Plan 17 uses the composed prompt: `docs/crm/plans/17-llm-gateway.md`.

## Notes
- **BE composer byte-equal to FE composer.** This is the single most important invariant of the cycle. Plan 23's `composer-byte-identity.test.js` loads the FE source at test time (or the checked-in fixture) and asserts byte-equality. Any drift is a **blocker**.
- The four hardened rules are **never user-editable**. The BE composer appends them UNCONDITIONALLY regardless of `settings.rules`. They appear in `src/ai/settings/hardened-rules.js` and in `frontend/src/lib/ai/systemPrompt.ts::getHardenedRulesBlock` — both files contain the **same string literal**.
- `tenantName` defaults to `'TestCo'` in fixtures (matches the FE's test default). Real callers pass the tenant's display name.
- `'id-mod'` is a third `AiLanguage` value. The composer picks `BAILEYS_AI_SYSTEM_PROMPT_ID` as the base prompt (Indonesian) but the fragment's `## Bahasa` section reads `Bahasa yang digunakan: id-mod.` — identical behavior to Plan 12.
- The composer does NOT translate the base prompt based on `settings.language` beyond the `'id'/'en'` axis. The third value `'id-mod'` is a presentation-only flag at the fragment level for this cycle.
- `store.js` does NOT use the `chats` table — settings are global per tenant (single row). Plan 20's per-chat `ai_mode` is a separate column.
- The zod schema in `schema.js` and the TS interface in `frontend/src/types/aiSettings.ts` MUST be kept in sync. The `composer-byte-identity.test.js` is the backstop that catches drift (a TS interface change is silent, but a runtime behavior change trips the byte-identity test).
- All exports use named exports (no default). The FE convention.
- The FE `whatsappAutoReply.enabled = true` (UI default) vs BE `whatsappAutoReply.enabled = false` (runtime default) divergence is intentional and documented in `docs/tech/be-data-model.md` §3 (new row + per-surface default note) and `docs/crm/features/ai-settings/spec.md` §4.4 (end-of-section note).