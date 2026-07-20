# Plan 13: AI Workspace Integration — `/ai` Reads Settings + Mock Honors Language

**Goal**: Wire the existing in-app `/ai` workspace (`AiWorkspacePage.tsx` from Plan 07) to read `useAiSettingsStore`. The `useAskAiTeam` hook passes the **composed** system prompt (`buildSystemPrompt({ settings })` from Plan 12) and the tenant settings into `POST /api/crm/ai/ask`. The mock interceptor (`frontend/src/mock/interceptor.ts` from Plan 02) honors the `language` field so a saved `'en'` setting makes the mock return English text.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- Plan 11 (`11-ai-settings-page-and-form.md`) — the form must exist so a saved setting can flow into `/ai`.
- Plan 12 (`12-system-prompt-templating.md`) — `buildSystemPrompt({ settings })` must be available so the hook can compose the prompt.

## Micro-Tasks

1. **`useAskAiTeam` reads the settings store and passes the composed prompt**
   - In `frontend/src/hooks/crm/useAskAiTeam.ts` (created by Plan 07), update the hook:
     - Subscribe to `useAiSettingsStore((s) => s.settings)` (NOT via `getState()` at call time — re-render on save).
     - Build the system prompt via `buildSystemPrompt({ tenantName: 'Baileys Studio', language: settings.language === 'en' ? 'en' : 'id', settings })` (the `'id-mod'` value falls into the `'id'` base prompt per Plan 12).
     - Send `POST /api/crm/ai/ask` with `{ question, systemPrompt, settings }` as the request body (the `systemPrompt` field is NEW; the mock handler in task 2 reads it). The existing `evidence[]` + `confidence` response shape is unchanged.
   - The hook's return type stays `{ answer, confidence, evidence[] }` so `AiWorkspacePage.tsx` is unchanged.
   - **Acceptance**: changing the language in the settings page and clicking Save, then asking a question on `/ai`, results in a request body whose `systemPrompt` ends with the four hardened rules byte-identical to `getHardenedRulesBlock()` and contains the per-tenant fragment from `buildSystemPromptFragment(settings)`; `pnpm typecheck` passes.

2. **Mock interceptor honors `language` and echoes the hardened rules block**
   - In `frontend/src/mock/interceptor.ts`, update the `POST /api/crm/ai/ask` handler:
     - Accept the new `systemPrompt` field (read it, do not validate it — the byte-stable content is locked at Plan 12).
     - When `body.settings.language === 'en'`, emit English answer text (e.g. `Here is what I found in your CRM data.`); when `'id'` or `'id-mod'`, emit Indonesian text (e.g. `Berikut yang saya temukan di data CRM Anda.`). The fallback sentence still uses the locked Indonesian phrase from `frontend/src/i18n/id.json -> ai.fallback.message` byte-identical (per data model §6 row 6) — but the mock may emit the English fallback `Sorry, I don't have confident enough information to answer that. Maybe you meant this: …` only when `language === 'en'` AND confidence is below the CRM/RAG threshold `0.7`.
     - The mock returns the `evidence[]` array unchanged from Plan 02 (Plan 02 already wires the seeded records).
     - The mock MUST echo a `systemPromptEcho` field in its response for tests to assert byte-equivalence. The echoed value equals the `systemPrompt` from the request.
   - **Acceptance**: in jsdom, with `localStorage.setItem('baileys-frontend:ai-settings', JSON.stringify({ version: 1, value: { ...DEFAULT_AI_SETTINGS, language: 'en' } }))`, asking a question on `/ai` results in an answer text starting with `Here is what I found in your CRM data.`; flipping to `language: 'id'` and refreshing renders the Indonesian text; `pnpm vitest run __tests__/mock/interceptor.crm-ai-ask.test.ts` (new) is green.

3. **Defense-in-depth: do NOT regress the WhatsApp-scope `contact_id` filter**
   - The `/ai` route is **team-scope** — no `contactId` is sent. The mock MUST NOT add one. This is the existing Plan-07 behavior; this plan does NOT change that.
   - Separately, the WhatsApp auto-reply pipeline (out of scope for this run) keeps its `contact_id` hard filter. The runtime filter is implemented at the pipeline level (the prompt carries `contact_id` as a substring AND the request handler filters `evidence` to the contact's records). Plan 13 does not touch the pipeline; it only touches the in-app `/ai` path.
   - The hardened rules block (Plan 12) duplicates the rule in the prompt so the LLM is told; this is the second of the two layers. Both layers must coexist after Plan 13.
   - **Acceptance**: an existing spec asserting that `useAskAiTeam` does NOT pass a `contactId` field to the request body still passes; a new spec asserting that `buildSystemPrompt({ settings }).includes('contact_id')` is `true` passes; `pnpm vitest run` reports no regression on Plan-07 tests.

4. **End-to-end persistence-flow test (T-owned, lives in this plan)**
   - In `__tests__/flows/ai-settings-to-ai-page.test.tsx`:
     - Render `AiSettingsPage` (from Plan 11), set `language` to `English`, click `Simpan pengaturan`.
     - Navigate to `/ai` (use the existing router from `frontend/src/router.tsx`).
     - Type a question and submit.
     - Assert that the mocked `POST /api/crm/ai/ask` request was made with a body whose `systemPrompt` includes the substring `Bahasa yang digunakan: en.` AND whose suffix equals `getHardenedRulesBlock()`.
     - Assert that the rendered answer text starts with `Here is what I found in your CRM data.`.
   - **Acceptance**: the test passes in jsdom; `pnpm typecheck` passes.

## Cross-References
- Composed prompt: `frontend/src/lib/ai/systemPrompt.ts` (refactored by Plan 12)
- Settings store: `frontend/src/stores/useAiSettingsStore.ts` (from Plan 09)
- Existing `/ai` page (read-only surface extended here): `frontend/src/pages/AiWorkspacePage.tsx`
- Existing team-scope hook (extended here): `frontend/src/hooks/crm/useAskAiTeam.ts`
- Mock layer: `frontend/src/mock/interceptor.ts` (from Plan 02)
- API contract (mock until BE lands): `docs/frontend/api/api-spec.md` §6 (`/api/crm/ai/ask`)
- Locked Indonesian fallback phrase: `frontend/src/i18n/id.json -> ai.fallback.message` (UNCHANGED this cycle; the prompt builder REFERENCES the constant, not inlines the text)
- Two-layer defense (prompt + runtime filter): `docs/crm/features/ai-autoreply/spec.md` §5 (table)
- PRD acceptance A6: `docs/crm/features/ai-settings/prd.md` §7

## Notes
- The locked Indonesian fallback phrase is **not** edited in `frontend/src/i18n/id.json` and is **not** duplicated inside `buildSystemPromptFragment`. The mock handler in this plan imports the existing constant and emits it byte-identical.
- The `/ai` page is the only consumer of `useAskAiTeam`; the WhatsApp auto-reply pipeline is unchanged this cycle (out of scope).
- `'id-mod'` is treated as `'id'` at the base-prompt level (Plan 12 note). The per-tenant fragment still carries `Bahasa yang digunakan: id-mod.` so the operator can audit it; the mock emits Indonesian answer text in that case (the same `'id'` branch).
- Plan 13 is the LAST plan that touches `useAskAiTeam` and `mock/interceptor.ts` for the AI Settings cycle. Plan 14 is a UI-only shortcut; it does NOT call the hook or the mock.
- The mock interceptor's `systemPromptEcho` field is a test affordance only; it is documented in the api-spec mock section (`docs/frontend/api/api-spec.md` §6) and stripped before any future real-backend swap.