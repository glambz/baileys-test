# Plan 02: Shared Types and Mock Data

**Goal**: Author the TypeScript interfaces, zod schemas, and Indonesian mock data files (`Chat`, `Message`, `Contact`, `KnowledgeEntry`, `AuthStatus`) under `frontend/src/types/` and `frontend/src/mock/` so every later plan can import them with zero further setup.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 01 (`frontend/` scaffold exists; `@/*` path alias resolves; `pnpm typecheck` works against the new files).

## Micro-Tasks

1. **Copy the data model verbatim into `frontend/src/types/`**
   - Create `frontend/src/types/chat.ts`, `message.ts`, `contact.ts`, `knowledge.ts`, `ai.ts`, `auth.ts` whose `export interface` blocks are byte-equivalent to the corresponding sections of `docs/tech/chat-data-model.md` §2.1–§2.9 (`Chat`, `Message`, `Contact`, `KnowledgeEntry`, `AiAnswer`, `FallbackAiAnswer`, `Evidence`, `ConfidenceScore`, `AuthStatus`, `MessageDirection`, `MessageKind`).
   - Re-export them all from `frontend/src/types/index.ts` as a barrel.
   - **Acceptance**: `pnpm typecheck` passes; `import type { Chat, Message } from "@/types"` resolves from any future file under `frontend/src/`.

2. **Add the `contactLabel()` helper signature**
   - Create `frontend/src/lib/contactLabel.ts` that declares (no full implementation needed yet) the signature from `docs/tech/chat-data-model.md` §3:
     ```ts
     export function contactLabel(
       chat: Chat,
       contact: Contact | null,
       senderPn: string,
       groupName?: string,
       groupMetadata?: { creatorPn?: string; participantPns?: string[] }
     ): string;
     ```
   - For now, export a stub implementation that throws `new Error("contactLabel not yet implemented — see Plan 05")`. Plan 05 will replace the body. The signature is locked today so other plans can import it.
   - **Acceptance**: `pnpm typecheck` passes; the helper file imports resolve; the helper is the only file outside Plan 05 that touches the JID/LID → display rule.

3. **Seed Indonesian mock chats and contacts**
   - Create `frontend/src/mock/contacts.ts` exporting a `Contact[]` with 5 entries matching the seeded chats: Pak Hendro (`6285179652486`), Bu Sinta (`6281234567891`), Reza (`6281398765432`), Tim Marketing Q3 (`groupName`), and one anonymous 1:1 (`6281234567890`, **no** contact row — the "no-contact" branch is exercised via omission, not a placeholder).
   - Create `frontend/src/mock/chats.ts` exporting a `Chat[]` of 4–6 entries that mirror the Indonesian samples in `docs/frontend/features/chats/spec.md` §8.1–§8.4: Pak Hendro, Bu Sinta, Reza, the anonymous 1:1, the named group "Tim Marketing Q3", and one unnamed group whose `groupMetadata` has no extractable phone (so the `"Grup belum dinamai"` branch is exercised).
   - Every `Chat` must include `phone` derived from `Message.key.senderPn` per `docs/tech/chat-data-model.md` §2.1 — never parsed from the JID.
   - **Acceptance**: `pnpm typecheck` passes; the array has 5–6 entries; every seeded chat has a corresponding Indonesian `lastMessagePreview` ≤ 80 chars.

4. **Seed Indonesian mock messages**
   - Create `frontend/src/mock/messages.ts` exporting a `Map<ChatId, Message[]>` keyed by `Chat.id`; the value for each chat is the conversation snippet from `docs/frontend/features/chats/spec.md` §8.1–§8.4 (Pak Hendro ~7 turns, Bu Sinta ~3, Reza ~3, anonymous ~2, group ~3).
   - Every inbound (`direction: "in"`) 1:1 `Message` must include `key.senderPn`; status broadcast messages must NOT include `phone` on the parent `Chat` (matches the data-model invariant).
   - Timestamps are Unix seconds (not ms) per `docs/tech/chat-data-model.md` §1.
   - **Acceptance**: `pnpm typecheck` passes; `Map.size === chats.length`; every `Message.key.senderPn` matches the seeded phone; every `Message.timestamp` is in seconds (e.g. `1751290800`, not `1751290800000`).

