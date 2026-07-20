# Plan 11: AI Settings Page + Form (Seven Cards)

**Goal**: Build the `AiSettingsPage.tsx` (TSX) at `/ai-settings`. The page renders seven form cards in fixed order — Identity, Tone, Language, Scope, Rules, WhatsApp Auto-reply, Hardened (read-only) — plus a Save button and a Reset-to-defaults button (each behind a confirmation `<Dialog>`). The page reads and writes through `useAiSettingsStore` from Plan 09 and uses the toast helper for the success notification.
**Owner**: @frontend-dev
**Created**: 2026-07-02

## Status
- [x] `done`

## Dependencies
- Plan 09 (`09-ai-settings-types-and-store.md`) — the page imports `useAiSettingsStore` and the TS types.
- Plan 10 (`10-nav-rail-and-route-add-settings.md`) — the route and the rail item must exist before the page is reachable.

## Micro-Tasks

1. **Build the page shell + hydration**
   - Create `frontend/src/pages/AiSettingsPage.tsx` (TSX) as a default export. The component:
     - Calls `useAiSettingsStore.getState().hydrate()` on mount (idempotent).
     - Subscribes to `useAiSettingsStore((s) => s.settings)` for render.
     - Maintains a local `draft: AiSettings` via `useState(initialisedFromStore)`; the draft is reset to the store value on every successful save (Plan 09's `save()` bumps `updatedAt`, so the reset is mechanical).
     - Renders a header with `<h1>AI Settings</h1>` and the subtitle `Sesuaikan identitas, nada, bahasa, cakupan, aturan, dan perilaku auto-reply WhatsApp AI tenant ini.`
   - **Acceptance**: visiting `/ai-settings` after Plans 09 + 10 render the page with no console errors; refreshing the page after a save re-hydrates the draft from localStorage (verified via the next task); `pnpm typecheck` passes.

2. **Build the seven form cards**
   - Render cards in this exact order (PRD UX-F1):
     1. **Identity** — three `<Input>` fields (`Nama` ≤ 80 chars, `Peran` ≤ 120 chars, `Deskripsi` optional ≤ 500 chars). Inline error if a max length is exceeded; Save is disabled while any error is present.
     2. **Tone** — `<Select>` with options `Formal`, `Santai`, `Ramah`, `Ringkas`, `Antusias` mapping to `AiTone` values `formal | casual | friendly | concise | enthusiastic`. Labels are byte-identical per PRD UX-F4.
     3. **Language** — `<Select>` with options `Indonesia`, `English`, `Modern Indonesia` mapping to `AiLanguage` values `id | en | id-mod`. Labels are byte-identical per PRD UX-F3.
     4. **Scope** — two `<Textarea>` fields (`Topik` and `Topik yang dikecualikan`). On Save, the textarea is split on `\n`, trimmed, and empty lines are dropped before being stored on `scope.topics` / `scope.excludedTopics`.
     5. **Rules** — a single `<Textarea>` (`Aturan tambahan`); on Save the same newline-split logic produces `rules: string[]`.
     6. **WhatsApp Auto-reply** — a `<Switch>` bound to `whatsappAutoReply.enabled` plus a numeric `<Input type="number" step="0.05" min="0.5" max="0.95">` for `whatsappAutoReply.confidenceThreshold`. The error rule: any value outside `[0.50, 0.95]` (or a step that does not match `0.05`) renders an inline error and disables Save. `0.7` is the default.
     7. **Hardened (read-only)** — a `<Card>` with a `<Lock />` icon on the right of the title row. Renders the four Bahasa Indonesia lines from `getHardenedRulesBlock()` (Plan 12) as a numbered list. The note text below the list reads exactly `"Aturan ini dikunci demi keamanan data tenant dan tidak dapat diubah."` (PRD UX-F6 byte-identical).
   - **Acceptance**: each card renders, all fields are controlled, the inline-error rule disables Save; `pnpm typecheck` passes; `pnpm vitest run __tests__/pages/AiSettingsPage.test.tsx` (new) renders the page in jsdom and asserts the seven card titles + the three language labels + the five tone labels exist in the DOM.

3. **Save / Reset / toast flow**
   - **Save**: a primary `<Button>` `Simpan pengaturan` at the bottom-right of the page. Click calls `useAiSettingsStore.getState().save(draft)`; on success the existing toast helper renders `Pengaturan AI disimpan` for 4 seconds (PRD UX-S2). The Save button is disabled while `!isValid(draft)`.
   - **Reset**: a secondary `<Button variant="secondary">` `Reset ke default`. Click opens a `<Dialog>` titled `Yakin reset ke pengaturan awal?` with two buttons `Reset` (destructive) and `Batal`. The `Reset` button calls `useAiSettingsStore.getState().reset()` and dismisses the dialog.
   - **Acceptance**: clicking Save with a valid draft updates `localStorage` (verified via a jsdom spy on `localStorage.setItem`); the toast appears for ~4 s; clicking Reset opens the dialog, clicking `Batal` dismisses without resetting, clicking `Reset` empties the `baileys-frontend:ai-settings` key and re-renders the page with `DEFAULT_AI_SETTINGS`; `pnpm typecheck` passes.

4. **Persistence round-trip test (T-owned step inside this plan)**
   - The Plan-09 store and this page MUST round-trip cleanly: `save({ ...draft, identity: { ...draft.identity, name: 'Acme Helper' } })` followed by a page reload MUST re-hydrate the form with `name = 'Acme Helper'` and `updatedAt` from the save call. The test lives in `__tests__/pages/AiSettingsPage.persistence.test.tsx`.
   - **Acceptance**: the test passes; no `localStorage` key other than `'baileys-frontend:ai-settings'` is touched by this page.

## Cross-References
- Form contracts (cards + labels + limits): `docs/crm/features/ai-settings/spec.md` §4
- PRD UX-* (menu placement, labels, save/reset, cross-page): `docs/crm/features/ai-settings/prd.md` §5
- Hardened rules byte-stable text: `docs/tech/ai-settings-data-model.md` §3
- Default values: `docs/tech/ai-settings-data-model.md` §4.1
- Confidence threshold range / step: `docs/tech/crm-data-model.md` §3 (`0.7` default)
- Store: `frontend/src/stores/useAiSettingsStore.ts` (from Plan 09)
- Reused UI primitives (read-only): `frontend/src/components/ui/{Button,Input,Textarea,Select,Switch,Card,Dialog}.tsx`
- Existing toast helper (read-only): `frontend/src/components/feedback/Toast.tsx` (or the project-wide toast convention)

## Notes
- The seven cards render in the exact order PRD UX-F1 lists. Re-ordering is a spec change and requires an SSoT patch through the PM.
- The locked Indonesian fallback phrase (`Maaf, saya tidak memiliki informasi …`) is **not** edited in this plan and **not** added to `frontend/src/i18n/id.json`. The prompt builder (Plan 12) references the existing `ai.fallback.message` constant — no i18n change is required for this feature to ship.
- The WhatsApp-scope `contact_id` hard filter is a **separate defense-in-depth layer** enforced by the WhatsApp auto-reply pipeline (`docs/crm/features/ai-autoreply/spec.md` §5 table). It is NOT rendered as an input on this page; the **Hardened rules card** (task 2 item 7) lists it as line 1 of `getHardenedRulesBlock()` for the operator's audit visibility. Plan 13 must NOT regress the filter — this is a hard cross-plan constraint.
- The Hardened card uses `<Lock />` from `lucide-react`; do not invent a new icon.
- The page is **single-tenant** this cycle (PRD §6); no tenant-selector control is added.
- Save is the only persistence path — no autosave. PRD UX-S1 is a hard requirement.