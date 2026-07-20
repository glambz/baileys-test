# Plan 04: API Client and Mock Handler

**Goal**: Build the thin fetch-based API client, the MSW-style mock request handler that intercepts every `[mock]` endpoint declared in `docs/frontend/api/api-spec.md` §2, the TanStack Query hooks (`useChats`, `useMessages`, `useSendMessage`, `useAskAi`, `useAuthStatus`), and the `AuthStatusBanner` so that components below the `AppShell` can call `useChats()` and receive seeded mock data with **zero** real network calls.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (Vite + TanStack Query scaffold).
- Plan 02 (types + mock data files; the API handler delegates to `frontend/src/mock/*`).
- Plan 03 (`AppShell` exists so the banner can mount; not strictly required but required to visually verify the banner renders).

## Micro-Tasks

1. **Create the `apiClient` and zod-validated responses**
   - Create `frontend/src/lib/apiClient.ts` exporting `apiClient<T>(path: string, init?: RequestInit): Promise<T>` that:
     - prefixes every path with `/api`,
     - sets `Content-Type: application/json` when `init.body` is a string,
     - parses the response as JSON,
     - throws an `ApiError` (custom class with `.status`, `.code`, `.message`) when `!response.ok`, mapping the body to `{ code, message, details }`.
   - Create `frontend/src/lib/contract.ts` exporting zod schemas (`ChatSchema`, `MessageSchema`, `ContactSchema`, `KnowledgeEntrySchema`, `AiAnswerSchema`, `FallbackAiAnswerSchema`, `AuthStatusSchema`, `EvidenceSchema`) that mirror `docs/tech/chat-data-model.md` §2. The schemas are used at the boundary in step 2.
   - **Acceptance**: `pnpm typecheck` passes; `apiClient("/chats")` against the un-started mock throws `Error("No mock handler registered — did Plan 04 install the interceptor?")` (the interceptor is installed in step 3).

2. **Write the mock endpoint handlers**
   - Create `frontend/src/mock/handler.ts` exporting an object map: `{ "GET /api/chats": ..., "GET /api/chats/:id/messages": ..., "POST /api/chats/:id/messages": ..., "POST /api/ai/ask": ..., "GET /api/auth/status": ... }`. Each handler is an `(params, body) => Promise<Response>` factory.
   - `GET /api/chats` → returns `{ chats: [...mock chats] }`, validates response with `z.array(ChatSchema)`.
   - `GET /api/chats/:id/messages` → returns the chat's seeded messages, validates with `z.array(MessageSchema)`. Supports `?limit=` and `?before=`.
   - `POST /api/chats/:id/messages` → validates body with `z.object({ body: z.string().trim().min(1).max(4096) })`, returns the new `Message` after a 400 ms artificial delay, **always** with `direction: "out"` and a fresh `mock-msg-<ulid>` id.
   - `POST /api/ai/ask` → validates body, runs `searchKnowledge(question, topK)`; if `top1.confidence >= 0.65` returns `AiAnswer` (kind `"answered"`), otherwise `FallbackAiAnswer` (kind `"fallback"`) with `message` set to the **byte-identical** Indonesian fallback sentence from `docs/frontend/features/ai-chat/spec.md` §8 and a `suggestion` pointer to the highest-scoring rejected candidate.
   - `GET /api/auth/status` → returns the seeded `AuthStatus`.
   - **Acceptance**: every handler returns a `Response` with the JSON body shape exactly matching `docs/frontend/api/api-spec.md` §2.1–§2.5; the fallback handler emits the byte-identical sentence.

