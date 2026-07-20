# Module Overview — `frontend/`

> Single source of truth for the new Vite + React 18 + TypeScript frontend
> module that operates against a **mock** data layer. No Baileys backend
> integration in this phase.

## 1. Purpose

This module is a **user-facing dashboard** for the WhatsApp Baileys REST API
that already lives in `src/`. It lets the operator:

1. See a list of recent conversations (the **Chats** page).
2. Open any chat, read its history, and **reply directly** to the contact
   from the UI.
3. Ask the **AI Chat** a natural-language question about anything stored in
   the local knowledge base, and receive an answer **only if** the system is
   confident enough — never a hallucination.

The frontend is built **mock-first**. The mock layer in the frontend is the
contract that the future Baileys backend must satisfy; see
[`docs/frontend/api/api-spec.md`](../api/api-spec.md) for the endpoint
shapes and [`docs/tech/chat-data-model.md`](../../tech/chat-data-model.md)
for the data shapes.

## 2. Scope

### 2.1 In scope (Phase 2 — mock)

- Vite + React 18 + TypeScript single-page app under `frontend/`.
- Two top-level routes: `/chats` and `/ai-chat`.
- A mock API layer (in-memory) that returns the shapes defined in
  [`docs/frontend/api/api-spec.md`](../api/api-spec.md).
- Indonesian-language mock chat content, seeded from the style of the
  existing `inbox_logs/*.md` files.
- A mock knowledge base (hardcoded TypeScript data) for the AI Chat page.
- Evidence / citation display, confidence badges, low-confidence fallback.

### 2.2 Out of scope (Phase 2)

- Wiring the frontend to the live Baileys backend in `src/`.
- Real QR-code rendering, real message sending, real authentication.
- Media uploads (images, voice, documents) — the mock only carries text.
- Persistence between page reloads (the mock is in-memory).
- Production deployment, environment configuration, CI.

These will be tackled in a future phase whose plan lives at
[`docs/frontend/plans/README.md`](../plans/README.md) once the Planner
populates it.

## 3. Stack (locked)

| Item | Version | One-line justification |
|---|---|---|
| Vite | 5.x | Fast HMR, ESM-native, replaces the deprecated CRA toolchain. |
| React | 18.x | Stable concurrent rendering, mature ecosystem, required by shadcn/ui. |
| TypeScript | 5.x | Compile-time safety for the data shapes in [`chat-data-model.md`](../../tech/chat-data-model.md). |
| Tailwind CSS | 3.x | Utility-first; pairs natively with shadcn/ui's copy-paste components. |
| shadcn/ui | latest | Accessible Radix-based primitives that ship as owned source — no version-lock risk. |
| React Router | 6.x | Data-router APIs and lazy-route loading for `/chats` and `/ai-chat`. |
| TanStack Query | 5.x | First-class loading / error / cache states for the mock API layer. |
| Zustand | 4.x | Tiny store for the auth-status banner and last-seen chat ID. |
| lucide-react | latest | Tree-shakable icon set used across both pages. |
| dayjs | 1.x | Tiny date formatter for `[YYYY-MM-DD HH:mm]` chat timestamps. |
| zod | 3.x | Validates mock API responses and the AI knowledge shape at the boundary. |

The detailed rationale lives in [`docs/tech/frontend-stack.md`](../../tech/frontend-stack.md).

## 4. Route map

| Path | Page | Purpose |
|---|---|---|
| `/` | redirect | Sends the user to `/chats`. |
| `/chats` | Chats | Sidebar list of conversations plus a thread panel. |
| `/chats/:chatId` | Chats | Same page, thread panel focused on the chat with id `chatId`. |
| `/ai-chat` | AI Chat | Single-column Q&A interface backed by the knowledge base. |
| `*` | NotFound | Plain "Page not found" card; included so router tests can hit it. |

## 5. Mock vs Real boundary

