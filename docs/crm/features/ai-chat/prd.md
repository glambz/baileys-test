<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-02
DEPENDS_ON:
  - docs/crm/features/ai-chat/spec.md
  - docs/crm/features/ai-autoreply/spec.md
  - docs/tech/crm-data-model.md
  - docs/tech/ai-settings-data-model.md
-->

# PRD — AI Chat (CRM scope, full)

## 1. Problem

Internal teams often want to answer a question that depends on data
spread across multiple contacts: "Which customers paid the Q3 invoice
late?", "Which leads mentioned 'premium' in the last 30 days?",
"Show me everything we know about Pak Hendro AND Bu Sinta". The
existing WhatsApp AI Auto-Reply feature
([`./ai-autoreply/spec.md`](../ai-autoreply/spec.md)) applies a
hard `contact_id` filter for safety and cannot answer these
team-scope questions. Without a dedicated surface, operators fall
back to ad-hoc SQL or to running CRM exports by hand, which is slow,
error-prone, and bypasses the project's audit story.

## 2. Goal

Ship an in-app **`/ai` page** that lets a logged-in operator ask
the Baileys Studio AI Assistant a free-form question and get:

1. A confident answer drawn from the **entire tenant knowledge
   base + every CRM record in the tenant** (no contact filter).
2. A byte-stable Indonesian fallback when the RAG pipeline returns
   `confidence < 0.7`.
3. A complete evidence trail per answer, with a visible per-item
   `contactId` so the operator can audit the scope.
4. A link to the per-tenant AI Settings page (`/ai-settings`) where
   the operator can tune identity / tone / language / scope / rules.

## 3. Users

| Persona | Why they care |
|---|---|
| Operator (sales/CS) | One place to ask "show me everything across contacts"; no need to switch contexts. |
| Team lead | Faster reporting; the same system that answers contacts in WhatsApp answers the team. |
| Tenant admin | Confirms that the AI's identity / voice / scope match the tenant's brand without editing code. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| AIC-1 | operator | to open `/ai` from the Pane 1 rail and ask a free-form question | I get a single place for cross-contact AI questions |
| AIC-2 | operator | the answer to cite the source records with `contactId` visible | I can audit the scope at a glance |
| AIC-3 | operator | a `Pengaturan AI` link that takes me to `/ai-settings` | I can tune the AI without leaving the page tree |
| AIC-4 | operator | the page to fall back to the byte-identical Indonesian fallback when context is thin | I know the AI is not hallucinating |
| AIC-5 | operator | a ConfidenceBadge per answer | I can sort my trust at a glance |
| AIC-6 | team lead | the page to handle bulk questions in succession without reloading | my team's reporting cadence is fast |
| AIC-7 | tenant admin | the AI's identity, tone, language, scope, and rules to follow what I configured on `/ai-settings` | the dashboard AI behaves like our brand |
| AIC-8 | security reviewer | the page to be **outside** the WhatsApp contact filter | cross-contact queries are possible; the data-layer hard filter is enforced where it must be (WhatsApp auto-reply), not where it must not be (`/ai`) |

## 5. UX requirements

| ID | Requirement |
|---|---|
| UX-1 | The page is reachable via `pane1Selection === 'ai'`; the existing route-sync `useEffect` from `AppShell.tsx` is the only navigation entry point. |
| UX-2 | Pane 2 is hidden when `/ai` is active; the layout reflows to full-width. |
| UX-3 | The header carries the title "Baileys Studio AI — Tanya AI" and a secondary `Pengaturan AI` link. |
| UX-4 | The composer is a `<Textarea>` (`max 2000` characters) with an optional `<Select>` for entity context. |
| UX-5 | The submit button is disabled while the mutation is pending; the composer shows "sedang berpikir…" while loading. |
| UX-6 | `ConfidenceBadge` colours are: green `Tinggi`, amber `Sedang`, red `Rendah`. |
| UX-7 | The evidence panel renders all rows and is expanded by default. |
| UX-8 | The header shows the source-type breakdown exactly as `"{n} kb + {m} record (total {n+m})"`. |
| UX-9 | The Indonesian fallback phrase is rendered byte-identically to `i18n/id.json ai.fallback.message`. |
| UX-10 | An error renders "Maaf, AI tidak dapat menjawab saat ini. Coba lagi." with a `Coba lagi` button. |
| UX-11 | `pane1Selection` learns a new `'settings'` variant (see [`./ai-settings/spec.md`](../ai-settings/spec.md) §3) but that variant does **not** affect `/ai`. |

## 6. Non-goals

- Chat history persistence across reloads.
- Streaming LLM tokens into the bubble.
- Co-pilot mode (the AI drafts while the operator types).
- Multi-tenant routing on `/ai`; this run is single-tenant.
- A separate /ai-chat route — `/ai-chat` is a permanent alias only.

## 7. Success criteria

| ID | Measurable |
|---|---|
| A1 | `confidence >= 0.7` → answer rendered within 5 s of submit (mock latency) and `ConfidenceBadge` reads `Tinggi`. |
| A2 | `confidence < 0.7` → `kind: 'fallback'` rendered byte-identical to the Indonesian fallback phrase; no evidence panel. |
| A3 | The `ai_workspace_does_not_apply_contact_filter_on_team_scope` test passes — evidence can include records from any contact. |
| A4 | Clicking `Pengaturan AI` calls `navigate('/ai-settings')` and switches `pane1Selection` to `'settings'`. |
| A5 | The Pane 1 highlight follows `path.startsWith('/ai')` exactly; `/ai-chat` also highlights correctly. |
| A6 | Source-type breakdown reads exactly `"3 kb + 2 record (total 5)"` for the canonical mock dataset. |

## 8. Open questions

- Should `/ai` support streaming tokens? (Out of scope this run.)
- Should `/ai` keep a per-operator transcript in `localStorage`?
  (Out of scope this run; revisit after the persistence layer
  ships.)

## 9. Cross-references

- Spec: [`spec.md`](spec.md).
- Canonical system prompt: [`./systemPrompt.md`](./systemPrompt.md).
- Hardened rules + storage: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
- Per-tenant settings UI: [`../ai-settings/prd.md`](../ai-settings/prd.md).
- WhatsApp auto-reply sibling: [`../ai-autoreply/prd.md`](../ai-autoreply/prd.md).
- Data model + threshold: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
