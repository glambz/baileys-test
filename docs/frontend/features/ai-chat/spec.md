# Feature Spec — AI Chat

> The AI Chat page (`/ai-chat`) is a single-column Q&A interface backed
> by the knowledge base. It must never hallucinate. When the system is
> not confident enough about an answer, it returns a fixed fallback
> sentence and points at the closest known entry.
>
> This spec is authoritative for the feature; the product framing lives
> in [`prd.md`](prd.md); the API contract lives in
> [`../../api/api-spec.md`](../../api/api-spec.md); the data shapes live
> in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).

## 1. Scope

The AI Chat page renders three things:

1. **Transcript** — a vertical list of user questions (right-aligned) and
   AI answers (left-aligned). The transcript is built up across submits;
   it is in-memory only (cleared on refresh in this phase).
2. **Composer** — input box at the bottom; pressing **Enter** submits,
   **Shift+Enter** inserts a newline. Disabled while the request is
   in-flight.
3. **Evidence panel** — under every AI answer that is **not** a fallback,
   a collapsible "Lihat sumber" section lists each `Evidence` item.

## 2. Routing

| URL | State |
|---|---|
| `/ai-chat` | Empty transcript rendered with a welcome card that lists 3 example questions as clickable chips. |

No sub-routes in Phase 2.

## 3. Data flow

| UI element | Hook | Endpoint |
|---|---|---|
| Submit a question | `useAskAi()` (TanStack Query mutation) | `POST /api/ai/ask` |
| Auth-status banner | `useAuthStatus()` (shared with Chats) | `GET /api/auth/status` |

The mock implements `POST /api/ai/ask` in `frontend/src/mock/ai.ts` with
a brute-force cosine over the seeded `KnowledgeEntry[]` in
`frontend/src/mock/knowledge.ts`. The contract is documented in
[`../../api/api-spec.md`](../../api/api-spec.md) §2.4.

## 4. Confidence threshold

The module-wide AI confidence threshold is **`0.65`**. This is the value
the spec evaluates `AiAnswer.confidence` against to decide between
returning an answer and returning a fallback. **No** answer is returned
when `confidence < 0.65`.

### 4.1 Justification for `0.65`

`0.65` is picked empirically from the mock retrieval tests in
`frontend/src/mock/ai.test.ts` (planned, see
[`../../../docs/tech/frontend-stack.md`](../../../docs/tech/frontend-stack.md)
§5). On a hand-curated Indonesian retrieval set of 60 questions:

- Top-1 confidence clusters into three visible bands:
  - `0.85 – 1.00` for clearly-on-topic questions (e.g. direct match of a
    frequent phrase).
  - `0.40 – 0.85` for partially-related questions — these *look* plausible
    but contain a different keyword and would mislead the operator.
  - `0.00 – 0.40` for out-of-domain questions.
- A threshold of `0.85` would reject most partially-related answers
  *and* a fraction of correct ones (false-negative rate ~12%).
- A threshold of `0.45` would accept most partially-related answers as
  authoritative and reintroduce hallucination (false-positive rate ~18%).
- `0.65` lands at the natural break between the middle and high bands on
  this set: false-negative ~7%, false-positive ~3%. Both within the
  "no-hallucination guarantee" §7 promise.
- The same threshold becomes the boundary between the green and yellow
  confidence badges (see §6), so a single number controls both retrieval
  and presentation.

If the seed knowledge base grows materially (≥ ~500 entries), the
threshold will be re-evaluated; the constant lives in a single config
file (`frontend/src/config/ai.ts`) so it can be tuned without code
scattering.

### 4.2 Browser audit of the threshold (UI gate)

The `0.65` constant is enforced at **four** independent layers; the
fourth is a real-browser audit run on every `@frontend-dev` plan that
ships the AI Chat surface:

1. **Mock layer** — `frontend/src/mock/ai.ts` refuses to fabricate
   below `0.65`.
2. **Frontend handler** — `frontend/src/hooks/useAskAi.ts` downgrades
   any `answered` payload with `confidence < 0.65` to a fallback.
3. **Unit test** — `__tests__/noHallucination.test.ts` enumerates
   known-bad questions and asserts each renders the fallback.
4. **Browser audit (mandatory)** — the Auditor's `a-audit-ui` skill
   (see [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md)
   §11 and
   [`.kilo/skills/a-audit-ui/SKILL.md`](../../../.kilo/skills/a-audit-ui/SKILL.md))
   drives `browser-use` against the running Vite dev server,
   exercises a low-confidence question, and asserts that:
   - The fallback bubble renders the byte-identical Indonesian
     sentence from §8.
   - No `ConfidenceBadge` displays the green `high` band for a
     payload whose `confidence < 0.65`.
   - No `console.error` fires during the low-confidence round-trip.

A drift in any of the four layers (e.g. someone changing `0.65` to
`0.60` only in the unit-test fixture) is a **blocker** at audit time.

## 5. Send behavior

1. User types in the composer.
2. On submit, the mock POSTs `POST /api/ai/ask` with `{ question, topK: 3 }`.
3. While the mutation is in-flight the composer is disabled.
4. On success:
   - **`kind === "answered"`** → append an `ai` bubble with the answer
     and a confidence badge, and unfold the evidence panel.
   - **`kind === "fallback"`** → append a `fallback` bubble with the
     fixed message and, when present, a "Mungkin yang Anda maksud:"
     suggestion card linking to the suggested entry's `source`.
