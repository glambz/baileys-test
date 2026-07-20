<!--
OWNER: @product-management
VERSION: 0.2.0
LAST_MODIFIED: 2026-07-02
DEPENDS_ON:
  - docs/crm/features/ai-chat/systemPrompt.md (locked Indonesian + English rules)
  - docs/crm/features/ai-autoreply/spec.md (state machine, contact filter)
  - docs/crm/features/navigation/spec.md (Pane 1 selection, route-sync)
  - docs/crm/features/ai-settings/spec.md (the per-tenant settings store)
  - docs/tech/crm-data-model.md (threshold 0.7, contact_id filter)
  - docs/tech/ai-reply-state-machine.md (AIReplyMode union)
  - docs/frontend/api/api-spec.md (§6 CRM endpoints)
  - docs/tech/ai-settings-data-model.md (AiSettings shape)
-->

# Feature Spec — AI Chat (CRM scope, full)

> The CRM-scope AI Chat surface (`/ai`, with `/ai-chat` as permanent
> alias) backs the **internal team question pipeline** with the
> CRM/RAG threshold `0.7` and **no** `contact_id` filter. It is the
> dashboard counterpart of the
> [`./ai-autoreply/spec.md`](./ai-autoreply/spec.md) WhatsApp feature,
> which DOES apply the hard contact filter at the data layer.
>
> The canonical rules the assistant must follow live in
> [`./systemPrompt.md`](./systemPrompt.md) — that document is the
> Single Source of Truth for the assistant's identity, voice, scope,
> output format, fallback phrasing, and now also the per-tenant
> customization fragment + hardened rules block (see §10 below and
> [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md)).
>
> This document supersedes the 1289-byte stub created in cycle-9.

## 1. Purpose

The `/ai` page lets an authenticated operator ask the Baileys Studio
AI Assistant a free-form natural-language question and receive:

1. A **full-data-scope answer** when the RAG pipeline returns
   `kind: 'answered'` with `confidence >= CRM_AI_CONFIDENCE_THRESHOLD`.
2. The byte-identical Indonesian fallback sentence
   `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …`
   (from [`./systemPrompt.md`](./systemPrompt.md) §"Indonesian rules"
   + `frontend/src/i18n/id.json` `ai.fallback.message`) wrapped in
   `kind: 'fallback'` when the context is insufficient.
3. The **exact evidence trail** the operator needs to audit the
   scope: per-item `contactId` (always the chat's contact on the
   WhatsApp path; on `/ai` every item carries the contact the record
   belongs to or `null` for KB-only items).

The page is reachable only via the **`AI`** menu in Pane 1 (route
`/ai`); the Pane 1 rail highlight uses the existing route-sync
`useEffect` from `AppShell.tsx` and learns `path.startsWith('/ai')`
→ `pane1Selection = 'ai'`.

## 2. Route + components

| Path | Page component | Hook | Layout slot |
|---|---|---|---|
| `/ai` | `frontend/src/pages/crm/AiWorkspacePage.tsx` | `useTeamAskAi()` (new, in the same `hooks/` folder as the WhatsApp variant) | Pane 3 (Pane 2 hidden when `pane1Selection === 'ai'`) |
| `/ai-chat` | — | — | permanent alias of `/ai`, identical layout, identical component |

The page component name is **`AiWorkspacePage`** and lives next to
its sibling features under `frontend/src/pages/crm/`. The
hook is **`useTeamAskAi`** and lives at
`frontend/src/pages/crm/useTeamAskAi.ts`.

## 3. Permissions (the one hard rule)

> The `/ai` page is an **internal operator surface**. Its RAG query
> MUST run with the **team scope**: it sees `knowledge_chunks` across
> every entity AND every `entity_records.contact_id` in the tenant.
> **No** `contact_id` filter is applied; the operator has the right
> to ask about any contact.

This is the **only** permission statement in this spec and it is
byte-identical to the row in the `/api/crm/ai/ask` row of the path
table in
[`./ai-autoreply/spec.md`](./ai-autoreply/spec.md) §5.

The contrast with the WhatsApp auto-reply path is mandatory and is
declared as a **hardened rule** in
[`./ai-settings/spec.md`](./ai-settings/spec.md) §"Hardened rules"
and in [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md) §"Hardened-rules block":

