# Plan 22: Audit Log — pino Structured NDJSON to `./data/audit/<date>.ndjson`

**Goal**: Ship `src/ai/audit/log.js` — a pino-based structured audit logger that writes one NDJSON line per event to `./data/audit/<YYYY-MM-DD>.ndjson`. Every state-changing operation (Plan 20's trigger, Plan 21's endpoints, Plan 18's ingest) emits one audit row per attempt so the full retry chain is captured.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- Plan 20 (`20-whatsapp-trigger-state-machine.md`) — trigger writes audit rows for `auto_reply_sent` / `auto_reply_hold` / `state_transition` events.
- Plan 21 (`21-rest-endpoints.md`) — every REST endpoint writes an audit row on completion (success OR failure).

## Micro-Tasks

1. **Author `src/ai/audit/log.js` (NDJSON append-only logger)**
   - Use `pino` (already in the project's manifest per MVP.md §4) with a custom transport that writes to `./data/audit/<YYYY-MM-DD>.ndjson` (one file per UTC date).
   - Append-only: each call to `audit(eventType, payload)` opens the file in `'a'` mode (created if missing), writes one JSON line (`JSON.stringify({ ts, eventType, ...payload })` + `\n`), and closes the file. File handle is NOT held open across calls (defense-in-depth for crash safety).
   - `audit` is async; callers `await` it in error paths and fire-and-forget it in success paths.
   - Sensitive fields are redacted before writing: `apiKey`, `password`, `authorization`, `cookie`, `*.token`. Use pino's `redact` option.
   - The log directory `./data/audit/` is created at startup if missing (a `mkdir -p` in `src/index.js`'s boot sequence).
   - **Acceptance**: vitest spec calls `audit('test_event', { foo: 'bar' })` 3 times; the resulting file at `./data/audit/<today>.ndjson` has exactly 3 lines, each a valid JSON object with `ts` (ISO 8601), `eventType='test_event'`, and the payload.

2. **Define the audit event schema (locked vocabulary)**
   - `auto_reply_sent` — `{ chatId, tenantId, confidence, citations: number, retrievalScore, latencyMs, llmModel, llmProvider }`.
   - `auto_reply_hold` — `{ chatId, tenantId, reason: 'turbo_cutoff'|'confidence_low'|'parse_failure'|'scope_violation'|'ungrounded_citation', confidence?, retrievalScore?, llmAttempts?, parseAttempts? }`.
   - `state_transition` — `{ chatId, tenantId, fromMode, toMode, reason, actor: 'system'|'operator' }`.
   - `llm_call` — `{ chatId?, tenantId, model, provider, promptTokens, completionTokens, latencyMs, attempt, status: 'success'|'retry'|'permanent_failure' }`.
   - `kb_ingest` — `{ fileId, tenantId, status: 'started'|'indexed'|'failed', chunksCount?, error?, latencyMs }`.
   - `endpoint_hit` — `{ method, path, status, latencyMs, requestId }`.
   - Each event also carries `ts` (ISO 8601 UTC) and `tenantId`.
   - **Acceptance**: a vitest spec asserts each event type produces a JSON object with all required fields; missing fields throw at write time (schema validation via zod).

3. **Wire audit calls into Plan 20's trigger (step 14)**
   - After `sendReply`, write `auto_reply_sent` with the full payload.
   - On each hold branch (turbo / confidence / parse / scope / ungrounded), write `auto_reply_hold` with the matching `reason`.
   - On every state transition, write `state_transition`.
   - **Acceptance**: vitest spec runs the trigger end-to-end with a mocked LLM; the audit file contains at least one `auto_reply_sent` or `auto_reply_hold` row AND a `state_transition` row per Plan 20 step.

4. **Wire audit calls into Plan 21's endpoints**
   - Every handler writes an `endpoint_hit` row at the end of its lifecycle (in a `try/finally` block to ensure the row is written on both success and failure).
   - The handler generates a `requestId` (uuid v4 or `nanoid`) at the top of each request and passes it down to the audit row. This `requestId` is also returned in the response header `x-request-id` for operator debugging.
   - **Acceptance**: vitest spec hits each of the 14 endpoints with `supertest`; the audit file contains an `endpoint_hit` row per hit, each with the matching `requestId` echoed in the response header.

5. **Wire audit calls into Plan 18's ingest**
   - On `ingestFile` start, write `kb_ingest` with `status='started'`.
   - On success, write `kb_ingest` with `status='indexed'` and `chunksCount`.
   - On failure, write `kb_ingest` with `status='failed'` and `error` (truncated to 500 chars).
   - **Acceptance**: vitest spec runs `ingestFile` against the sample PDF; the audit file contains 2 rows for that fileId: one `started`, one `indexed`. A failure-path spec asserts the `failed` row carries the error message.

6. **Author `src/ai/audit/redact.js` (centralized redaction helper)**
   - Export `redactPayload(payload)` that deep-clones `payload` and replaces any value at a path matching `/api[-_]?key/i`, `/password/i`, `/authorization/i`, `/cookie/i`, `/token$/i` with `'[REDACTED]'`.
   - Used by `audit` before serialization.
   - **Acceptance**: vitest spec feeds `{ apiKey: 'sk-123', nested: { password: 'pw' } }`; the redacted output has `'[REDACTED]'` at both paths.

7. **Add `pnpm script:audit-tail` for operator debugging**
   - A small Node script that tails the current day's audit file with optional `--filter=<eventType>` and `--since=<isoTimestamp>` flags.
   - The script is read-only and does not modify any files.
   - **Acceptance**: running `pnpm script:audit-tail --filter=auto_reply_hold` against a populated audit file prints only `auto_reply_hold` rows in reverse-chronological order.

## Cross-References
- Audit log path: `docs/be/MVP.md` §2.1 (`src/ai/audit/log.js`) + §4 (pino in deps).
- Trigger events to audit: `docs/crm/plans/20-whatsapp-trigger-state-machine.md` (steps 13, hold branches, transitions).
- Endpoint events to audit: `docs/crm/plans/21-rest-endpoints.md` (every endpoint).
- Ingest events to audit: `docs/crm/plans/18-kb-ingestion.md` (started / indexed / failed).
- Compliance export (Phase 3): `docs/be/MVP.md` §7 (not implemented in this cycle).
- pino configuration: existing usage in `src/index.js` (already configured for stdout logging; this plan adds the file transport).

## Notes
- **NDJSON to `./data/audit/<date>.ndjson`.** One file per UTC day, append-only. Operators tail with `pnpm script:audit-tail` or with `jq`. No log rotation in this cycle (MVP scope) — Phase 3 adds daily compression + S3 export.
- **One row per attempt.** The parse-retry chain in Plan 17 produces multiple `llm_call` rows (one per attempt) so the audit log shows the full retry history. The trigger's `auto_reply_hold` row is written ONCE at the end (with `parseAttempts` summing the chain).
- **`requestId` for correlation.** Every `endpoint_hit` row carries a `requestId` that's echoed in the response header `x-request-id`. Operators copy the header value into `pnpm script:audit-tail --request=<id>` to see all related rows.
- **No PII logging.** Message bodies are NOT logged by default; only chat IDs (JIDs) and tenant IDs. The `message.body` is intentionally absent from audit payloads to avoid leaking user content into the audit file.
- **Append-only — no rotation, no deletion.** The audit file is append-only for the MVP. Operators archive files manually if needed. Phase 3 adds automatic compression + cold storage.
- The audit log is **separate** from the existing pino stdout logger. The stdout logger continues to emit human-readable lines for development; the audit file is structured for tools.
- **The audit file MUST be on a separate filesystem** in production (per MVP.md §8 mitigation). For local dev, `./data/audit/` is fine.