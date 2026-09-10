# WhatsApp + CRM + AI: Gap Closure & UI Redesign

Date: 2026-09-04
Status: implemented and verified (2026-09-04)

## Context

The requested system — WhatsApp auto-reply with self-assessed confidence,
agent takeover, an internal RAG assistant, and CRM knowledge management —
is largely already implemented in this repo and running against live
infrastructure. This spec covers only the verified gaps and the redesign.

## Verification performed (2026-09-04)

All four subsystems were exercised at runtime against the real MiniMax M3
API, the local embedding sidecar, and the pgvector container
`f7bc92a37d59` (`pgvector/pgvector:pg16`, `baileys-pg`, port 55432).

| # | Subsystem | Result |
|---|-----------|--------|
| 1 | Auto-reply engine | **PASS.** Inbound → episodic history → hybrid retrieval (score 0.82) → MiniMax M3 → grounded reply, 7.1s end to end. |
| 1 | Escalation state machine | **PASS.** Low-confidence / fallback flips `chats.ai_mode` to `human_pending_flag`, writes audit, publishes SSE `chat.handoff`. |
| 1 | Escalation summary | **FAIL — missing.** After a live escalation, `GET /api/crm/ai/handoff` returned `conversationSummary` of length 0. The model's `reasoning` field is parsed and discarded. |
| 2 | Agent chat interface | **PASS.** Live thread, AI/Human toggle, manual composer, no console errors. |
| 3 | Internal AI chat | **PASS.** SSE stream with `tool` / `chunk` / `done` events and KB citations. |
| 4 | CRM CRUD | **PASS.** Entities and records create/update/delete. |
| 4 | CRM → vector re-index | **FAIL — missing.** Creating a record with a unique token left `knowledge_chunks` at 20 rows; the token was not retrievable. |
| — | Test suite | **PASS.** 39 files / 186 tests, once the embedding sidecar is running. |

Two earlier suspicions were investigated and **dismissed**:

- The 4 test files that failed teardown did so only because the embedding
  sidecar was down; `beforeAll` threw before binding `getPool`. With the
  sidecar up, all files pass. Not a code defect.
- `/api/crm/chats/modes` returns 200. An earlier 404 was a wrong probe path.

Two minor issues found, not in scope for reimplementation:

- Two `chats` rows hold auto-reply JSON in `conversation_summary` — test
  pollution written through the fire-and-forget summary path while
  `globalThis.fetch` was stubbed. Dev-DB hygiene only.
- `src/scripts/mock-inbound.js` POSTs to `/internal/mock-inbound`, a route
  that does not exist. Dead script.

## Gap A — CRM records are invisible to RAG

`POST/PATCH/DELETE` on `entity_records` never touches the vector store.
`hybrid.js:78` states this outright: *"entity_records are NOT chunked into
knowledge_chunks."*

**Approach (chosen): a separate `record_embeddings` table.**

Records stay fully isolated from the uploaded-file KB. A new table holds
one row per record chunk with its own HNSW index; hybrid retrieval gains a
third branch that is fused into the existing RRF alongside BM25 and the KB
ANN results.

- New migration `012-record-embeddings.sql`: `record_embeddings`
  (`id`, `record_id` FK → `entity_records` ON DELETE CASCADE, `entity_id`,
  `tenant_id`, `chunk_index`, `text`, `text_hash`, `embedding vector(1024)`,
  `metadata jsonb`), plus an HNSW index on `embedding` and a GIN FTS index
  on `text`.
- New module `src/ai/store/records.js`: `indexRecord({recordId, entityId,
  tenantId, data, schemaJson})` and `deindexRecord(recordId)`. Record data
  is flattened to `"label: value"` lines using the entity's `schemaJson`
  field labels, then chunked with the existing `chunkText` and embedded
  with the existing `embedText`.
- `src/ai/routes/crm.js` calls `indexRecord` after create and update, and
  relies on the FK cascade for delete. Indexing is awaited so a failure
  surfaces to the caller rather than silently desyncing the index.
- `src/ai/retrieval/hybrid.js` gains a `searchRecordsAnn` branch fused into
  the existing RRF.

Rationale for the extra table over reusing `knowledge_chunks`: records and
uploaded documents have different lifecycles, different provenance, and
different deletion semantics. Keeping them apart avoids overloading the
`knowledge_files` FK with synthetic rows and keeps the Knowledge page's
file list honest.

## Gap B — no escalation summary for the agent

`maybeUpdateSummary` is debounced to once per 10 minutes and is
fire-and-forget, so at the moment of escalation the agent's panel can be
empty (verified) or stale. The model's own `reasoning` is discarded.

**Approach (chosen): a dedicated escalation summarizer.**

A second, purpose-built prompt producing an agent-facing briefing distinct
from the running conversation digest.