> "Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan
> DAN seluruh data CRM tenant untuk tanya jawab internal."

That wording is locked; do not paraphrase.

## 4. Inputs

The page accepts three inputs from the operator:

| Input | Required | Source | Validation |
|---|---|---|---|
| Free-form message | yes | a `<Textarea>` in the composer | non-empty after trim; max `2000` characters |
| Current entity context | no | an optional `<Select>` populated from `entity_definitions`; selecting one narrows retrieval to that entity's records only | entity name must resolve in the schema |
| Tenant AI settings | yes (read-only here) | the `useAiSettingsStore` Zustand slice (see §10 and [`./ai-settings/spec.md`](./ai-settings/spec.md)) | reads the store; mutations live on the `/ai-settings` page |

The third input is **not** the system prompt itself — the system
prompt is built by composing
[`BAILEYS_AI_SYSTEM_PROMPT_ID`](../../../frontend/src/lib/ai/systemPrompt.ts)
(or `_EN`) with the customization fragment (§10) and the hardened
rules block.

## 5. Output schema (`CrmAskAiResponse`)

The page renders **exactly** the same response envelope as the
WhatsApp auto-reply feature. The TypeScript literal union lives in
[`frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts)
and is declared here for cross-doc visibility:

```ts
type CrmAskAiResponse = CrmAiAnswer | CrmAiFallback;

interface CrmAiAnswer {
  kind: 'answered';
  answer: string;
  confidence: number;
  evidence: CrmAiEvidence[];   // every item has contactId|null
  generatedAt: number;         // epoch ms
  question: string;
}

interface CrmAiFallback {
  kind: 'fallback';
  message: string;            // the byte-stable fallback phrase
}
```

`CrmAiEvidence.kind` is `'kb'` or `'record'`. On the `/ai` path,
`contactId` is **permitted** to be `null` (for KB-only items); on
the WhatsApp auto-reply path it is **always** the chat's contact_id.

## 6. Network contract

The page calls the future endpoint
`POST /api/crm/ai/ask` declared in
[`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md)
(tagged `[mock]` until the backend lands). The request body is:

```ts
interface AskAiRequest {
  question: string;
  entityContext?: string;   // entity machine name, optional
  settings: {
    language: 'id' | 'en';  // derived from AiSettings.language
    tone: AiTone;           // logged but does NOT change the prompt language
  };
}
```

The response body is `CrmAskAiResponse` (§5). The hook
`useTeamAskAi` wraps the call in a TanStack Query `useMutation`
with `mutationKey: ['crm', 'ai', 'team']`; loading / error states
are derived from `mutation.isPending` and `mutation.isError`.

## 7. UI surface (`AiWorkspacePage`)

The page is a single-column layout with three regions:

| Region | Component | Notes |
|---|---|---|
| Header | `<AiWorkspaceHeader>` | Title ("Baileys Studio AI — Tanya AI"); a secondary link "Pengaturan AI" (`/ai-settings`) shown to the right. |
| Transcript | `<AiWorkspaceTranscript>` | Vertical stack of message bubbles (operator + assistant); auto-scrolls to the bottom on new entries. |
| Composer | `<AiWorkspaceComposer>` | Textarea + submit button + the optional entity-context `<Select>`. Disabled while `mutation.isPending`. |

The single-column layout replaces the legacy `/ai-chat` page's
layout; the existing `frontend/src/pages/AiChatPage.tsx` is
retained for the alias `/ai-chat`.

### 7.1 ConfidenceBadge

`<ConfidenceBadge confidence={n} />` renders a coloured pill:

| Range | Label | Colour |
|---|---|---|
| `>= 0.7` | `Tinggi` (High) | green |
| `0.5..<0.7` | `Sedang` (Medium) | amber |
| `< 0.5` | `Rendah` (Low) | red |

The threshold `0.7` is byte-identical to
[`./ai-autoreply/spec.md`](./ai-autoreply/spec.md) §4 and to
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3.

### 7.2 EvidencePanel

