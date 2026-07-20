# Plan 07: AI Chat Page

**Goal**: Build the AI Chat page at `/ai-chat`: transcript (user bubbles right, AI bubbles left), composer with `Enter` submit, confidence badge with green/yellow/red color rule, collapsible evidence panel ("Lihat sumber"), and the byte-identical Indonesian fallback sentence with a "Mungkin yang Anda maksud:" suggestion card when `confidence < 0.65`.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (shadcn scaffold).
- Plan 02 (mock knowledge, `searchKnowledge`, types).
- Plan 03 (`AiChatPage` route placeholder).
- Plan 04 (`useAskAi`, interceptor, no-hallucination guard downgrades `confidence < 0.65`).
- Plan 05/06 (auth banner; shared layout; i18n keys from `frontend/src/i18n/id.json` — see Plan 08).

## Micro-Tasks

1. **Build `ConfidenceBadge`**
   - Create `frontend/src/components/ai/ConfidenceBadge.tsx` exporting `<ConfidenceBadge value={number} />` that renders a small pill whose color follows `docs/frontend/features/ai-chat/spec.md` §6 exactly:
     - `value >= 0.85` → `bg-emerald-100 text-emerald-900` (light) / `bg-emerald-900/30 text-emerald-200` (dark); label `"Tinggi"`; tooltip `"Tinggi — jawaban diambil dari sumber yang jelas."`.
     - `0.65 <= value < 0.85` → `bg-amber-100 text-amber-900` (light) / `bg-amber-900/30 text-amber-200` (dark); label `"Sedang"`; tooltip `"Sedang — jawaban diambil dari sumber yang relevan tetapi tidak identik."`.
     - `value < 0.65` → `bg-rose-100 text-rose-900` (light) / `bg-rose-900/30 text-rose-200` (dark); label `"Rendah"`; tooltip `"Rendah — tidak yakin; tampilkan fallback."`.
   - Expose `aria-label={`Keyakinan ${label}, skor ${value.toFixed(2)}`}` so screen readers read the value.
   - **Acceptance**: feeding `0.92` renders the green pill; `0.70` renders yellow; `0.40` renders red; tooltips appear on hover/focus.

2. **Build `EvidencePanel`**
   - Create `frontend/src/components/ai/EvidencePanel.tsx` rendering a collapsible shadcn `<Collapsible>` titled `"Lihat sumber"` (collapsed by default; toggle button shows `"Lihat sumber (N)"` where `N === evidence.length`).
   - When open, render one row per `Evidence` item with the format from `docs/frontend/features/ai-chat/spec.md` §9:
     - `[index]` counter starting at 1.
     - `entryId` as a small monospaced chip.
     - One-line `excerpt`, trimmed to ≤ 120 chars with ellipsis when longer.
     - `source` as plain text; when `sourceUrl` is present, a small lucide `ExternalLink` icon opens it in a new tab (`target="_blank" rel="noopener noreferrer"`).
   - The row is a single `<a>` (when `sourceUrl` is present) with the whole row clickable; otherwise a non-interactive `<div>`.
   - **Acceptance**: a `confidence === 0.92` AI answer renders the green badge and an evidence panel whose first row shows `[1] k-014 — "Paket Bulanan — Rp 4.500.000 / bulan, 12 posting + 1 campaign" Sumber: internal/pricing-2026Q3.md [↗]`; clicking the row opens the URL in a new tab.

3. **Build `Transcript` (user/AI/fallback bubbles)**
   - Create `frontend/src/components/ai/Transcript.tsx` that holds the page-local transcript as `useState<Array<{ role: "user" | "ai"; payload: ... }>>`. The component renders:
     - **User question bubble** → right-aligned, primary background, body is the question text.
     - **AI answered bubble** → left-aligned, muted background, body is the answer, followed by a `<ConfidenceBadge value={payload.confidence} />` and a `<EvidencePanel evidence={payload.evidence} />`.
     - **AI fallback bubble** → left-aligned, `bg-muted/50`, body is the **byte-identical** `payload.message` (the Indonesian fallback sentence from `docs/frontend/features/ai-chat/spec.md` §8), no badge. When `payload.suggestion` is present, render below the bubble a `<Card>` titled `"Mungkin yang Anda maksud:"` whose body shows `suggestion.question` and a small `"Lihat sumber"` link to `KnowledgeEntry.sourceUrl` (when present, fetched from the seeded knowledge by `entryId`). When `suggestion` is absent, render the bubble alone.
   - The transcript is in-memory only; refresh clears it (per `docs/frontend/features/ai-chat/spec.md` §1).
   - **Acceptance**: submitting `"Berapa harga paket Bulanan?"` appends a user bubble and an AI answered bubble with the green badge and an evidence panel; submitting `"asdfgh qwerty nonsense 12345"` appends a user bubble and the fallback bubble containing **exactly** the Indonesian sentence from §8, with a suggestion card (because the seeded knowledge has some low-similarity entries that still rank highest).

