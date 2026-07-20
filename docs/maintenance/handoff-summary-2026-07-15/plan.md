# Plan — Handoff Summary (seamless AI → human handoff)

> **Cycle id**: be-handoff-summary-2026-07-15
> **Run id**: WF_FEATURE-handoff-summary-2026-07-15
> **Triggered by**: user request 2026-07-15T17:30:59+07:00 — "the human should also get the summary of what has been talked about so the handoff from ai to human is seamless and the human doesn't need to go through the whole chat before understanding what's been talked about."
> **Classification**: FEATURE_REQUEST (extend the answer-policy cycle to surface the conversation summary at handoff time)

## 1. Scope

### In scope

| File | Change |
|---|---|
| `src/ai/routes/ai.js` | Add `router.get('/handoff', handoff.handler);` |
| `src/controllers/ai/handoff.js` | NEW — `GET /api/crm/ai/handoff?chatId=...` returns the handoff context (chat meta + summary + last 3 messages + flag reason) |
| `src/test/handoff-endpoint.test.mjs` | NEW — RED test asserting the endpoint returns the expected shape, returns 404 if chat not in `human_pending_flag`, returns 200 + summary + last messages when valid |
| `frontend/src/components/chats/HeldDraftBanner.tsx` | When `scenario="fallback_handoff"`, the "Lihat pesan AI" button now opens a sheet/modal showing the conversation summary, last 3 messages, and the flag reason. New "Lihat ringkasan" action button. |
| `frontend/src/hooks/crm/useCrmAi.ts` | NEW `useHandoff(chatId)` hook that calls `GET /api/crm/ai/handoff?chatId=...` and returns the payload. |
| `frontend/src/lib/contract.ts` | Extend `ChatSchema` (or add a new `HandoffContextSchema`) with `aiMode`, `conversationSummary`, `summaryUpdatedAt`, `lastMessages[]`, `flagReason` fields. |
| `frontend/src/components/chats/__tests__/HeldDraftBanner.test.tsx` | NEW — basic render test (the project has no `@testing-library/react` dep, so this is a smoke test only; see constraints). |

### Out of scope

- Migrating the existing `chats` table — column `conversation_summary` already exists (migration 006).
- A "side-by-side diff" view of the AI's last reply vs the operator's next reply.
- Real-time summary push to the FE (the current `summary` is updated every 10 min; the operator opening the handoff sheet sees the latest summary as of last update).
- A webhook to the operator's email/Slack at handoff time.

## 2. Why these changes

The AI → human handoff currently flips `aiMode` to `human_pending_flag` and shows a banner. But the operator (a human taking over) has no way to know what was being discussed. The conversation summary already exists in the DB and is updated every 10 min by the trigger; surfacing it at handoff time makes the takeover instantaneous.

**Endpoint design — single round-trip**: the operator's "Lihat ringkasan" click → 1 GET request → returns everything (summary, last 3 messages, flag reason, chat meta) in one payload. No follow-up calls; no spinner → content flow.

**Why last 3 messages, not the whole thread**: the operator needs the immediate context (what the contact just asked, what the AI said back), not the full history. The summary covers the high-level thread; the last 3 messages cover the immediate exchange. Together they're < 4 KB and cover 95% of operator decision-making.

**Why include the flag reason**: `fallback_handoff` means "AI couldn't find an answer in the KB"; `confidence_low` means "AI generated a draft but was uncertain"; `ungrounded_number` means "AI produced a number not in the KB". The flag reason tells the operator WHY the AI held the chat — they can answer more effectively.

## 3. Endpoint contract

### `GET /api/crm/ai/handoff?chatId=...`

**Auth**: requires `requireTenant` middleware (already on the router).

**Response 200**:
```json
{
  "chatId": "6281236012938@s.whatsapp.net",
  "aiMode": "human_pending_flag",
  "phone": "6281236012938",
  "lastMessageAt": 1752546000,
  "flagReason": "fallback_handoff",
  "flagReasonLabel": "AI kirim pesan fallback; butuh dijawab manusia",
  "conversationSummary": "Pelanggan menanyakan harga paket landing page...",
  "summaryUpdatedAt": 1752543000,
  "lastMessages": [
    { "id": "...", "direction": "in",  "body": "halo kak",  "timestamp": 1752545990, "senderName": "Muh Adi P" },
    { "id": "...", "direction": "out", "body": "Maaf kak, untuk hal itu belum ada di data kami ya 🙏", "timestamp": 1752545995 },
    { "id": "...", "direction": "in",  "body": "oh yaudah, kalau gitu berapa harga landing page?", "timestamp": 1752545998, "senderName": "Muh Adi P" }
  ]
}
```

