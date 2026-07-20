<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/crm/features/ai-autoreply/spec.md
  - docs/tech/crm-data-model.md
-->

# PRD — AI Auto-Reply (WhatsApp)

## 1. Problem

Inbound WhatsApp messages pile up when the operator is offline.
Hand-rolled rules miss too much. A retrieval-augmented AI can answer
many routine questions automatically, but it must not leak data
across contacts and must not pretend to know when it does not.

## 2. Goal

When a chat is in `ai` mode, inbound messages get a confident AI
answer (sent) or a clearly-flagged held draft (when confidence is
low). The operator is **never** in the dark: any AI-sent message is
logged; any held draft is reviewable in one click.

## 3. Users

| Persona | Why they care |
|---|---|
| Operator | Fewer messages to triage; full audit trail; never blindsided by a sent AI message. |
| Contact (customer) | Faster response; consistent answers; never gets another contact's data. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-1 | operator | inbound messages on `ai` chats to be answered automatically when the AI is confident | I do not have to babysit every chat. |
| US-2 | operator | low-confidence drafts to be flagged for my review, not sent | the AI does not put words in my mouth. |
| US-3 | contact | my data to never leak into another contact's answer | I trust the system. |
| US-4 | operator | a Take over / Hand back control on the thread | I can intervene at any time. |

## 5. Non-goals

- The AI auto-reply does not handle media (images, voice, documents)
  in this run. Inbound media is left for the operator.
- The AI does not initiate outbound messages.
- The AI does not run in a loop (no auto-reply on the AI's own
  outgoing messages).

## 6. Success criteria

| ID | Measurable |
|---|---|
| A1 | `confidence` meets or exceeds the CRM/RAG threshold (declared in [`spec.md` §4](spec.md)) → message is sent within 5 s of the inbound (mock latency). |
| A2 | `confidence` is below the CRM/RAG threshold → no message is sent; chat moves to `human_pending_flag`; banner is visible to the operator. |
| A3 | The cross-contact test in [`spec.md` §5.2](spec.md) passes on the mock and the future real backend. |
| A4 | The transition `human → human_pending_flag` is **rejected** by the state machine function with `ERR_FORBIDDEN_TRANSITION`. |
| A5 | The Indonesian confidence banner text is rendered byte-identical to the spec. |

## 7. Open questions

- Should held drafts auto-expire after N hours? (Out of scope this run.)

## 8. Cross-references

- Spec: [`spec.md`](spec.md).
- State machine: [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).
- Data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
