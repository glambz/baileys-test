# Plan 12: System Prompt Templating — Refactor `systemPrompt.ts`

**Goal**: Refactor `frontend/src/lib/ai/systemPrompt.ts` to add `buildSystemPromptFragment(settings)` and `getHardenedRulesBlock()`, and update `buildSystemPrompt(opts)` so it composes **base prompt + per-tenant fragment + hardened block**. The cycle-9 base prompts (`BAILEYS_AI_SYSTEM_PROMPT_ID` / `_EN`) and the cycle-9 self-test (17 specs in `__tests__/systemPrompt.test.ts`) MUST continue to pass byte-identical. The same file gains new tests covering the composed prompt + the user fragment + the hardened block.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- Plan 09 (`09-ai-settings-types-and-store.md`) — Plan 12 imports the `AiSettings` interface from `frontend/src/types/aiSettings.ts`. It does NOT need Plan 10 (no nav/route change) or Plan 11 (no form change).

## Micro-Tasks

1. **Add `getHardenedRulesBlock()` with a vitest snapshot**
   - In `frontend/src/lib/ai/systemPrompt.ts`, add a new named export:
     ```ts
     export function getHardenedRulesBlock(): string { /* see data model §3.2 */ }
     ```
   - The returned string is **byte-exact** to the four-line block in `docs/tech/ai-settings-data-model.md` §3.2 — no leading/trailing whitespace, no trailing newline, four items joined by single newlines. The four lines are the canonical ordering:
     1. WhatsApp `contact_id` filter
     2. WhatsApp data source restriction (chat's contact + KB only)
     3. Dashboard `/ai` full-data scope
     4. AI writes only to CRM (never to KB)
   - Add `__tests__/getHardenedRulesBlock.test.ts` with at minimum:
     - One assertion that the return value equals a hard-coded inline literal (the same four lines from the data model).
     - One assertion that two consecutive calls return the same string (idempotent).
     - One assertion that the four lines appear in the canonical order (line 1 contains `contact_id`, line 3 contains `/ai`, line 4 contains `TIDAK BOLEH menulis ke knowledge DB`).
   - **Acceptance**: `pnpm vitest run __tests__/getHardenedRulesBlock.test.ts` is green; the same string appears in this file and in `docs/crm/features/ai-settings/spec.md` §4.7 (the read-only card in Plan 11) — the two are grep-equal.

2. **Add `buildSystemPromptFragment(settings)`**
   - In the same file, add:
     ```ts
     import type { AiSettings } from '@/types/aiSettings';
     export function buildSystemPromptFragment(settings: AiSettings): string;
     ```
   - The implementation emits a Markdown block per the sketch in `docs/tech/ai-settings-data-model.md` §4.2:
     - `# Pengaturan tenant` heading.
     - `## Identitas` section with `Anda adalah <name> — <role>.` and the description on the next line if non-empty.
     - `## Suara & nada` section with one bullet describing the chosen `tone`.
     - `## Bahasa` section reading `Bahasa yang digunakan: <id|en|id-mod>.`
     - `## Topik yang dibahas` section with one bullet per `scope.topics` entry. OMIT the section entirely if `scope.topics.length === 0`.
     - `## Topik yang dikecualikan` section with one bullet per `scope.excludedTopics` entry. OMIT if empty.
     - `## Aturan tambahan` numbered list with one item per `rules` entry. OMIT if empty.
   - The fragment does NOT contain the four hardened rules. The fragment does NOT contain `whatsappAutoReply.*` values. The fragment does NOT contain the Indonesian fallback phrase (the prompt builder references the constant from `frontend/src/i18n/id.json -> ai.fallback.message`, unchanged).
   - **Acceptance**: the function is exported and importable; an empty `AiSettings` (all fields at their defaults except `rules = []` and both `scope.* = []`) returns a fragment with the Identitas / Suara & nada / Bahasa sections and NO `Topik` / `Aturan tambahan` sections; `pnpm typecheck` passes.

3. **Refactor `buildSystemPrompt(opts)` to compose three blocks**
   - Update the existing `BuildSystemPromptOptions` interface to add an optional `settings?: AiSettings` field (default `undefined`).
   - Update `buildSystemPrompt` so the composed output is:
     ```
     <base prompt>           // BAILEYS_AI_SYSTEM_PROMPT_{ID|EN} with {{tenantName}} interpolated
     <per-tenant fragment>    // buildSystemPromptFragment(settings) — empty string if settings is undefined
     <hardened block>         // getHardenedRulesBlock()
     ```
     The three blocks are joined by a single `\n\n` separator. The block ordering is **never** re-ordered by callers — it is mechanically checkable by grepping for `getHardenedRulesBlock()` in the codebase.
   - The function still accepts `language: 'id' | 'en'` (cycle-9 union, unchanged). When `settings?.language === 'id-mod'`, the function still emits the Indonesian base prompt but the per-tenant fragment's `## Bahasa` line reads `Bahasa yang digunakan: id-mod.` (PRD UX-F3 / data model §4.2). The base prompt itself is NOT translated; `'id-mod'` is a presentation-only flag at the fragment level for this cycle.
   - **Acceptance**: the 17 existing specs in `__tests__/systemPrompt.test.ts` continue to pass byte-identical (none of them pass `settings`, so they exercise the cycle-9 base path); `pnpm vitest run __tests__/systemPrompt.test.ts` reports `17 passed`; `pnpm typecheck` passes.

4. **Extend the self-test with composed-prompt assertions**
   - Add new specs to `__tests__/systemPrompt.test.ts` (the cycle-9 file, NOT a new file — keeps the existing test discovery intact):
     - `buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS })` returns a string whose suffix ends with the four hardened rules block (matches `getHardenedRulesBlock()` byte-exactly after the trailing `\n\n`).
     - `buildSystemPrompt({ settings: { ...DEFAULT_AI_SETTINGS, identity: { name: 'Acme Helper', role: 'CS Agent', description: '...' } } })` returns a string containing `Acme Helper` and `CS Agent` (the per-tenant fragment is appended after the base and before the hardened block).
     - `buildSystemPrompt({ settings: { ...DEFAULT_AI_SETTINGS, tone: 'formal' } })` returns a fragment whose `## Suara & nada` section describes `formal` semantics (one bullet). The base prompt's `## Suara & nada` section is unchanged byte-identical (the new fragment is a SEPARATE block).
     - `buildSystemPrompt({ settings: { ...DEFAULT_AI_SETTINGS, language: 'id-mod' } })` returns a string containing `Bahasa yang digunakan: id-mod.` (per data model §4.2).
     - Calling `buildSystemPrompt` with `settings: undefined` returns the cycle-9 base prompt only (no hardened block suffix, no fragment). This guards the legacy callers — the WhatsApp auto-reply pipeline (Plan 13) opts in to the composed output by passing `settings` explicitly.
   - **Acceptance**: `pnpm vitest run __tests__/systemPrompt.test.ts` reports `17 passed` (the cycle-9 specs) AND the new specs all pass; total spec count goes from 17 to ≥ 22.

## Cross-References
- Hardened rules byte-stable text: `docs/tech/ai-settings-data-model.md` §3
- Per-tenant fragment shape: `docs/tech/ai-settings-data-model.md` §4.2, §4.3
- `AiSettings` interface (consumer): `frontend/src/types/aiSettings.ts` (from Plan 09)
- Cycle-9 base prompts: `frontend/src/lib/ai/systemPrompt.ts` lines defining `BAILEYS_AI_SYSTEM_PROMPT_ID` / `_EN`
- Cycle-9 self-test (must keep passing): `frontend/__tests__/systemPrompt.test.ts`
- Indonesian fallback phrase (referenced, not inlined): `frontend/src/i18n/id.json -> ai.fallback.message`
- Locked value `0.7`: `docs/tech/crm-data-model.md` §3
- Locked value `contact_id` substring: `docs/tech/chat-data-model.md` §2.6 + `docs/crm/features/ai-autoreply/spec.md` §5

## Notes
- The four hardened rules are **locked text** and are byte-stable across the data model spec, the settings form (Plan 11 read-only card), and `getHardenedRulesBlock()` (this plan). Drift between any two is a hard blocker — the vitest snapshot in task 1 enforces byte-equivalence to the inline literal.
- The cycle-9 self-test MUST keep passing after the refactor. The 17 specs exercise the base prompt path (no `settings` argument). The refactor MUST NOT change the cycle-9 base prompt text byte-for-byte; only the new `buildSystemPromptFragment` and `getHardenedRulesBlock` are appended.
- The locked Indonesian fallback phrase (`Maaf, saya tidak memiliki informasi …`) is **not** inlined into `systemPrompt.ts`. The cycle-9 base prompt already embeds it once; the per-tenant fragment does not duplicate it. The prompt builder **references** `frontend/src/i18n/id.json -> ai.fallback.message` only when it needs to programmatically render the fallback (the runtime path is unchanged from cycle-9).
- `'id-mod'` is a third `AiLanguage` value (data model §1). This plan does NOT add a third base prompt — the runtime still emits the Indonesian base when `settings.language === 'id-mod'` and the fragment carries the presentation flag. Future cycles may add a `BAILEYS_AI_SYSTEM_PROMPT_ID_MOD`; this plan leaves the hook but does not implement it.
- The hardened block is ALWAYS appended (per task 3). The WhatsApp-scope `contact_id` filter is a **defense-in-depth layer** in the runtime (Plan 13); the hardened block duplicates the rule in the prompt so the LLM is also told. Plan 13 must NOT regress the runtime filter — both layers must coexist.
- The function name `buildSystemPrompt` is preserved (no rename). The signature change is purely additive: `settings?: AiSettings`. All cycle-9 call sites stay green.