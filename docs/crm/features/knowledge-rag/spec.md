<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/tech/crm-data-model.md
  - docs/crm/features/ai-autoreply/spec.md
-->

# Feature Spec — Knowledge / RAG

> The Knowledge / RAG feature is the pipeline that turns uploaded
> source documents into embeddings, retrieves the most relevant
> chunks for a question, and feeds them to the AI to produce an
> answer. This spec is authoritative for the pipeline; the data
> shapes live in [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).

## 1. Scope

The Knowledge / RAG feature is a single page (`/crm/_knowledge`)
plus the underlying pipeline that the AI auto-reply calls. It
renders three things:

1. **File list** — one row per `KnowledgeFile`, grouped by entity.
2. **Upload affordance** — drag-and-drop or click-to-pick.
3. **Pipeline status** — the lifecycle of every file (`pending →
   chunked → embedded → failed`), with retries on `failed`.

## 2. File list

| Column | Source | Notes |
|---|---|---|
| Entity | `KnowledgeFile.entityId` → `EntityDefinition.label` | rendered. |
| Filename | `KnowledgeFile.filename` | rendered. |
| Mime | `KnowledgeFile.mime` | small chip. |
| Size | `KnowledgeFile.size` | human-readable. |
| Status | `KnowledgeFile.status` | chip per status. |
| Chunks | join `knowledge_chunks` count | live count. |
| Uploaded | `KnowledgeFile.uploadedAt` | `[YYYY-MM-DD HH:mm]`. |
| Actions | — | `Open`, `Re-embed`, `Delete`. |

## 3. Upload

The upload affordance is per-entity. The operator picks an
`EntityDefinition` and then drops one or more files.

| Constraint | Value |
|---|---|
| Max files per upload | 20 |
| Max file size | 25 MB |
| Accepted mimes | `text/plain`, `text/markdown`, `application/pdf`, `text/csv` (the first phase; more later) |
| Required metadata | none — the entity is the metadata. |

On upload, the file is POSTed to `POST /api/crm/knowledge/files`
with `{ entityId, filename, mime, size, content (base64) }`. The
server returns `{ fileId, sha256 }` and queues the file for
processing.

## 4. Pipeline

### 4.1 Stages

```
pending  →  chunked  →  embedded
                       ↘
                        failed
```

| Stage | What happens | Side-effects |
|---|---|---|
| `pending` | The file is uploaded; the SHA-256 is computed; the body is stored. | `KnowledgeFile.status = "pending"` |
| `chunked` | The body is split into ≤ 800-char chunks with a 100-char overlap. | `KnowledgeChunk` rows are inserted; `KnowledgeFile.status = "chunked"`. |
| `embedded` | Each chunk is sent to the embeddings model. The mock returns a deterministic 1536-dim vector. | `KnowledgeChunk.embedding` is set; `KnowledgeFile.status = "embedded"`. |
| `failed` | Any stage threw. The `errorMessage` field is set; the operator can retry. | `KnowledgeFile.status = "failed"`. |

### 4.2 Retry

A `Re-embed` button on a `failed` row re-runs the pipeline from the
first failed stage. Retries are idempotent: re-chunking is
deterministic by SHA-256; re-embedding is deterministic by chunk id.

### 4.3 Mock vs real

In the mock layer:

- Chunking uses a simple character-based splitter.
- Embeddings are a deterministic `crypto.createHash('sha256')`-based
  1536-dim vector (so the retrieval results are stable across
  test runs).

In the future real backend:

- Chunking uses the same character-based splitter in this run
  (token-aware chunking is future work).
- Embeddings use `text-embedding-3-small` (or an equivalent local
  model) via the operator's API key.

## 5. Retrieval

The RAG retrieval is a top-K cosine similarity over
`knowledge_chunks.embedding`, filtered by the entity (and, on the
WhatsApp path, by the contact — see §5 of
[`../ai-autoreply/spec.md`](../ai-autoreply/spec.md)).

### 5.1 Score combination

The pipeline composes two scores:

- `vector_score = 1 - cosine_distance(embedding, question_embedding)`
- `metadata_score = 0` if no `indexable` field of the chunk's record
  contains a token of the question, `0.15` otherwise (a small
  bump).
- `combined = vector_score + metadata_score`

The `combined` score is the value compared against the CRM/RAG
threshold declared in
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3.

### 5.2 Top-K

`topK` is `5` by default; the operator can pass a smaller value in
the in-app `/api/ai/ask` call. On the WhatsApp auto-reply path,
`topK = 3` is fixed.

## 6. Answer generation

The answer is produced by an LLM given the top-K chunks as
context. The prompt is:

```
You are a CRM assistant. Use ONLY the chunks below to answer the
question. If the chunks do not contain enough information, respond
with the single word: UNKNOWN.

Chunks:
{joined_chunks}

Question: {question}

Answer:
```

The wrapper in `frontend/src/lib/aiPipeline.ts` enforces the
single-word `UNKNOWN` response by checking the model's first
non-empty token: if it is `UNKNOWN`, the pipeline returns a
fallback (the same shape as the WhatsApp-module `/api/ai/ask`
fallback, but with the CRM/RAG threshold (declared in
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3)
and a CRM-specific fallback message; see §7).

## 7. CRM-specific fallback message

When the pipeline returns a fallback (low confidence **or** the
model says `UNKNOWN`), the response is the fixed Indonesian
sentence:

```
Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …
```

> **This is a NEW fallback message scoped to the CRM module.** It is
> spelled **byte-identical** to the WhatsApp-module fallback in
> [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §2.8
> and
> [`../../../frontend/features/ai-chat/spec.md` §8](../../../frontend/features/ai-chat/spec.md).
> The reuse is intentional: the operator-facing Indonesian copy is
> locked. If a future i18n pass diverges the two, the
> `a-audit-doc` skill will flag the drift as a blocker.

## 8. States (file lifecycle)

| Status | UI |
|---|---|
| `pending` | grey chip "Menunggu" |
| `chunked` | yellow chip "Dipecah" |
| `embedded` | green chip "Siap" |
| `failed` | red chip "Gagal" with the `errorMessage` in a tooltip |

## 9. Out of scope

- Token-aware chunking.
- Multi-file cross-entity retrieval.
- Streaming the answer.
- Re-ranking (the mock returns chunks in score order; cross-encoder
  re-ranking is future work).

## 10. Cross-references

- Product framing: [`prd.md`](prd.md).
- Data shapes: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- AI auto-reply (the consumer on the WhatsApp path):
  [`../ai-autoreply/spec.md`](../ai-autoreply/spec.md).
- API contract: [`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).