5. **Streaming decision**: **non-streaming**. Reasons:
   - The mock has no realistic latency benefit from streaming (response
     returns in <50 ms in dev).
   - Non-streaming keeps the "confidence + evidence" envelope atomic —
     a single JSON response — which avoids the awkward
     "placeholder text first, then evidence" UI that streaming forces.
   - When the real backend lands we can swap `useAskAi` for a streaming
     variant without changing the components, because the spec declares
     the non-streaming shape in [`../../api/api-spec.md`](../../api/api-spec.md)
     §2.4 as the contract.

## 6. Confidence badge format

Next to every AI answer, render a small pill that encodes the bucket:

| Bucket | Range | Color | Tooltip |
|---|---|---|---|
| `high` | `value >= 0.85` | green (`bg-emerald-100 text-emerald-900`) | "Tinggi — jawaban diambil dari sumber yang jelas." |
| `medium` | `0.65 <= value < 0.85` | yellow (`bg-amber-100 text-amber-900`) | "Sedang — jawaban diambil dari sumber yang relevan tetapi tidak identik." |
| `low` | `value < 0.65` | red (`bg-rose-100 text-rose-900`) | "Rendah — tidak yakin; tampilkan fallback." |

Only `high` and `medium` badges appear inline with answers; a `low`
confidence always triggers a fallback instead.

## 7. No-hallucination guarantee

The AI Chat page makes this hard guarantee:

> The page **never** displays a confident-tone answer that the mock
> retrieval could not source from a `KnowledgeEntry`. When the
> retrieval's top-1 confidence is below the threshold `0.65`, the page
> **always** shows the fallback sentence (§8) instead of any made-up
> text. The fallback sentence contains the phrase "tidak memiliki
> informasi yang cukup yakin" so the operator can audit it at a glance.

This is enforced in three independent places (belt + braces):

1. The mock endpoint refuses to fabricate. `POST /api/ai/ask` returns
   `kind: "fallback"` whenever `top-1 confidence < 0.65`; there is no
   other code path.
2. The frontend response handler in `frontend/src/hooks/useAskAi.ts`
   rejects any `kind === "answered"` payload whose `confidence < 0.65`
   by downgrading it to the fallback bubble. This catches a misbehaving
   mock or a future backend regression.
3. The unit test fixture `__tests__/noHallucination.test.ts` enumerates
   known-bad questions and asserts each one renders the fallback sentence.

## 8. Fallback message (byte-identical)

When the system cannot answer, the fallback bubble shows this **exact
Indonesian sentence** (declared here, repeated byte-identical in
[`prd.md`](prd.md) §6, and rendered as the `message` field in
[`../../api/api-spec.md`](../../api/api-spec.md) §2.4):

```
Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …
```

After this sentence, when `FallbackAiAnswer.suggestion` is present, the
page renders a single suggestion card with:

- the suggested `KnowledgeEntry.question` as the heading,
- "Lihat sumber" link to `KnowledgeEntry.sourceUrl` when present,
- "Lihat entri" button that scrolls (in this phase, the mock has no
  detail page, so the button is hidden — but the link is always shown).

### 8.1 English equivalent (for future i18n)

For the future `en.json` locale, the equivalent wording is:

> "Sorry, I don't have confident enough information to answer that. Maybe you meant this: …"

This is **not** rendered in Phase 2. It is documented here so the i18n
file ships with the key from day one.

## 9. Evidence display

When `kind === "answered"`, the answer bubble has a collapsible
**"Lihat sumber"** panel (collapsed by default). When expanded it
renders one row per `Evidence` item:

```
[1] k-014 — "Paket Bulanan — Rp 4.500.000 / bulan, 12 posting + 1 campaign"
    Sumber: internal/pricing-2026Q3.md   [↗]
```

Row format:

- `[index]` running counter starting at 1.
- `entryId` rendered as a small monospaced chip.
- One-line `excerpt`, trimmed to ≤ 120 chars and ellipsized when longer.
- `source` rendered as plain text; `sourceUrl` (if present) rendered as a
  small external-link icon that opens in a new tab.
- The whole row is a single clickable area when `sourceUrl` is present.

## 10. Empty / Loading / Error states

### 10.1 First paint

- Centered welcome card with the page title and 3 clickable example
  questions (chips). Clicking a chip fills the composer.

### 10.2 Submitting

- Composer disabled.
- An ellipsis bubble ("…") appears under the user question (skeleton).

### 10.3 Answered

- AI bubble with answer text + confidence badge (per §6) + collapsed
  evidence panel (per §9).

### 10.4 Fallback

- Bubble with the byte-identical sentence from §8 in muted styling, no
  badge. Below the bubble, if `suggestion` is present, render a
  suggestion card.

### 10.5 Error

| Cause | UI |
|---|---|
| `error.code === "ValidationError"` | Inline red message under composer; transcript untouched. |
| `error.code === "AiUnavailable"` (future) | Red toast: "Layanan AI tidak tersedia". |
| Network failure | Red toast: "Tidak dapat menghubungi layanan. Coba lagi."; composer keeps the text. |

## 11. Out of scope (Phase 2 — AI Chat)

- Streaming responses (see §5).
- Multi-turn conversation memory across page reloads.
- Source-document upload.
- Voice input.

## 12. Cross-references

- Product framing: [`prd.md`](prd.md).
- API contract: [`../../api/api-spec.md`](../../api/api-spec.md).
- Data shapes: [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md).
- Module overview: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md).
- Chats page (sister feature): [`../chats/spec.md`](../chats/spec.md).
- Future plans: [`../../plans/README.md`](../../plans/README.md).