3. **Install the request interceptor**
   - Create `frontend/src/mock/interceptor.ts` exporting `installMockInterceptor(): void` which:
     - monkey-patches `globalThis.fetch` so that any request whose `url` starts with `/api/` is routed through the handler map from step 2 (synthesizes a `Request` from `(input, init)`, resolves to a `Response` constructed in-memory with the handler's JSON body, and **never** touches the network).
     - returns early without modification when `import.meta.env.VITE_USE_REAL_API === "true"` (so Plan N can flip the env var later without code changes).
   - Call `installMockInterceptor()` exactly once at the top of `frontend/src/main.tsx` before `createRoot(...).render(...)`.
   - **Acceptance**: in the browser devtools network tab, navigating the app issues **zero** requests to any host (including `localhost`). The DevTools "Network" panel shows no `Fetch/XHR` rows after a hard refresh.

4. **Add the TanStack Query hooks**
   - Create `frontend/src/hooks/useChats.ts` exporting `useChats()` → `{ data: Chat[]; isLoading; isError; error; refetch; isFetching }` keyed on `["chats"]`. Returns `data ?? []` to keep consumers simple.
   - Create `frontend/src/hooks/useMessages.ts` exporting `useMessages(chatId: string | null)` keyed on `["messages", chatId]`; disabled when `chatId` is null.
   - Create `frontend/src/hooks/useSendMessage.ts` exporting `useSendMessage(chatId: string)` returning a mutation that:
     - on `mutate({ body })` performs the optimistic update (insert a `Message` with `id: "optimistic-" + crypto.randomUUID()` into the `["messages", chatId]` cache),
     - on success replaces the optimistic entry by id with the server-returned `Message`,
     - on error rolls back the optimistic insert and surfaces the error to the caller.
   - Create `frontend/src/hooks/useAskAi.ts` exporting `useAskAi()` returning a mutation that posts to `/api/ai/ask`; rejects any `kind: "answered"` response whose `confidence < 0.65` by downgrading it to a `FallbackAiAnswer` (the belt-and-braces guard from `docs/frontend/features/ai-chat/spec.md` §7).
   - Create `frontend/src/hooks/useAuthStatus.ts` exporting `useAuthStatus()` keyed on `["auth", "status"]` with `refetchInterval: 30_000`.
   - **Acceptance**: in a temporary dev console probe, `useChats()` returns the 5–6 seeded chats within one tick of mount; the network tab stays empty; calling `useSendMessage("mock-01").mutate({ body: "test" })` produces a `Message` whose `id` starts with `mock-msg-` (not `optimistic-`) after ~400 ms.

5. **Add the `AuthStatusBanner` component**
   - Create `frontend/src/components/layout/AuthStatusBanner.tsx` rendering a small pill in the top-right of the `AppShell`. Colors and icons per `docs/frontend/features/chats/spec.md` §7:
     - `state === "open"` → green dot, label `"Terhubung"`.
     - `state === "qr"` or `"connecting"` → yellow, label `"Menghubungkan"`.
     - `state === "close"` → red, label `"Tidak terhubung"`.
   - Tooltip shows `lastUpdatedAt` formatted with dayjs (`YYYY-MM-DD HH:mm`).
   - The component renders a skeleton (shadcn `Skeleton`) while `isLoading`; on `isError` renders a small red exclamation chip.
   - **Acceptance**: in the running app the top-right of every route shows the green `"Terhubung"` pill with a tooltip containing a timestamp; the pill survives route changes.

## Cross-References
- API contract: `docs/frontend/api/api-spec.md` §2.1 (`GET /api/chats`), §2.2 (`GET /api/chats/:id/messages`), §2.3 (`POST /api/chats/:id/messages`), §2.4 (`POST /api/ai/ask` — fallback sentence byte-identical), §2.5 (`GET /api/auth/status`), §3 (mock-only field markers).
- Data shapes: `docs/tech/chat-data-model.md` §2 (zod schemas), §3.1 (display layer reads from `senderPn`/contact only — Plan 04 respects this in the auth banner, which renders `userName` from the seeded mock, not the JID).
- Stack: `docs/tech/frontend-stack.md` §2 (TanStack Query 5), §3 (lucide-react for the dot icon), §4 (zod at the boundary).
- Module scope: `docs/frontend/general/MODULE_OVERVIEW.md` §5 (mock-vs-real boundary; this plan owns the mock column).
- AI threshold & fallback: `docs/frontend/features/ai-chat/spec.md` §4 (threshold `0.65`), §7 (no-hallucination guard), §8 (byte-identical fallback sentence).

## Notes
- The interceptor **must** be installed before any component mounts. The safest placement is the first line of `frontend/src/main.tsx`, before `createRoot`.
- The interceptor is intentionally naïve (only matches `/api/` prefix). Do not add routing for `/api/v2`, `/api/auth/init`, etc. — those are out of scope per `docs/frontend/general/MODULE_OVERVIEW.md` §2.2.
- Mark every mock-only field with a `/* mock-only */` comment in the handler, per `docs/frontend/api/api-spec.md` §3.
- The `useSendMessage` optimistic id format (`optimistic-<uuid>`) must match `docs/frontend/features/chats/spec.md` §5 exactly — Plan 06 relies on this prefix for replacement.
- Do **not** introduce MSW or any other network mocking library — the in-app interceptor is simpler and matches "mock layer is a folder" from `docs/frontend/general/MODULE_OVERVIEW.md` §5. MSW may be adopted in a later phase per `docs/tech/frontend-stack.md` §5.