Everything in this module currently runs against an **in-memory mock**. The
boundary is a single folder (`frontend/src/mock/`) that returns Promises
matching the API contract in [`docs/frontend/api/api-spec.md`](../api/api-spec.md).
Swapping the mock for the real Baileys backend later is a **one-file
change** per endpoint — the React components and TanStack Query hooks do
not change.

| Concern | Mock (now) | Real (future) |
|---|---|---|
| Chat list | Hardcoded array in `frontend/src/mock/chats.ts` | `GET /api/chats` (see [`api-spec.md`](../api/api-spec.md)) |
| Message history | Hardcoded `Message[]` per chat in `frontend/src/mock/messages.ts` | `GET /api/chats/:id/messages` |
| Send a message | Resolves after a 400 ms artificial delay with a fabricated id | `POST /api/chats/:id/messages` → `POST /api/messages/send` (see `src/routes/messages.js:1`) |
| AI answer | Brute-force cosine over hardcoded `KnowledgeEntry[]` in `frontend/src/mock/knowledge.ts` | `POST /api/ai/ask` (future) |
| Auth status | Returns `{ connected: true }` immediately | `GET /api/auth/status` (see `src/routes/auth.js:11`) |

No field in the mock is invented beyond what's documented in
[`chat-data-model.md`](../../tech/chat-data-model.md).

## 6. Glossary

| Term | Definition |
|---|---|
| **Chat** | A 1:1 conversation, group, or status broadcast. Same shape regardless of kind; distinguished internally by the JID suffix. |
| **Contact** | A row in the address book. Holds a stable `displayName`, an optional `groupName` for groups, and is matched to chats by phone. |
| **JID** | WhatsApp's internal routing identifier. Suffix encodes kind: `@s.whatsapp.net` (1:1), `@g.us` (group), `status@broadcast` (status), `@lid` (privacy-mapped). Internal only — never rendered to the user; see §7. |
| **Phone** | The E.164 digits only — no `+`, no spaces. e.g. `6281234567890`. Display source for 1:1 chats via `Message.key.senderPn`. |
| **LID** | WhatsApp's privacy-mapped identifier (suffix `@lid`). Internal only — never rendered to the user; see §7. The display layer does not need to resolve a LID because every `Message` carries `key.senderPn`. |
| **Knowledge entry** | One Q/A fact in the AI knowledge base. Has an `id`, `question`, `answer`, optional `tags`, and a `source` citation. |
| **Confidence score** | A number in `[0, 1]` produced by the mock retrieval. Compared against the threshold `0.65` to decide whether to answer or fall back. |
| **Evidence** | The set of `KnowledgeEntry` references shown alongside a non-fallback AI answer: each item includes the entry id, a one-line excerpt, and a `source` citation. |
| **Fallback** | The fixed Indonesian sentence returned when no entry meets the confidence threshold. See [`ai-chat/spec.md`](../features/ai-chat/spec.md) for the exact wording. |

## 7. Contact display rule — no JID, no LID in UI

**Invariant:** every label is one of {group name, contact name, phone number, "Status"}.

This rule is authoritative for the whole module and is restated identically
in [`docs/frontend/features/chats/spec.md`](../features/chats/spec.md),
[`docs/frontend/features/chats/prd.md`](../features/chats/prd.md), and
[`docs/tech/chat-data-model.md`](../../tech/chat-data-model.md).