4. **Build `AiComposer` and wire `useAskAi`**
   - Create `frontend/src/components/ai/AiComposer.tsx` (single-line `<Textarea>` that grows to 6 rows + a `<Button>` labeled `"Tanya"`). Submitting calls `useAskAi().mutate({ question, topK: 3 })` and appends the result to the transcript in step 3.
   - While `mutation.isPending` the composer is disabled and shows an ellipsis bubble below the user question (the skeleton from `docs/frontend/features/ai-chat/spec.md` §10.2).
   - On error: `error.code === "ValidationError"` → inline red message under the composer; otherwise a sonner toast with the error message. The transcript is untouched on error.
   - Keyboard: `Enter` submits, `Shift+Enter` inserts a newline, `Esc` clears the composer.
   - **Acceptance**: pressing Enter on the seeded pricing question produces the green-badge answer within ~50 ms; pressing Enter on nonsense produces the fallback sentence and (when a suggestion is available) the suggestion card.

5. **Wire the page: welcome card, example chips, transcript, composer**
   - Replace `frontend/src/pages/AiChatPage.tsx` so it renders a `max-w-720px mx-auto` column with:
     - A welcome `<Card>` (only when `transcript.length === 0`) showing the title `"Tanya AI"` and three clickable chips that fill the composer when clicked (e.g. `"Berapa harga paket Bulanan?"`, `"Bagaimana cara tambah campaign dadakan?"`, `"Kapan jadwal posting Mingguan?"`). The chip bodies must match the seeded `KnowledgeEntry.question`s so they reliably produce answered results.
     - Below the welcome card (or below the existing transcript) the `<AiComposer />` is sticky.
   - Above the transcript, a small `<p className="text-xs text-muted-foreground">` showing `"Ambang keyakinan: 0.65"` so the operator can audit the threshold at a glance (matches `docs/frontend/general/MODULE_OVERVIEW.md` §8).
   - **Acceptance**: opening `/ai-chat` with empty state shows the welcome card; clicking a chip autofills the composer; pressing Enter produces the matched answer; submitting `"asdfgh qwerty"` shows the fallback sentence and the suggestion card.

6. **No-hallucination guard verification**
   - Add a temporary dev probe (gated by `import.meta.env.DEV`) that calls `useAskAi()` directly with a known-bad question and asserts the response is `kind === "fallback"`. Remove the probe before commit (or keep it as a Vitest fixture in a future plan).
   - Run `pnpm lint`, `pnpm typecheck`, `pnpm build`; all must pass.
   - **Acceptance**: a manual `pnpm exec ripgrep` over `frontend/src/components/ai/Transcript.tsx` and `useAskAi.ts` shows the fallback `message` string appears **exactly once** and is sourced from a constant exported by `frontend/src/lib/ai/fallbackMessage.ts` (which holds the byte-identical sentence). No other file may contain the literal fallback string.

## Cross-References
- Spec: `docs/frontend/features/ai-chat/spec.md` §1 (transcript/composer/evidence), §3 (data flow — `useAskAi`), §4 (threshold `0.65`), §5 (send behavior, non-streaming decision), §6 (badge color rule), §7 (no-hallucination guard — also enforced in Plan 04's `useAskAi`), §8 (byte-identical fallback sentence), §9 (evidence row format), §10 (state machine).
- PRD: `docs/frontend/features/ai-chat/prd.md` §4 (US-1…US-6), §5 (UX), §6 (byte-identical sentence), §7 (keyboard), §8 (A1–A6 acceptance).
- Data shapes: `docs/tech/chat-data-model.md` §2.4 (`KnowledgeEntry`), §2.5 (`AiAnswer`), §2.7 (`Evidence`), §2.8 (`FallbackAiAnswer`), §2.6 (`ConfidenceScore`).
- API: `docs/frontend/api/api-spec.md` §2.4 (request/response, byte-identical fallback `message`).
- Module overview: `docs/frontend/general/MODULE_OVERVIEW.md` §8 (module-wide threshold).

## Notes
- The fallback sentence lives in **exactly one** place: `frontend/src/lib/ai/fallbackMessage.ts`. Every other file imports it. This makes accidental edits to the wording impossible.
- Do **not** stream responses — the spec §5 fixes non-streaming for Phase 2.
- The `ConfidenceBadge` color tokens must come from Tailwind's `emerald/amber/rose` palettes, not arbitrary hex values. This keeps the dark/light parity automatic.
- The suggestion card's "Lihat entri" button is **hidden** in this phase per `docs/frontend/features/ai-chat/spec.md` §8 (no detail page yet); only the "Lihat sumber" link is rendered.
- The page must **not** import anything from `frontend/src/mock/*` directly — it consumes only `useAskAi()`. This keeps the future backend swap mechanical.