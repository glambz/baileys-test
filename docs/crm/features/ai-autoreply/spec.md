<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/tech/ai-reply-state-machine.md
  - docs/frontend/api/api-spec.md (§6)
-->

# Feature Spec — AI Auto-Reply (WhatsApp)

> The AI auto-reply feature answers inbound WhatsApp messages on a
> chat when the chat's `AIReplyMode` is `'ai'`, using the CRM/RAG
> pipeline restricted to that chat's contact. This spec is
> authoritative for the feature; the data shapes live in
> [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md);
> the canonical state machine lives in
> [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).

## 1. Scope

The AI auto-reply feature is invoked by the future backend whenever
an inbound WhatsApp message arrives on a chat whose
`ai_reply_mode === 'ai'`. The feature:

1. Reads `chat.contact_id` from the chat row.
2. Calls the RAG pipeline with the **hard contact filter** applied at
   the data layer (see §5).
3. Decides between **send**, **hold for review**, or **do nothing**
   based on the result and the chat's current mode.
4. On `confidence >= 0.7`, sends the AI answer as a normal
   `direction: "out"` WhatsApp message.
5. On `confidence < 0.7`, moves the chat to `'human_pending_flag'`
   and surfaces the held draft in the operator's UI.
6. On any error, falls back to **do nothing** and logs the failure.

## 2. The AIReplyMode union (byte-identical)

The literal union is byte-identical in three files: this file §2,
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §2,
and [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md) §1.
**No other file is allowed to spell this type any differently.**

```ts
type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';
```

## 3. State machine transition table (byte-identical)

The table below is **byte-identical** to the one in
[`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md) §2.
The two tables must always agree.

| from | to | trigger | side-effects | actor |
|---|---|---|---|---|
| `ai` | `human` | operator clicks "Take over" on the chat | future: emit `chat.ownership_changed` event; flush any queued AI draft | operator |
| `ai` | `human_pending_flag` | AI draft produced with `confidence < 0.7` on an inbound message | the AI draft is held for review; the chat moves to `human_pending_flag` | AI (auto) |
| `human` | `ai` | operator clicks "Hand back to AI" on the chat | the next inbound message is eligible for AI; any held draft is discarded | operator |
| `human` | `human_pending_flag` | — | **disallowed**. A human-mode chat never auto-flags. The system must reject any code path that would attempt this transition. | — |
| `human_pending_flag` | `ai` | operator clicks "Send as-is" on the held AI draft | the held draft is sent; mode returns to `ai` | operator |
| `human_pending_flag` | `human` | operator clicks "Edit & send" on the held AI draft | the operator's edited version is sent; the chat is now in `human` (operator-owned) | operator |

## 4. Confidence threshold (CRM/RAG)

The decision between "send" and "hold for review" uses the
CRM/RAG threshold **`0.7`** declared in
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3.
This is **distinct** from the legacy WhatsApp module's `0.65`
(declared in [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §2.6)
that gates `/api/ai/ask`. The two thresholds coexist; this feature
always uses `0.7`.

## 5. Hard contact filter (defense-in-depth)

The WhatsApp auto-reply path applies a **hard contact filter at the
data layer**. The filter is **not** a prompt instruction. The two
paths are:

| Path | Trigger | Contact filter | RAG source |
|---|---|---|---|
| WhatsApp auto-reply | inbound WhatsApp message on a chat | **HARD**: `entity_records.contact_id == chat.contact_id` (SQL JOIN predicate) | `knowledge_chunks` joined to the chat's contact's entities only |
| In-app `/api/ai/ask` | operator submits a question in the AI panel | **none** | `knowledge_chunks` across all entities |

The hard filter is expressed in SQL as:

```sql
SELECT r.*, c.text
FROM   knowledge_chunks c
JOIN   knowledge_files f   ON f.id = c.file_id
JOIN   entity_records r   ON r.entity_definition_id = f.entity_id
JOIN   chats chat         ON chat.id = $chatId
WHERE  r.contact_id = chat.contact_id      -- HARD FILTER (data layer)
  AND  c.embedding <=> $question_embedding < $distance_threshold
ORDER  BY c.embedding <=> $question_embedding
LIMIT  $topK;
```

The same query in the in-app path is identical **except** for the
`r.contact_id = chat.contact_id` predicate, which is **omitted**.

### 5.1 Evidence trail (team scope)

The evidence returned to the operator when a held draft is rendered
MUST include the `contact_id` of the chat the question is about, so
the operator can audit the scope of the answer at a glance. The
evidence item is:

```ts
interface AIReplyEvidence {
  chunkId: string;
  text: string;
  source: string;
  score: number;
  /** The contact_id the chunk was retrieved under; always equal to
   *  the chat's contact_id on the WhatsApp path. */
  contactId: string;
}
```

The contract is enforced in the response envelope of the future
endpoint `POST /api/whatsapp/auto-reply` declared in
[`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).

