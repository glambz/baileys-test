# Plan 09: AI Settings — TypeScript Types + Zustand Store + localStorage Persistence

**Goal**: Add the TypeScript interfaces (`AiSettings`, `AiIdentity`, `AiScope`, `AiWhatsappAutoReply`, `AiTone`, `AiLanguage`) and a Zustand slice (`useAiSettingsStore`) that persists to `localStorage` under the byte-locked key `'baileys-frontend:ai-settings'`. The slice is the single runtime entry point for every Plan 10/11/12/13/14 consumer.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- None (this is the root of the Round-2 chain).

## Micro-Tasks

1. **Define the TypeScript interfaces and locked defaults**
   - Create `frontend/src/types/aiSettings.ts` exporting:
     - `AiTone = 'formal' | 'casual' | 'friendly' | 'concise' | 'enthusiastic'` (byte-identical to `docs/tech/ai-settings-data-model.md` §1 and `docs/crm/features/ai-settings/spec.md` §4.2).
     - `AiLanguage = 'id' | 'en' | 'id-mod'` (byte-identical to the data model §1 and the settings spec §4.3; the third variant `'id-mod'` is new this cycle).
     - `AiIdentity`, `AiScope`, `AiWhatsappAutoReply`, `AiSettings` exactly as typed in `docs/tech/ai-settings-data-model.md` §1.
   - Export `DEFAULT_AI_SETTINGS: AiSettings` matching the byte-stable defaults table in the data model §4.1 (`name = 'Baileys Studio AI Assistant'`, `role = 'Agen CS WhatsApp'`, `tone = 'friendly'`, `language = 'id'`, `whatsappAutoReply.enabled = true`, `whatsappAutoReply.confidenceThreshold = 0.7`, `updatedAt = '2026-07-02T00:00:00.000Z'`).
   - **Acceptance**: `pnpm typecheck` passes; the literal unions and the `DEFAULT_AI_SETTINGS` object compile and are bitwise-equal to a snapshot test added in task 4.

2. **Build the Zustand slice with localStorage persistence**
   - Create `frontend/src/stores/useAiSettingsStore.ts` (TS) as a separate Zustand store — NOT merged into `useUiStore`.
   - Shape:
     ```ts
     interface AiSettingsState {
       settings: AiSettings;
       save: (next: AiSettings) => void;
       reset: () => void;
       hydrate: () => void;
     }
     ```
   - On store creation, attempt `localStorage.getItem('baileys-frontend:ai-settings')`; if the row is missing, malformed, or `version !== 1`, fall back to `DEFAULT_AI_SETTINGS`. The hydration is also exposed via `hydrate()` so the settings page can force a refresh after the first paint.
   - `save(next)` writes `{ version: 1, value: next }` to `localStorage` (JSON.stringify) and bumps `next.updatedAt` to `new Date().toISOString()` *before* persisting. If `localStorage.setItem` throws (quota / private mode), surface the error via the existing toast helper and keep the in-memory state — do not crash.
   - `reset()` clears the localStorage row and re-installs `DEFAULT_AI_SETTINGS`.
   - **Acceptance**: a unit test drives `save(...)` and asserts that `localStorage.getItem('baileys-frontend:ai-settings')` returns `{ "version": 1, "value": { ... } }` with the same `updatedAt` that the store now holds; `reset()` empties the key and resets `settings` to `DEFAULT_AI_SETTINGS`.

3. **Gate `pnpm typecheck` and a hydration smoke test**
   - The slice MUST be importable from `@/stores/useAiSettingsStore` and MUST NOT export any function that mutates `pane1Selection` or any other `useUiStore` field (separation of concerns with Plan 10).
   - The store MUST tolerate running in an environment without `localStorage` (jsdom test runner always has it; but defensive `typeof window !== 'undefined'` guards are required because Plan 10/11 may mount the store before hydration).
   - **Acceptance**: `pnpm typecheck` passes; an existing simple `__tests__/stores/useAiSettingsStore.test.ts` (new) with three cases — (a) initial state equals `DEFAULT_AI_SETTINGS`, (b) `save` round-trips through `localStorage`, (c) malformed JSON in localStorage triggers `DEFAULT_AI_SETTINGS` on next read — all green.

4. **Snapshot-test the byte-locked defaults**
   - Add `__tests__/types/aiSettings.test.ts` that imports `DEFAULT_AI_SETTINGS` and `assert.deepStrictEqual`s it against an inline literal (the literal is the same byte-stable values from §4.1). The test fails on any drift and locks the contract for Plan 11 (which constructs the form) and Plan 12 (which reads the tone/language).
   - **Acceptance**: `pnpm vitest run __tests__/types/aiSettings.test.ts` passes; running it twice is deterministic.

## Cross-References
- Data model + interfaces + defaults: `docs/tech/ai-settings-data-model.md` §1, §2, §4.1
- Product spec (form shape, persistence rules): `docs/crm/features/ai-settings/spec.md` §3, §4
- PRD UX-C1 / UX-S* (save + reset behavior): `docs/crm/features/ai-settings/prd.md` §5.3, §5.4
- localStorage key convention (future BE adapter slot): `docs/tech/ai-settings-data-model.md` §5
- Existing Zustand store (read-only pattern reference): `frontend/src/stores/ui.ts`

## Notes
- The slice is a separate file (`useAiSettingsStore.ts`), NOT a slice of `useUiStore`. The existing `useUiStore` owns `pane1Selection`, `themeMode`, and the pane layout; the new store owns the AI domain. Plan 10 extends `useUiStore` separately.
- The localStorage key `'baileys-frontend:ai-settings'` is **byte-locked** (data model §2 row 4). Do not prefix, namespace, or rename it.
- The Indonesian fallback phrase is **not** part of `AiSettings` — Plan 12's prompt builder REFERENCES the constant from `frontend/src/i18n/id.json -> ai.fallback.message`, which is unchanged.
- `AiLanguage` is a three-value enum (`'id' | 'en' | 'id-mod'`). Plan 12's `buildSystemPrompt` still only switches on `'id' | 'en'` (the two existing cycle-9 prompts); `'id-mod'` is accepted at the type level and rendered into the per-tenant fragment ("Bahasa yang digunakan: id-mod.") so future cycles can extend the runtime without a type change.
- The store does not depend on Plan 10's navigation rail. It is safe to develop and review independently.