> The contact display label is one of: group name, contact name, or phone number.
> JIDs (`@s.whatsapp.net`, `@g.us`, `@lid`, `status@broadcast`) and LID nodes are internal routing identifiers only and must never be rendered to the user.
> The display source for a 1:1 chat is `Message.key.senderPn` (always present on every `messages.upsert` from Baileys). The contact book is matched on phone, so the display chain is:
>
> 1. 1:1 chat, contact known — `Contact.displayName`. Example: chat with phone `6285179652486`, `Contact.displayName = "Pak Hendro"` → render "Pak Hendro".
> 2. 1:1 chat, contact unknown — `Message.key.senderPn` formatted as `+<CC> <first-3>-<next-4>-<last-4>`. Example: `senderPn = "6281234567890"` → render "+62 812-3456-7890".
> 3. Group chat (`@g.us`), group named — `Contact.groupName`. Example: "Tim Marketing Q3".
> 4. Group chat (`@g.us`), group unnamed — extract a phone from the group JID metadata when present (creator phone, participant phone, etc.) and apply rule 1 or 2. When no phone is extractable, render the Indonesian placeholder "Grup belum dinamai" — no JID digits, no number, no LID.
> 5. Status broadcast (`status@broadcast`) — render the literal "Status". (This is the one degenerate case where no phone is available; it is not a "number" but is a fixed, human-readable label.)
>
> The "unmappable LID" case is not reachable: every `Message` carries `key.senderPn`, so the display layer always has a phone for 1:1 chats. `@lid` JIDs are used internally for routing only and are stripped before any rendering.

### 7.1 Browser-level enforcement (UI audit, 2026-07-09)

The rule above is enforced at **three** independent layers, the third
of which is a real-browser audit run on every `@frontend-dev` plan:

1. **TypeScript** — `contactLabel()` (signature in
   [`../../tech/chat-data-model.md`](../../tech/chat-data-model.md) §3)
   returns one of the allowed labels only.
2. **Static review** — the chat-row components forbid `chat.jid`,
   `remoteJid`, `@lid`, `senderPn` in JSX text via lint and via the
   `**Acceptance**` lines in each owning plan.
3. **Browser audit (mandatory)** — the Auditor's `a-audit-ui` skill
   (see §11 below and
   [`.kilo/skills/a-audit-ui/SKILL.md`](../../../.kilo/skills/a-audit-ui/SKILL.md))
   drives `browser-use` against the running Vite dev server and scans
   `document.body.innerText` for the regex
   `/@s\.whatsapp\.net|@g\.us|@lid|status@broadcast/i`. A single match
   is a **blocker** (severity: blocker, error code `E006`). The audit
   captures a screenshot of every sidebar / thread-header state and
   writes it to `.kilo/audit-history/screenshots/<run_id>/<plan_id>/`.

## 8. AI confidence threshold (module-wide)

The confidence threshold for the AI Chat is **`0.65`**. Stated identically
in [`docs/frontend/features/ai-chat/spec.md`](../features/ai-chat/spec.md),
[`docs/frontend/features/ai-chat/prd.md`](../features/ai-chat/prd.md), and
[`docs/tech/chat-data-model.md`](../../tech/chat-data-model.md).

## 9. Cross-references

- Feature specs: [`features/chats/spec.md`](../features/chats/spec.md),
  [`features/ai-chat/spec.md`](../features/ai-chat/spec.md).
- PRDs: [`features/chats/prd.md`](../features/chats/prd.md),
  [`features/ai-chat/prd.md`](../features/ai-chat/prd.md).
- API contract: [`api/api-spec.md`](../api/api-spec.md).
- Data shapes: [`tech/chat-data-model.md`](../../tech/chat-data-model.md).
- Stack decisions: [`tech/frontend-stack.md`](../../tech/frontend-stack.md).
- Future plans: [`plans/README.md`](../plans/README.md).

## 10. Coexistence with the CRM module

The CRM + RAG module under [`../../crm/general/MODULE_OVERVIEW.md`](../../crm/general/MODULE_OVERVIEW.md)
ships alongside this module. The two modules share the frontend
shell and the database (the CRM uses Postgres; the WhatsApp
backend in `src/` does not touch the CRM tables in this run).

### 10.1 What the CRM module does NOT change

- AI confidence threshold `0.65` (this module, §8) — preserved.
- Indonesian placeholder `"Grup belum dinamai"` (§7) — preserved.
- Contact display rule (§7) — preserved, including the `senderPn`
  display source.
- Locked Indonesian fallback sentence (§8 of
  [`../features/ai-chat/spec.md`](../features/ai-chat/spec.md)) —
  preserved.
