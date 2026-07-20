# Plan 05: Knowledge Upload UI

**Goal**: Implement the `/crm/_knowledge` page from `docs/crm/features/knowledge-rag/spec.md` — file list grouped by entity, drag-and-drop / click-to-pick upload, the four-stage pipeline status (`pending → chunked → embedded → failed`) with retry, and the index-health panel (chunks count, last-ingested-at) — all wired against the Plan 02 mock layer with deterministic mock chunking and embedding.
**Owner**: @frontend-dev
**Created**: 2026-07-01

## Status
- [ ] `done`

## Dependencies
- Plan 01 (`01-ui-restructure.md`) — page lives at `/crm/_knowledge` inside the new shell.
- Plan 02 (`02-crm-workspace-and-mock-layer.md`) — types, mock endpoints, and `useKnowledge` hooks are prerequisites.

## Micro-Tasks

1. **Replace the `/crm/_knowledge` placeholder with the real knowledge page**
   - Create `frontend/src/pages/CrmKnowledgePage.tsx` rendering:
     - A header with the page title and an entity picker (shadcn `<Select>` populated from `useEntities()`).
     - A `FileList` table with columns: `Entity` (label), `Filename`, `Mime` (chip), `Size` (human-readable via `Intl.NumberFormat` with `unit: 'byte'`), `Status` (chip per lifecycle), `Chunks` (live count), `Uploaded` (`[YYYY-MM-DD HH:mm]`), `Actions` (`Open`, `Re-embed`, `Delete`) — per `docs/crm/features/knowledge-rag/spec.md` §2.
     - A drop zone (`<DropzoneArea>`) for upload; a per-entity upload button.
   - States: loading (6 skeleton rows), empty (`Belum ada file. Tarik file ke sini untuk mulai.`), error (red card + `Coba lagi`).
   - **Acceptance**: visiting `/crm/_knowledge` renders the file list against the mock; uploading a small `.md` file inserts a `pending` row that transitions through `chunked → embedded`; `pnpm typecheck` passes.

2. **Build the drag-and-drop / click-to-pick upload affordance**
   - Create `frontend/src/components/crm/knowledge/DropzoneArea.tsx` (TSX) using the native HTML5 `dragover` / `drop` events (no extra deps). On drop, validate each file against the constraints from `docs/crm/features/knowledge-rag/spec.md` §3:
     - Max 20 files per upload.
     - Max 25 MB per file.
     - Accepted mimes (first phase): `text/plain`, `text/markdown`, `application/pdf`, `text/csv`.
   - Reject non-matching files with an inline error chip listing the offending filename + reason. Match → enqueue via `useUploadKnowledgeFile()` (multipart base64 POST per `docs/frontend/api/api-spec.md` §6).
   - Show upload progress per file (use the `progress` value reported by `XHR.upload.onprogress` — switch from `fetch` to `axios`-free `XMLHttpRequest` only inside this hook; `fetch` is not progress-aware).
   - **Acceptance**: dropping a `.png` file is rejected with the correct message; dropping a valid `.md` file under 25 MB uploads and the new row appears in the list; dropping 21 files is rejected with `Maks 20 file per upload`; `pnpm typecheck` passes.