### 5.2 Test: reject any auto-reply whose content references a cross-contact record

This is the **automated test** that proves the hard filter is
actually applied. It is mandatory and lives in the test suite, not
just in the spec.

> **Test name:** `auto_reply_does_not_leak_across_contacts`
> **Location:** `frontend/src/mock/__tests__/autoReply.test.ts` (mock
> layer) and `src/services/__tests__/autoReply.test.js` (future real
> backend).
>
> **Setup:**
> 1. Seed two contacts: `C-A` (Pak Hendro) and `C-B` (Bu Sinta).
> 2. Seed two CRM entities: `customer` (entity name `"customer"`)
>    with two records — `R-A` (owned by `C-A`, `contact_id = C-A`)
>    and `R-B` (owned by `C-B`, `contact_id = C-B`).
> 3. Seed one `knowledge_chunk` per record: `K-A` cites `R-A`,
>    `K-B` cites `R-B`. The chunks are semantically similar enough
>    that, without the contact filter, either could rank top-1 for
>    the question "Berapa total invoice bulan ini?".
>
> **Action:**
> 1. Open a chat with `C-A`, set `ai_reply_mode = 'ai'`.
> 2. Send the message "Berapa total invoice bulan ini?".
> 3. Invoke the auto-reply pipeline (mock or real).
>
> **Assertions:**
> 1. The auto-reply's `body` does **not** contain `R-B`'s
>    identifying field values (e.g. the customer name, phone, or
>    amount for `R-B`).
> 2. The `evidence` array's every item has `contactId === C-A`.
> 3. The RAG SQL emitted by the pipeline (captured via a spy) contains
>    the predicate `r.contact_id = chat.contact_id` (or the parameter
>    binding that the prepared statement sets to `C-A`).
>
> **Failure mode (what we are guarding against):**
> If a future refactor moves the contact scope from the data layer to
> the prompt (or drops it entirely), the test fails. The CI gate is
> the contract.

The test is declared here so the Planner can include it verbatim in
the relevant plan files.

## 6. States (UI surface)

### 6.1 Held draft banner

When a chat is in `human_pending_flag` and the operator opens the
chat, a banner at the top of the thread panel reads:

> "AI menyusun draf jawaban, tetapi tingkat keyakinannya rendah
> (confidence: X.XX). Tinjau dulu sebelum mengirim."

The banner has three actions:

| Action | Effect on state |
|---|---|
| **Kirim apa adanya** | transition `human_pending_flag → ai`; the draft is sent as a normal `out` message |
| **Edit & kirim** | transition `human_pending_flag → human`; the composer is pre-filled with the draft text |
| **Buang draf** | transition `human_pending_flag → ai`; the draft is discarded, no message is sent |

### 6.2 Take over / hand back

A kebab menu in the thread header shows:

| Current mode | Menu item | Transition |
|---|---|---|
| `ai` | "Take over" | `ai → human` |
| `human` | "Hand back to AI" | `human → ai` |
| `human_pending_flag` | (hidden — see the banner) | — |

## 7. Out of scope (AI auto-reply)

- Co-pilot mode (the AI drafts while the operator types).
- Streaming the AI answer into the WhatsApp socket.
- Auto-escalation when a held draft is older than N minutes.
- Multi-language detection; the AI always answers in Indonesian.

## 8. Cross-references

- Product framing: [`prd.md`](prd.md).
- Canonical state machine: [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).
- Data model + threshold: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- API contract (all `[mock]`): [`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).
- Test location: §5.2 above; reproduced in the plan.