- New migration `013-escalation-briefing.sql`: adds
  `chats.escalation_briefing jsonb`, `chats.escalation_reason text`,
  `chats.escalation_at bigint`.
- New module `src/ai/settings/escalation.js` exporting
  `generateEscalationBriefing({chatId, tenantId, reason, reasoning,
  confidence, lastMessages, retrievedChunks})`. Output shape:
  ```json
  {
    "headline": "one line an agent reads first",
    "customer_wants": "what the customer is asking for",
    "ai_attempted": "what the AI tried and why it stopped",
    "blocking_gap": "what knowledge was missing",
    "suggested_next_action": "concrete next step for the agent",
    "sentiment": "neutral | frustrated | urgent"
  }
  ```
- `trigger.js` awaits this on every escalation path (`confidence_low`,
  `fallback_handoff`, `ungrounded_number`, `turbo_cutoff`, `parse_failure`),
  passing the model's `reasoning` and confidence through. Awaited, not
  fire-and-forget, so the briefing exists before the agent is alerted.
- `controllers/ai/handoff.js` returns `escalationBriefing`,
  `escalationReason`, `escalationAt` alongside the existing payload.
- `HeldDraftBanner.tsx` renders the briefing; the running conversation
  summary remains available as secondary context.

Cost: one extra MiniMax call per escalation only. Escalations are rare by
construction.

## Redesign

The UI is stock shadcn neutral-grey with a green accent that appears only
in dark mode. The redesign covers visual identity (a coherent palette in
both themes), the agent takeover console (making the escalation briefing
the focal point), the internal AI chat, and the CRM dashboard. Executed
with the `frontend-ui-engineering` skill. No route or data-contract changes.

## Testing

- Unit: record flatten/chunk shape; escalation briefing schema parse.
- Integration (DB-backed): create a record → assert it becomes retrievable;
  delete it → assert the cascade removes its embeddings; drive a live
  escalation → assert `escalation_briefing` is non-null before the handoff
  endpoint is polled.
- Regression: the existing 186 tests must stay green.

## Out of scope

Restoring the 346 deleted files in the working tree; committing the
untracked frontend; the two minor issues listed above.


## Implementation notes (added during the build)

Three defects were found while verifying the work and fixed as part of it.

**`reasoning` was never requested.** The schema accepted an optional
`reasoning` field, but neither system prompt asked the model for one, so it
was always absent and the briefing had nothing to show. Both prompts now
document `reasoning` in their output contract. The schema field stays
optional deliberately: it is diagnostic, and rejecting an otherwise-valid
answer because the model omitted it would suppress a good reply.

**The briefing raced the message it was about.** The trigger persists the
inbound message fire-and-forget, so the briefing's transcript read could
miss the very message that caused the escalation — observed in a live run
as a briefing stating the customer's question "was not recorded". The
triggering message is now passed to `generateEscalationBriefing`
explicitly and appended if the DB has not caught up.

**Record numbers looked like hallucinations.** `trigger.js` validates every
number in a reply against the KB text and holds the reply if one is
ungrounded. That check read `knowledge_chunks` only, so once records became
retrievable, a legitimate figure taken from a CRM record would have been
flagged and the reply suppressed. The check now reads `record_embeddings`
too, guarded separately so a missing table degrades to the previous
behaviour.

**Frontend.** `EscalationBriefing.tsx` renders the briefing and is shown by
default whenever a chat is in handoff — it was previously behind a "Lihat
ringkasan" button and limited to one scenario. The running summary and
recent messages moved behind a disclosure as secondary context. The palette
gained `surface` / `success` / `warning` / `info` tokens and a single brand
hue across both themes; the handoff panel's hardcoded `slate`/`sky`/`rose`/
`amber` classes (invisible in dark mode) were replaced with them. Three
layout bugs were fixed: the taller panel squeezed the message list to zero
height (unbounded wrapper, now capped at 45vh with `shrink-0` +`min-h-0`),
the AI Workspace header crushed its title into a two-word column, and that
page's third sidebar pushed the main pane off-screen at 768px.

## Final verification

- Backend: 41 files / 201 tests passing.
- Frontend: 12 files / 101 tests passing, `tsc -b --noEmit` clean.
- Live end-to-end, against MiniMax M3 + sidecar + pgvector:
  1. CRM record created via HTTP -> indexed (1 chunk)
  2. WhatsApp inbound asking about it -> retrieved and answered in 4.4s
  3. Reply `"Amount untuk Paket Kilat Nusantara itu Rp4.825.000 ya kak [1]"`
     - the record's figure survived the numerical grounding gate
  4. Record deleted -> embeddings cascade to 0
- Live escalation: mode -> `human_pending_flag`, briefing persisted with
  populated `ai_reasoning`, correct `urgent` sentiment, the triggering
  message reflected, and served by `GET /api/crm/ai/handoff`.
