# PRD — AI Chat

> Product Requirements Document for the AI Chat page (`/ai-chat`). Pairs
> with the technical feature spec in [`spec.md`](spec.md), the API
> contract in [`../../api/api-spec.md`](../../api/api-spec.md), and the
> knowledge-base shapes in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).

## 1. Problem

The operator owns a knowledge base (price lists, runbooks, FAQ answers)
that they currently `grep` through by hand. They want a natural-language
question box that:

1. Reads a question.
2. Pulls the **single best-matching entry** from the knowledge base.
3. Returns the entry's `answer` **only when** the retrieval is confident.
4. Otherwise, returns a clear fallback that **admits it doesn't know**
   instead of inventing something.

Hallucination is a deal-breaker: a confident wrong answer on a price or
a deadline is worse than no answer at all.

## 2. Goals

| # | Goal | Acceptance |
|---|---|---|
| G1 | Operator can ask a question in Indonesian and get a sourced answer. | Submitting "Berapa harga paket Bulanan?" yields the pricing entry plus its citation row. |
| G2 | When the system is not sure, it admits it and points at the closest match. | Submitting an off-topic question yields the fallback sentence + suggestion card. |
| G3 | The page surfaces evidence next to every answer. | The "Lihat sumber" panel lists the entry id, excerpt, and source URL. |
| G4 | The page never claims something the knowledge base cannot support. | No-hallucination guarantee, see [`spec.md`](spec.md) §7. |
| G5 | Confidence is visible, not hidden. | Every answer carries a green / yellow / red badge per the rule in [`spec.md`](spec.md) §6. |

## 3. Non-goals

- Multi-turn memory across page reloads (future enhancement).
- Source-document upload (out of scope).
- Any answer that the retrieval could not source (the no-hallucination
  guarantee forbids it).

## 4. Confidence threshold

The module-wide AI confidence threshold is **`0.65`**. Stated identically
in [`spec.md`](spec.md) §4, [`../../../docs/frontend/general/MODULE_OVERVIEW.md`](../../../docs/frontend/general/MODULE_OVERVIEW.md) §8, and
[`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).

Any top-1 confidence below this value triggers the fallback. Justification
lives in [`spec.md`](spec.md) §4.1 (hand-curated Indonesian retrieval set
with three visible confidence bands).

## 5. User stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| US-1 | operator | type a question and press Enter. | I can ask without leaving the page. |
| US-2 | operator | see a confidence badge on every answer. | I know how much to trust it. |
| US-3 | operator | click "Lihat sumber" on any answer. | I can verify the citation. |
| US-4 | operator | get a clear "I don't know" when the answer isn't in the base. | I don't get fooled by confident nonsense. |
| US-5 | operator | see the closest match suggested on a fallback. | I can rephrase or escalate. |
| US-6 | operator | use the page without typing: clickable example chips. | I can try it in one click. |

## 6. Fallback message (byte-identical)

When the system returns `kind: "fallback"`, the page displays this
sentence verbatim — declared here and repeated byte-identical in
[`spec.md`](spec.md) §8 and as the `message` field in
[`../../api/api-spec.md`](../../api/api-spec.md) §2.4:

```
Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …
```

No rewording is permitted in any locale, layout, or downstream doc.

## 7. UX requirements

- Single-column layout; max width 720 px; centered on the page.
- Composer at the bottom, sticky, single-line that grows to 6 rows.
- Welcome card on first paint with 3 clickable example questions.
- Color palette for badges: green (`emerald-100/900`), yellow
  (`amber-100/900`), red (`rose-100/900`) — see
  [`spec.md`](spec.md) §6.
- All copy in i18n JSON from day one (`frontend/src/i18n/id.json`),
  English placeholder (`en.json`) checked in but unused.
- Keyboard:
  - `Enter` submits the question.
  - `Shift+Enter` inserts a newline.
  - `Esc` clears the composer.
  - `/` focuses the composer.

## 8. Acceptance criteria (Phase 2 — mock)

| # | Criterion | Verified by |
|---|---|---|
| A1 | Submitting a question that matches a seeded `KnowledgeEntry` (e.g. pricing) returns `kind === "answered"` with `confidence >= 0.85`, a green badge, and a non-empty evidence list. | Manual review + the planned fixture `__tests__/askPricing.test.ts`. |
| A2 | Submitting an off-topic question returns `kind === "fallback"` with `confidence < 0.65`. The page renders **exactly** the sentence from §6. | Manual review + `__tests__/noHallucination.test.ts`. |
| A3 | The "Lihat sumber" panel reveals entry id, excerpt, and source URL per [`spec.md`](spec.md) §9. | Manual review. |
| A4 | Badge color follows the rule in [`spec.md`](spec.md) §6. | Manual review. |
| A5 | Disabled composer during the in-flight mutation. | Manual review. |
| A6 | The i18n JSON file contains the byte-identical fallback string under key `ai.fallback.message`. | Grep in CI (planned). |

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Threshold `0.65` is wrong for the real corpus. | Threshold lives in one config file (`frontend/src/config/ai.ts`); the unit-test suite in [`spec.md`](spec.md) §4.1 must be rerun on the real corpus before launch. |
| Future backend "improves" the prompt and reintroduces hallucination. | The frontend re-checks the threshold in `useAskAi.ts`; see [`spec.md`](spec.md) §7 (belt + braces). |
| Operator misreads a yellow badge as definitive. | Tooltip text on hover, and the badge color rules are pinned in [`spec.md`](spec.md) §6. |
| Locale drift (someone edits the fallback string). | §6 declares the exact bytes; the i18n key is locked in code review. |

## 10. Cross-references

- Feature spec: [`spec.md`](spec.md).
- API contract: [`../../api/api-spec.md`](../../api/api-spec.md).
- Data shapes: [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).
- Module overview: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md).
- Chats page (sister feature): [`../chats/spec.md`](../chats/spec.md).
- Future plans: [`../../plans/README.md`](../../plans/README.md).