5. **Seed Indonesian mock knowledge base**
   - Create `frontend/src/mock/knowledge.ts` exporting a `KnowledgeEntry[]` of at least 12 entries covering the Indonesian pricing/FAQ/campaign topics so retrieval has enough surface area. Include at least one high-confidence entry (`k-014` pricing Bulanan), one medium-confidence entry (`k-007` pricing Mingguan), and three off-topic entries with deliberately low lexical overlap (e.g. "Bagaimana cara reset password admin?", "Apa beda HTML dan CSS?", "Jadwal libur kantor 2026?") so the fallback path is exercised.
   - Every entry includes `id`, `question`, `answer`, `source` (e.g. `"internal/pricing-2026Q3.md"`), `tags`, and `updatedAt` (Unix seconds).
   - **Acceptance**: `pnpm typecheck` passes; `knowledge.length >= 12`; at least 3 entries have negative-test overlap characteristics (no Indonesian pricing keywords in question or answer).

6. **Seed mock AI retrieval, auth, and a single barrel**
   - Create `frontend/src/mock/ai.ts` exporting `searchKnowledge(question: string, topK = 3): Array<{ entry: KnowledgeEntry; confidence: number }>` — a brute-force Jaccard-over-Indonesian-tokens implementation (NOT the full `/api/ai/ask` endpoint; Plan 04 wraps this in an endpoint-shaped function). The function must produce confidence in `[0, 1]` and return entries sorted by confidence DESC.
   - Create `frontend/src/mock/auth.ts` exporting `getAuthStatus(): AuthStatus` that returns `{ connected: true, state: "open", userJid: "6281234567890@s.whatsapp.net", userName: "Indocyber Studio", lastUpdatedAt: <now-seconds> }`.
   - Create `frontend/src/mock/index.ts` that re-exports `chats`, `messages`, `contacts`, `knowledge`, `auth`, `searchKnowledge`.
   - **Acceptance**: `pnpm typecheck` passes; `searchKnowledge("Berapa harga paket Bulanan?")[0].confidence > 0.85` for the seeded pricing entry; `searchKnowledge("xyz nonsense gibberish qwerty")[0].confidence < 0.65` for the negative-test set.

## Cross-References
- Interface sources: `docs/tech/chat-data-model.md` §2.1–§2.9 (every interface byte-equivalent), §3 (`contactLabel()` signature), §3.1 (JID/LID boundary).
- Mock content sources: `docs/frontend/features/chats/spec.md` §8.1–§8.4 (Indonesian chat snippets), `docs/frontend/features/ai-chat/spec.md` (knowledge base topics + threshold `0.65`).
- Module overview: `docs/frontend/general/MODULE_OVERVIEW.md` §5 (mock-vs-real table — Plan 02 implements the mock column).
- API contract that the mock must satisfy: `docs/frontend/api/api-spec.md` §2.1–§2.5.

## Notes
- Every Indonesian placeholder must be **byte-identical** to the SSoT: `"Grup belum dinamai"`, `"Status"`, the fallback sentence `"Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …"`. Do not rewrite or localize here.
- Mark every mock-only field (`pinned`, `muted`, `archived`, `mock-` prefixed ids, artificial delays) with a `/* mock-only */` comment per `docs/frontend/api/api-spec.md` §3.
- Do **not** introduce the full `/api/ai/ask` or `/api/chats` request/response handling — that is Plan 04.
- Do **not** implement the contact display rule body yet — Plan 05 owns `contactLabel()`. The stub must throw to make accidental use loud.