3. **Render the pipeline lifecycle chip + retry**
   - Create `frontend/src/components/crm/knowledge/StatusChip.tsx` mapping `KnowledgeFile.status` to colors and Indonesian copy per `docs/crm/features/knowledge-rag/spec.md` §8: `pending` (grey `Menunggu`), `chunked` (yellow `Dipecah`), `embedded` (green `Siap`), `failed` (red `Gagal` + tooltip with `errorMessage`).
   - On `Re-embed` (only enabled when `status === 'failed'`), call `useReEmbedKnowledgeFile()` (new hook added to Plan 02's `useKnowledge.ts` via `POST /api/crm/knowledge/files/:id/re-embed`); the mock handler resets `status` to `pending` and re-runs the deterministic chunker + SHA-256-based 1536-dim vector embedder.
   - **Acceptance**: a file in `failed` shows the red chip with tooltip; clicking `Re-embed` transitions the row back through `pending → chunked → embedded`; the chunks count updates after `chunked`; `pnpm typecheck` passes.

4. **Wire the deterministic mock chunker and embedder in the interceptor**
   - In `frontend/src/mock/interceptor.ts`, the `POST /api/crm/knowledge/upload` handler implements:
     - Chunking: simple character-based splitter, ≤ 800-char chunks with a 100-char overlap (per `docs/crm/features/knowledge-rag/spec.md` §4.1).
     - Embedding: deterministic 1536-dim vector via `crypto.createHash('sha256')` of the chunk text + a fixed seed, so retrieval results are stable across test runs (§4.3).
     - Status transitions: `pending` immediately on upload, then a `setTimeout`-driven promotion to `chunked` (50 ms) → `embedded` (50 ms) so the UI shows the lifecycle without spinning a real worker.
   - The store keys the chunks under `KnowledgeChunk.fileId`; deleting a file cascades.
   - **Acceptance**: a unit test in `frontend/src/mock/__tests__/knowledge.test.ts` asserts that chunking is deterministic (re-uploading the same file produces the same chunk count and the same SHA-256-derived vectors); an `embedded` file appears in the search results of `useReplyPreview` with the right chunk; `pnpm typecheck` passes.

5. **Add the index-health panel and `Delete` confirmation**
   - At the top of the page, an `IndexHealthPanel` shows aggregate counts: total files per status, total chunks across all entities, last `ingestedAt` per entity.
   - The `Delete` action on each row opens a shadcn `<AlertDialog>` confirming `Hapus file dan semua chunk-nya?` (per `docs/crm/features/knowledge-rag/prd.md`). On confirm, call `useDeleteKnowledgeFile()` and refetch the list.
   - **Acceptance**: the panel shows the right aggregate after a file upload; deleting a `embedded` file removes both the row and its chunks (verified by re-running the cross-contact leak test from Plan 04, which would otherwise find a dangling chunk); `pnpm typecheck` passes.

## Cross-References
- Page scope (file list, upload, pipeline, retry): `docs/crm/features/knowledge-rag/spec.md` §1–§4
- Mock vs real chunking/embedding: `docs/crm/features/knowledge-rag/spec.md` §4.3
- Status chip copy: `docs/crm/features/knowledge-rag/spec.md` §8
- Locked fallback sentence (the CRM/RAG-specific copy): `docs/crm/features/knowledge-rag/spec.md` §7; `docs/tech/chat-data-model.md` §2.8
- Data shapes: `docs/tech/crm-data-model.md` §2 (`KnowledgeFile`, `KnowledgeChunk`)
- Mock endpoints consumed: `docs/frontend/api/api-spec.md` §6 (`/api/crm/knowledge/files`, `/api/crm/knowledge/upload`, `/api/crm/knowledge/files/:id`)
- Plan 04 dependency: the cross-contact leak test in Plan 04 must still pass after this plan lands (deleting a file must cascade to its chunks).

## Notes
- Token-aware chunking, multi-file cross-entity retrieval, streaming, and re-ranking are out of scope per `docs/crm/features/knowledge-rag/spec.md` §9 — do NOT add them.
- The CRM/RAG-specific fallback message in `docs/crm/features/knowledge-rag/spec.md` §7 is spelled byte-identical to the WhatsApp module fallback; if Plan 02's `useAskAi()` ever needs to return that string, it imports from `frontend/src/lib/ai/fallbackMessage.ts` (the existing helper) — do NOT duplicate.
- Upload progress requires `XMLHttpRequest` inside the hook only; the rest of the codebase stays on `fetch` via `apiClient.ts`.
- Do NOT touch `src/`; everything is mocked in `frontend/src/mock/interceptor.ts`.