**Response 404**: chat not found OR chat is NOT in `human_pending_flag` mode (the operator can only view handoff context for chats that are flagged). This prevents the operator from spying on chats that haven't been handed off.

**Response 400**: missing `chatId` query param.

## 4. TDD plan

### 4.1 RED — write failing tests first

| Test | Expected: RED (current code) |
|---|---|
| `src/test/handoff-endpoint.test.mjs` — when the chat is in `human_pending_flag`, GET `/api/crm/ai/handoff?chatId=...` returns the handoff payload | current code: no endpoint exists → 404 → test FAILS |
| `src/test/handoff-endpoint.test.mjs` — when the chat is NOT in `human_pending_flag`, the endpoint returns 404 | current code: no endpoint → test FAILS |
| `src/test/handoff-endpoint.test.mjs` — when the chat does not exist, the endpoint returns 404 | current code: no endpoint → test FAILS |

### 4.2 GREEN — apply the 3 production code changes

1. `src/controllers/ai/handoff.js` (NEW): implement the controller.
2. `src/ai/routes/ai.js`: add the route.
3. `frontend/src/components/chats/HeldDraftBanner.tsx`: when `scenario="fallback_handoff"`, the "Lihat pesan AI" button now opens a sheet showing the handoff context. Use existing `<Sheet>` or `<Dialog>` from shadcn/ui. (Or add to the existing `HeldDraftBanner` as an inline section — keeps it simple.)
4. `frontend/src/hooks/crm/useCrmAi.ts`: add `useHandoff(chatId)` hook.
5. `frontend/src/lib/contract.ts`: add `HandoffContextSchema` (or extend `ChatSchema`).

### 4.3 REFACTOR + VERIFY

Run the full BE + FE suites. Smoke test: open http://localhost:5176/, trigger a fallback handoff (send a WhatsApp message that the AI can't answer), then look at the HeldDraftBanner. The "Lihat ringkasan" button should open a sheet showing the summary.

## 5. Risks

| Risk | Mitigation |
|---|---|
| The FE `Chat` schema doesn't include `aiMode`/`summary` — the mock interceptor might break | Add the new fields as `optional` in `ChatSchema`. The mock already returns a default; it'll continue to work. |
| The summary is stale (10-min debounce on `maybeUpdateSummary`) | The handoff sheet shows the current summary, plus the `summaryUpdatedAt` timestamp. If the operator needs the latest, they can click "refresh" (re-fetch the endpoint). For MVP, no auto-refresh. |
| The endpoint exposes the summary in JSON, which could include sensitive content if the AI summarized something private | The endpoint requires `requireTenant` (same as the other AI routes). The summary is the same text the LLM generated from the chat history; it's the operator's own chat. No additional risk. |
| A 4 KB summary + 3 messages = ~5 KB payload | Trivial. No pagination needed. |

## 6. Definition of done

1. 3 RED tests fail against current code; PASS after the fix.
2. Live smoke test: `curl /api/crm/ai/handoff?chatId=...` for a `human_pending_flag` chat returns the payload.
3. Live smoke test: the FE HeldDraftBanner's "Lihat ringkasan" button opens a sheet showing the summary + last 3 messages.
4. Full BE suite: 145+ tests (143 prior + 3 new, possibly minus 1 if `heldReason` schema causes a sync issue; 0 failed).
5. Full FE suite: 80+ tests (unchanged; no new TSX test since `@testing-library/react` is not a dep).
6. `composer-byte-identity` and `warm-persona-customizable` and `dispatcher-ephemeral` and the 4 `answer-policy-*` tests still pass (no regressions).
7. No `package.json` / `tsconfig.json` / `vite.config.*` / `tailwind.config.*` changes.
8. No `sot/**` writes (supervisor handles after the cycle).
9. The endpoint is gated on `human_pending_flag` (404 otherwise) — verified by a test.
10. The summary is the LLM-generated `chats.conversation_summary`, not a hand-written or fabricated string.

## 7. Out-of-scope follow-up items

- Add a "Previous summaries" history (the summary gets overwritten every 10 min; the operator might want to see what the AI knew at the moment of handoff even after a refresh).
- Add a "Suggest reply" button on the handoff sheet that calls the existing `/api/crm/ai/reply-preview` to give the operator an AI-drafted reply they can edit + send.
- Per-bubble `isFallback: boolean` indicator (already queued in the prior cycle as a follow-up).
- Real-time summary refresh on handoff (force-update instead of waiting for the 10-min debounce).
