# Plan 17: LLM Gateway — MiniMax-M3 (OpenAI-Compatible) + Anthropic-Compatible Fallback + Retries

**Goal**: Ship the BE LLM gateway at `src/ai/llm/{openai-compat,anthropic-compat,prompt,parse,embed}.js` — a thin abstraction over MiniMax-M3 (via OpenAI-compatible endpoint by default) with an Anthropic-compatible fallback selectable via `LLM_PROVIDER` env var, structured-output calls with `response_format: json_schema`, 2-attempt exponential-backoff retry on 429/5xx, and a zod-based reject-and-retry loop (≤3 attempts) on parse failure.
**Owner**: @backend-dev
**Created**: 2026-07-03

## Status
- [x] `done`

## Dependencies
- _(none — the gateway has no DB dependency. Plan 18 consumes the embedder; Plan 19 consumes the parser; Plan 21 wires the gateway into the route handlers.)_

## Micro-Tasks

1. **Author `src/ai/llm/openai-compat.js` (MiniMax-M3 OpenAI-compatible client)**
   - Wrap the `openai@^4` SDK with a fixed configuration pointing at MiniMax-M3's OpenAI-compatible base URL.
   - Env vars (documented in `.env.example`):
     - `OPENAI_API_KEY` — MiniMax API key (reused name; this is the MiniMax key, not OpenAI's).
     - `OPENAI_BASE_URL` — defaults to `https://api.MiniMax.com/v1` (placeholder; replace at deploy time).
     - `LLM_MODEL` — defaults to `MiniMax-M3`.
     - `LLM_PROVIDER` — `'openai-compatible'` (default) or `'anthropic-compatible'`.
     - `LLM_MAX_RETRIES` — defaults to `2`.
   - Export `createChatCompletion({ systemPrompt, userPrompt, jsonSchema, signal, model })` returning `{ content: string, usage: { prompt_tokens, completion_tokens, total_tokens } }`.
   - When called with a `jsonSchema`, set `response_format: { type: 'json_schema', json_schema: { name: '…', schema: jsonSchema, strict: true } }`.
   - On `429` or `5xx`, retry with exponential backoff (`base = 500ms`, factor `2`, jitter `±20%`). Total attempts = `1 + LLM_MAX_RETRIES` (default 3).
   - On non-retryable errors (4xx other than 429, schema validation rejection), throw a typed `LlmPermanentError`.
   - **Acceptance**: a vitest spec mocks the OpenAI SDK and asserts: (a) one successful call passes the response through unchanged; (b) a 429 then 200 produces 2 calls and returns the second payload; (c) a 500/500/500 produces `LlmPermanentError` after 3 attempts; (d) `response_format: json_schema` is set when a schema is passed.

2. **Author `src/ai/llm/anthropic-compat.js` (Anthropic-compatible fallback)**
   - Mirror the same `createChatCompletion` interface but route through the Anthropic-compatible HTTP API at MiniMax (env: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`).
   - Implement `response_format: json_schema` by adding a tool named `emit_structured_output` whose `input_schema` matches the requested schema; force `tool_choice: { type: 'tool', name: 'emit_structured_output' }`. Parse the tool-call argument as the structured output.
   - Same retry policy as `openai-compat.js`.
   - The gateway picks the implementation at boot based on `LLM_PROVIDER` and exports a single `getLlmClient()` factory.
   - **Acceptance**: a vitest spec sets `LLM_PROVIDER=anthropic-compatible` (via env override) and asserts the Anthropic client is used; the same retry semantics hold; a `jsonSchema` request produces a tool call named `emit_structured_output`.

3. **Author `src/ai/llm/prompt.js` (user-message builder)**
   - Export `buildUserPrompt({ question, contextChunks, chatHistory, contactPhone }): string`.
   - Composes the user message in this exact order:
     ```
     <CONTEXT>                           // labeled block of cited chunks with marker numbers
     <CHUNK 1>
     [file=…, section=…, page=…]
     <text>
     <CHUNK 2>
     …
     </CONTEXT>
     <HISTORY>                           // last N turns (default N=6)
     <chat history lines>
     </HISTORY>
     <CONTACT_PHONE>                     // explicit scope reminder
     <phone number>
     </CONTACT_PHONE>
     <QUESTION>
     <user's question verbatim>
     </QUESTION>
     ```
   - `contextChunks` is the array returned by Plan 19's `hybridRetrieval()`. Each chunk is labeled `[1]`, `[2]`, …; the LLM is instructed to reference chunks by marker in its `citations` array.
   - `chatHistory` is an array of `{ role: 'user'|'assistant', content: string, timestamp: number }` (limited to last 6 turns).
   - **Acceptance**: a vitest snapshot test asserts the composed string is byte-stable across runs (no time-dependent fields, no randomness).

4. **Author `src/ai/llm/parse.js` (zod-based structured-output parser + reject-and-retry)**
   - Export `parseStructuredOutput({ rawText, schema, llmClient, systemPrompt, userPrompt, maxAttempts = 3 }): Promise<{ parsed: object, attempts: number }>`.
   - On the first call, parse `rawText` via `schema.safeParse(JSON.parse(rawText))`. On success, return immediately.
   - On parse failure (invalid JSON OR schema mismatch), re-call the LLM with the **same** systemPrompt + userPrompt + an additional instruction appended to the user message: `Your previous response did not match the required schema. Errors: <zod issues>. Please respond again with a valid JSON object.`. Repeat up to `maxAttempts` times.
   - After `maxAttempts`, throw `LlmParseError` carrying the last `zodError`.
   - The same module exports `RagAnswerSchema` (the zod schema for `{ answer, citations, confidence, fallback_used }` per Plan 19's contract) and `WhatsAppAutoReplyDecisionSchema` (the BE's `send | hold | none` decision per MVP.md §2.4 + `docs/crm/features/ai-autoreply/spec.md` §5).
   - **Acceptance**: a vitest spec feeds (a) valid JSON on first try → returns after 1 attempt; (b) invalid JSON on first try, valid on second → returns after 2 attempts; (c) invalid on all 3 attempts → throws `LlmParseError` with the last `zodError` attached.

5. **Author `src/ai/llm/embed.js` (MiniMax embeddings client + SHA-256 cache)**
   - Export `embedText(text: string): Promise<number[]>` returning a 1536-dim vector.
   - Uses the OpenAI-compatible client at MiniMax (same `OPENAI_API_KEY`/`OPENAI_BASE_URL`); env var `EMBEDDING_MODEL` defaults to `MiniMax-embed`.
   - Cache key = `sha256(text)` stored in a process-local `Map<string, number[]>`. (Process-local is fine for MVP — Phase 2 can swap to Redis.) The cache is bounded at 10 000 entries; LRU eviction.
   - On `429` or `5xx`, retry with the same backoff as the chat client. On `400` (input too long), chunk the text into ≤ 2000-token segments, embed each, and return the **mean** of the segment vectors.
   - **Acceptance**: a vitest spec asserts: (a) the same text returns the same vector (cache hit); (b) a 429 then 200 returns the second result; (c) a 6000-char text is split into 3 segments and returns a 1536-dim mean vector; (d) the LRU cache evicts at 10 001 entries.

6. **Author `src/ai/llm/index.js` (gateway namespace)**
   - Re-export `createChatCompletion`, `buildUserPrompt`, `parseStructuredOutput`, `embedText`, `RagAnswerSchema`, `WhatsAppAutoReplyDecisionSchema`.
   - Read `LLM_PROVIDER` at module load and instantiate the right client. Default = `'openai-compatible'`.
   - **Acceptance**: importing `src/ai/llm/index.js` does NOT call the network; the client factory is invoked lazily on the first `createChatCompletion` call. A vitest spec asserts the right module is selected for each `LLM_PROVIDER` value.

## Cross-References
- Source of truth for LLM provider choice: `docs/be/MVP.md` §1 #1 (MiniMax-M3, OpenAI-compat default, Anthropic-compat fallback via env).
- Retry & parse-retry policy: `docs/be/MVP.md` §2.4 (steps 6–7) + §3.5 defense-in-depth layer 2.
- Structured-output schema reference: `docs/be/MVP.md` §3.5 + §6 step 7 (the walkthrough example).
- Plan 15 (Postgres) for tables the gateway does NOT touch: `docs/crm/plans/15-db-layer-postgresql.md`.
- Plan 18 (KB ingestion) consumes `embedText`: `docs/crm/plans/18-kb-ingestion.md`.
- Plan 19 (Retrieval) consumes `buildUserPrompt` + `parseStructuredOutput`: `docs/crm/plans/19-retrieval-pipeline.md`.
- Plan 20 (WhatsApp trigger) consumes `createChatCompletion` + `WhatsAppAutoReplyDecisionSchema`: `docs/crm/plans/20-whatsapp-trigger-state-machine.md`.
- Plan 21 (REST endpoints) wires the gateway into Express routes: `docs/crm/plans/21-rest-endpoints.md`.

## Notes
- **MiniMax-M3 via OpenAI-compat by default.** The `openai@^4` SDK speaks OpenAI's wire format; MiniMax-M3 implements the same format. We do NOT swap in a MiniMax-specific SDK — we keep the SDK neutral so the Anthropic-compat fallback path can use the same retry/parse infrastructure.
- **Env-switchable Anthropic fallback.** `LLM_PROVIDER=anthropic-compatible` flips the gateway to the Anthropic path. The two paths share the same public interface (`createChatCompletion`, `embedText`) so callers do not branch on provider.
- **2-attempt retry, not 5.** MiniMax rate limits are tight; aggressive retry worsens the problem. 2 retries with backoff is the sweet spot per MVP.md §8.
- **3-attempt parse-retry on schema failure.** The parse path is a separate counter from the HTTP retry path; together they yield ≤ 6 total LLM calls in the worst case (2 HTTP × 3 parse).
- The gateway holds NO state besides the LRU embedding cache. There is no conversation memory; every call is stateless. Plan 20's trigger reads `chats.ai_mode` from Postgres and passes `chatHistory` (last 6 turns) explicitly.
- **No LLM framework** (langchain, llamaindex). MVP.md §4 explicitly forbids them. Direct HTTP calls only.
- The `RagAnswerSchema` zod object matches `docs/tech/crm-data-model.md` §4.5 (`RagAnswer` interface) field-for-field. The `WhatsAppAutoReplyDecisionSchema` matches the BE-side decision documented in `docs/be/features/ai-whatsapp-trigger/spec.md` §3.
- All LLM calls pass through `audit/log.js` (Plan 22). The `parse.js` retry loop emits one audit row per attempt so the audit log captures the full retry chain.
- On Anthropic-compat, the `emit_structured_output` tool is always defined; the prompt never asks the model to free-form JSON. This is the Anthropic-native way to enforce structured output.