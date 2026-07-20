<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/crm/features/knowledge-rag/spec.md
  - docs/tech/crm-data-model.md
-->

# PRD — Knowledge / RAG

## 1. Problem

The operator has a lot of unstructured content (price lists, SOPs,
past proposals) that does not live in a structured CRM record. The
AI cannot answer questions about it without it being indexed.

## 2. Goal

A pipeline that ingests files, chunks them, embeds them, and serves
the relevant chunks to the AI at question time — both from the
in-app `/ai` panel and from the WhatsApp auto-reply.

## 3. Users

| Persona | Why they care |
|---|---|
| Operator (admin) | Uploads the source documents; trusts the pipeline. |
| Operator (data entry) | Asks the AI about uploaded content; gets answers with citations. |
| Contact (customer, via WhatsApp) | Gets accurate answers grounded in the operator's own documents. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-1 | operator | to upload a file (PDF, md, txt, csv) per entity | the AI can answer questions about it. |
| US-2 | operator | to see the pipeline status of every file | I know when ingestion is done. |
| US-3 | operator | to retry a failed ingestion | a transient error does not block me. |
| US-4 | operator | the AI to refuse to answer when the chunks are insufficient | no hallucinations. |

## 5. Non-goals

- Token-aware chunking.
- Cross-entity retrieval.
- Streaming answers.

## 6. Success criteria

| ID | Measurable |
|---|---|
| A1 | A 1 MB text file completes `pending → embedded` within 30 s on the mock. |
| A2 | A failed file shows `errorMessage` and a `Re-embed` button that succeeds on retry. |
| A3 | The in-app `/api/ai/ask` endpoint returns a CRM fallback for an off-topic question (with the byte-identical Indonesian sentence from §7 of [`spec.md`](spec.md)). |
| A4 | The WhatsApp auto-reply path applies the hard contact filter (see [`../ai-autoreply/spec.md` §5](../ai-autoreply/spec.md)). |

## 7. Open questions

- None for this run.

## 8. Cross-references

- Spec: [`spec.md`](spec.md).
- Data model: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- AI auto-reply: [`../ai-autoreply/spec.md`](../ai-autoreply/spec.md).