`<EvidencePanel evidence={items} />` renders a collapsible list of
`CrmAiEvidence` rows. Each row shows `kind` (`kb` = "Basis
Pengetahuan", `record` = "Data CRM"), the `excerpt`, the `source`
citation, the `confidence` mini-bar, and — when present — the
`contactId` (rendered through the existing contact display rule).
On the `/ai` page the panel is **always expanded** when a non-empty
`evidence` array is present; on the WhatsApp auto-reply path the
panel collapses by default. The expansion behaviour is the only
visual difference between the two surfaces and is dictated here.

### 7.3 Source type breakdown

When `kind === 'answered'`, the header shows the count breakdown:

```
{n}kb + {m}record (total {n+m})
```

where `{n}` is `evidence.filter(e => e.kind === 'kb').length` and
`{m}` is the record count. The format string is the Indonesian
infix "kb +" / "record" / "total" and must be byte-identical to
the value used in the test snapshot
(`__tests__/ai-workspace.test.tsx`).

### 7.4 Settings shortcut link

The header carries a `<Link to="/ai-settings">` reading
"Pengaturan AI" with a `lucide-react` `Settings` icon. Clicking
it calls `navigate('/ai-settings')` (React Router 6.x) and switches
the Pane 1 selection to the new `'settings'` variant (see §11 and
[`./ai-settings/spec.md`](./ai-settings/spec.md) §3).

The link text is `"Pengaturan AI"` byte-identical and is enforced
by a vitest snapshot.

## 8. States

### 8.1 Empty (first load)

| Element | UI |
|---|---|
| Transcript | A centered welcome card: "Mulai dengan mengetik pertanyaan di kolom bawah." |
| Composer | Enabled, empty `<Textarea>` with the placeholder "Tulis pertanyaan Anda di sini…" |
| ConfidenceBadge | — |
| EvidencePanel | Hidden (no answer yet) |
| Settings shortcut | Shown, enabled |

### 8.2 Loading (awaiting response)

The transcript shows the previous messages plus a transient
`<div>` row: a small "sedang berpikir…" text with a spinner.
The composer is disabled; the submit button shows a spinner; the
"Pengaturan AI" link is disabled.

### 8.3 Fallback

`kind === 'fallback'` renders the assistant message as a single
transcript bubble containing the byte-stable Indonesian fallback
phrase and a small `<ConfidenceBadge>` with `confidence={0}` and
label `Rendah`. No evidence panel.

### 8.4 Error

A mutation error renders an inline error banner above the
composer: "Maaf, AI tidak dapat menjawab saat ini. Coba lagi."
with a `<Button variant="secondary">` "Coba lagi" that re-runs the
mutation. The composer remains enabled.

### 8.5 Locked values preserved byte-identically

| Locked value | Source | Preserved? |
|---|---|---|
| Indonesian fallback phrase | `i18n/id.json` `ai.fallback.message` and [`./systemPrompt.md`](./systemPrompt.md) | yes |
| CRM/RAG threshold `0.7` | [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3 | yes |
| Legacy WhatsApp threshold `0.65` | [`../../../tech/chat-data-model.md`](../../../tech/chat-data-model.md) §2.6 | yes (legacy module untouched) |
| `AIReplyMode = 'ai' \| 'human' \| 'human_pending_flag'` | [`frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts) | yes |
| `senderPn` display rule | [`../../../frontend/general/MODULE_OVERVIEW.md`](../../../frontend/general/MODULE_OVERVIEW.md) §7 | yes |
| `Grup belum dinamai` placeholder | same | yes |
| Stack pins (Vite 5.x, React 18.x, TypeScript 5.x, Tailwind 3.x, React Router 6.x, TanStack Query 5.x, Zustand 4.x, lucide-react latest, dayjs 1.x, zod 3.x, shadcn/ui latest) | [`../../../tech/frontend-stack.md`](../../../tech/frontend-stack.md) | yes |

Any drift in the above values blocks the run.

## 9. The four `ConfidenceBadge` and `EvidencePanel` tests

These are the mechanical gates. They live in
`frontend/src/pages/crm/__tests__/AiWorkspacePage.test.tsx` and
mirror the auto-reply test names:

1. `ai_workspace_falls_back_below_threshold` — mock the endpoint
   to return `{ kind: 'fallback', message: AI_FALLBACK_MESSAGE_ID }`;
   assert the bubble renders the exact phrase and the badge is
   `Rendah`.
2. `ai_workspace_renders_answer_with_evidence` — mock with three
   KB items and two record items; assert the source-type breakdown
   reads exactly `"3 kb + 2 record (total 5)"`.
3. `ai_workspace_does_not_apply_contact_filter_on_team_scope` —
   mock two contacts `C-A` and `C-B`; assert that the second call
   (or the same call with both contacts' records in evidence) is
   NOT filtered; the page renders both evidence rows.
4. `ai_workspace_settings_link_navigates_to_ai_settings` — assert
   that clicking "Pengaturan AI" calls `navigate('/ai-settings')`.

The tests are declared here so the Planner can reproduce them
verbatim in the relevant plan files.

## 10. Per-tenant customization + hardened rules (append-only)

This section summarizes how `/ai` and the WhatsApp auto-reply share
the same instruction-tuning layer. The full canonical content lives
in [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).

### 10.1 Per-tenant fragment

The runtime composes the system prompt as:

```
buildSystemPrompt({ language, tenantName })
  + "\n\n# Pengaturan tenant\n"
  + buildSystemPromptFragment(aiSettings)        // user-customizable
  + "\n\n" + getHardenedRulesBlock()             // locked, appended last
```

`buildSystemPromptFragment` is declared in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md) §"Default values + system prompt template".
`getHardenedRulesBlock` is the same module's §"Hardened-rules block"
and returns the four locked Bahasa Indonesia rules byte-identically.

### 10.2 What the fragment covers

| Field in `AiSettings` | Rendered as |
|---|---|
| `identity.{name,role,description}` | a `# Identitas` block at the top of the fragment |
| `tone` | a `# Suara & nada` bullet-list (one bullet added per tone semantics) |
| `language` | selects which `_ID` / `_EN` variant the runtime uses; on `id-mod`, the runtime is free to apply an additional informal-Indonesian style pass downstream — out of scope for `/ai` itself |
| `scope.topics` / `scope.excludedTopics` | appended as `# Topik yang dibahas` / `# Topik yang dikecualikan` bullet lists |
| `rules` | appended as one numbered bullet per entry in `# Aturan tambahan` |
| `whatsappAutoReply.confidenceThreshold` | **not** rendered into the fragment; consumed by the auto-reply pipeline at decision time only |

Anything the operator types in the form is rendered exactly once,
as a fragment, **before** the hardened rules block. The hardened
block is appended unconditionally and cannot be omitted.

### 10.3 The four hardened rules (preview)

The verbatim Bahasa Indonesia text is held in two locations and MUST
be byte-identical between them:

- [`./ai-settings/spec.md`](./ai-settings/spec.md) §"Hardened rules"
  (the product spec, with the lock icon and the explanatory note).
- [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md)
  §"Hardened-rules block" (`getHardenedRulesBlock` return value).

The four rules, in the canonical ordering (byte-for-byte identical
to the canonical text in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md)
§3.2 and to the rendered card in
[`./ai-settings/spec.md`](./ai-settings/spec.md) §4.7):

1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.

Drift between any of the three restatements (this section,
[`./ai-settings/spec.md`](./ai-settings/spec.md) §4.7,
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md)
§3.2) is a blocker.

## 11. Out of scope

- Chat history persistence beyond a single page-load session. (The
  transcript is React state, not Zustand.)
- Streaming the LLM response token-by-token into the bubble.
- Co-pilot mode (the AI drafts while the operator types).
- Multi-tenant routing on the `/ai` page; this run is single-tenant.
- The `id-mod` ("Modern Indonesia") colloquial style pass. The
  enum exists but the runtime does not yet switch on it.

## 12. Cross-references

- Product framing: [`prd.md`](prd.md).
- Canonical system prompt: [`./systemPrompt.md`](./systemPrompt.md).
- Hardened rules + data model: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
- Settings UI: [`./ai-settings/spec.md`](./ai-settings/spec.md).
- Auto-reply sibling: [`./ai-autoreply/spec.md`](./ai-autoreply/spec.md).
- State machine: [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).
- Data model + threshold: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- Navigation (Pane 1 selection, route-sync): [`./navigation/spec.md`](./navigation/spec.md).
- API contract (all `[mock]` for now): [`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).