- Stack pins (§3, and [`../../tech/frontend-stack.md`](../../tech/frontend-stack.md)) —
  preserved.
- The route map in §4 — preserved. The CRM module **adds**
  `/crm` and `/ai`; it does not modify `/chats`, `/ai-chat`, or
  any other existing path. `/ai-chat` becomes a permanent alias
  of `/ai` (see [`../crm/features/navigation/spec.md` §2](../../crm/features/navigation/spec.md)).

### 10.2 What the CRM module ADDS

- A third Pane 1 selection in the navigation shell (`CRM`,
  `AI`) — see [`../crm/features/navigation/spec.md`](../../crm/features/navigation/spec.md).
- Five storage tables: `entity_definitions`, `entity_records`,
  `entity_relationships`, `knowledge_files`, `knowledge_chunks` —
  see [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §2.
- A new CRM/RAG confidence threshold (declared in
  [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3),
  distinct from this module's `0.65`.
- A new `AIReplyMode` state machine in
  [`../../tech/ai-reply-state-machine.md`](../../tech/ai-reply-state-machine.md).
- A new endpoint surface in
  [`../api/api-spec.md` §6](../api/api-spec.md); every new endpoint
  is tagged `[mock]` until the backend lands.

### 10.3 The two confidence thresholds, side by side

| Threshold | Applies to | Endpoint | Source |
|---|---|---|---|
| `0.65` | the legacy WhatsApp-module `/api/ai/ask` (this module, §8) | `POST /api/ai/ask` | [`../api/api-spec.md` §2.4](../api/api-spec.md) |
| CRM/RAG (see [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3) | the new CRM/RAG pipeline, both in-app and WhatsApp auto-reply | `POST /api/crm/ai/ask` and `POST /api/whatsapp/auto-reply` | [`../../tech/crm-data-model.md`](../../tech/crm-data-model.md) §3 |

The two thresholds are **not** interchangeable. A future refactor
that unifies them must go through the `pm-doc-audit` cycle.

### 10.4 What the CRM module does to the API spec

The CRM module extends
[`../api/api-spec.md`](../api/api-spec.md) with a new §6 "CRM
endpoints" section. The existing §2.1–§2.5 are byte-identical to
before this run; the new section is fully `[mock]`.

### 10.5 AI Settings menu (cycle-10)

A fourth menu item, **`AI Settings`**, has been added to the
shared `Pane1Rail` next to `Chats` / `CRM` / `AI`. It exposes a
new `/ai-settings` route that lets a tenant admin tune the AI's
identity, tone, language (one of `"Indonesia"` / `"English"` /
`"Modern Indonesia"`), scope, free-form rules, and the WhatsApp
auto-reply confidence threshold; the page also renders the four
**hardened rules** (cross-contact isolation, WhatsApp data
restriction, dashboard full scope, KB-write disabled) as a
read-only card so the operator can see what the AI cannot do.
The product spec lives at
[`../../crm/features/ai-settings/spec.md`](../../crm/features/ai-settings/spec.md);
the canonical TypeScript interfaces + `buildSystemPromptFragment`
+ `getHardenedRulesBlock` live at
[`../../tech/ai-settings-data-model.md`](../../tech/ai-settings-data-model.md).

### 10.6 AI Chat page spec upgrade (cycle-10)

The in-app AI Chat surface (`/ai`, with `/ai-chat` as a permanent
alias) is now covered by a full feature spec at
[`../../crm/features/ai-chat/spec.md`](../../crm/features/ai-chat/spec.md),
which supersedes the cycle-9 stub. The page renders the
`CrmAskAiResponse` envelope (the same one the WhatsApp auto-reply
uses), an `EvidencePanel` with a visible `contactId` per item, a
`ConfidenceBadge` (green `Tinggi` / amber `Sedang` / red `Rendah`),
a source-type breakdown (`"{n} kb + {m} record (total {n+m})"`),
and a `Pengaturan AI` link to the page above. The team scope
(KB + all CRM records, **no contact filter**) and the four
hardened rules are documented there. Locked values from §8
(`0.65` legacy threshold, Indonesian fallback phrase, contact
display rule, stack pins) are preserved.

## 11. UI Audit Acceptance (Phase 5 browser-level gate, 2026-07-09)

Every `@frontend-dev` plan that ships user-visible UI must clear
**two** Phase 5 verdicts before it counts as `done`:

1. **`production-ready`** — code-level audit via
   [`a-audit-implementation`](../../../.kilo/skills/a-audit-implementation/SKILL.md).
   Verifies that every micro-task has an artifact, every
   `**Acceptance**` line is met in source, locked values are
   byte-identical, and cross-doc references still hold.
2. **`ui-production-ready`** — browser-level audit via
   [`a-audit-ui`](../../../.kilo/skills/a-audit-ui/SKILL.md), which
   drives `browser-use` against the running Vite dev server (default
   `http://localhost:5176`) and verifies:
   - Every user-visible `**Acceptance**` line at render time, not just
     in source.
   - Locked values honored at render time (this module's contact
     display rule §7, the `0.65` threshold §8, the Indonesian fallback
     phrase, stack pins).
   - No `console.error` and no 4xx/5xx network responses on the routes
     the plan owns.
   - A screenshot manifest under
     `.kilo/audit-history/screenshots/<run_id>/<plan_id>/<route>.png`,
     one PNG per route and per state.

A plan is **not** fully `production-ready` until **both** verdicts are
positive. The Orchestrator's cycle-end gate
([`.kilo/agent/orchestrator.md`](../../../.kilo/agent/orchestrator.md)
§11 termination criteria) refuses `cycle-closed` while any frontend
plan in the cycle lacks a `ui-production-ready` entry from
`a-audit-ui`.

### 11.1 What `a-audit-ui` enforces for this module

| Locked value | SSoT source | How `a-audit-ui` re-verifies at render time |
|---|---|---|
| Contact display rule (no JID/LID) | §7 above; [`../features/chats/spec.md`](../features/chats/spec.md) §4 | Scan `document.body.innerText` for `@s.whatsapp.net`, `@g.us`, `@lid`, `status@broadcast`. E006 on match. |
| Indonesian fallback `"Grup belum dinamai"` | §7 above; [`../features/chats/spec.md`](../features/chats/spec.md) §4 | Byte-exact substring match in the rendered DOM of the unnamed-group state. |
| Indonesian fallback sentence | §8 above; [`../features/ai-chat/spec.md`](../features/ai-chat/spec.md) §8 | Byte-exact substring match in the fallback bubble. |
| `0.65` confidence threshold | §8 above; [`../features/ai-chat/spec.md`](../features/ai-chat/spec.md) §4 | Read `ConfidenceBadge` computed width / class to confirm the band boundaries match §6. |
| Stack pins (React 18.x, Vite 5.x, Tailwind 3.x) | §3 above; [`../../tech/frontend-stack.md`](../../tech/frontend-stack.md) | Devtools console must not show version-mismatch warnings. |
| Two-pane layout, sidebar sort, state machine | [`../features/chats/spec.md`](../features/chats/spec.md) §1, §6.1 | DOM inspection per route; screenshot per state. |

### 11.2 Failure modes

| Verdict | Required follow-up |
|---|---|
| `ui-production-ready` | None — Orchestrator advances to cycle-end gate. |
| `ui-inconsistent` | Orchestrator emits §8.4 Inconsistency Report. User chooses Fix / Revise / Accept. Fix path re-dispatches `@frontend-dev` with the finding list + screenshot manifest. |
| `STATUS: Blocked` E001 (dev server unreachable) | Orchestrator re-dispatches `@frontend-dev` to run `pnpm dev`, then re-runs `a-audit-ui`. The Auditor must **not** start the dev server itself (see `.kilo/agent/audit.md` §6 hard prohibition 8). |
