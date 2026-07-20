<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/frontend/features/chats/spec.md (the chat list reuse)
  - docs/frontend/components/chats/ChatSidebar.tsx (reused as Pane 2)
  - docs/crm/general/MODULE_OVERVIEW.md
  - docs/tech/frontend-stack.md
-->

# Feature Spec — Navigation (three-pane)

> The CRM module's surface area is a three-pane layout that lets the
> operator switch between **Chats**, **CRM**, and **AI** without
> losing context. This spec is authoritative for the layout; the
> product framing lives in [`prd.md`](prd.md); the data shapes live
> in [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).

## 1. The three panes

```
+----------+----------------------+--------------------------------------+
|  Pane 1  |       Pane 2         |               Pane 3                 |
| 64–80 px |   320 px (Chats)     |               flex                   |
|  left    |   only when the      |                                      |
|  rail    |   "Chats" menu is    |     active content area              |
|          |   active             |                                      |
+----------+----------------------+--------------------------------------+
```

| Pane | Width | Always visible? | Contents |
|---|---|---|---|
| **Pane 1** — left rail | collapsed `64 px` / expanded `240 px` | yes | icon + label for `Chats`, `CRM`, `AI`. Active state has a 2 px primary-color bar on the inside edge. |
| **Pane 2** — secondary | `320 px` | only when Pane 1 selection is `Chats` | the existing chat list, reused from `frontend/src/components/chats/ChatSidebar.tsx` (see §3). |
| **Pane 3** — content | `flex` (1fr) | yes | the active content: chat thread (when `Chats`), CRM workspace (when `CRM`), AI transcript (when `AI`). |

### 1.1 Pane 1 details

- Three top-level items, vertically stacked, equal height `48 px`:
  - `Chats` — lucide icon `MessageSquare`.
  - `CRM` — lucide icon `Briefcase`.
  - `AI` — lucide icon `Sparkles`.
- Each item renders an icon (centered in `64 px` collapsed mode) and,
  in expanded mode, an icon + label.
- The active item has:
  - `bg-accent` background.
  - A `2 px` bar on the inside edge (right edge in LTR) in
    `bg-primary`.
  - A subtle weight bump on the label.
- Hovering an item shows a tooltip with the label when collapsed.
- The left rail is **collapsible**: a chevron at the bottom toggles
  between `64 px` and `240 px`. The selection persists across
  navigations (Zustand store).
- The collapse state is per-operator (not per-route).

### 1.2 Pane 2 — chat list (Chats menu only)

- Visible **only** when the active Pane 1 selection is `Chats`. When
  the operator switches to `CRM` or `AI`, Pane 2 is **removed from
  the layout** (not just hidden — flex reflow). This keeps the CRM
  workspace and AI transcript full-width.
- Contents: the existing `ChatSidebar` component, reused without
  modification. See §3 for the exact reuse contract.
- The auth-status banner from
  `frontend/src/components/layout/AuthStatusBanner.tsx` is rendered
  at the top of Pane 2 (above the chat list) and stays visible
  regardless of which Pane 1 item is active — this is the one
  layout element that breaks the strict three-pane rule, and is
  justified because the banner is operator-global, not page-local.

### 1.3 Pane 3 — content

Routes to one of three pages based on the Pane 1 selection:

| Pane 1 | Pane 3 route | Component |
|---|---|---|
| `Chats` | `/chats` or `/chats/:chatId` | the existing `ChatsPage` from `frontend/src/pages/ChatsPage.tsx` (unchanged) |
| `CRM` | `/crm` or `/crm/:entityName` | the new `CrmWorkspacePage` (see [`../data-viewer/spec.md`](../data-viewer/spec.md) and [`../schema-designer/spec.md`](../schema-designer/spec.md)) |
| `AI` | `/ai` | the new `AiWorkspacePage` (see [`../ai-autoreply/spec.md`](../ai-autoreply/spec.md)) |

## 2. Routing

The three top-level paths are added **next to** the existing
`/chats` and `/ai-chat` paths. None of the existing paths change.

| URL | Pane 1 selection | Pane 2 | Pane 3 |
|---|---|---|---|
| `/chats` | `Chats` | chat list | empty thread or most-recent |
| `/chats/:chatId` | `Chats` | chat list | thread for `:chatId` |
| `/crm` | `CRM` | hidden | CRM workspace home (entity list) |
| `/crm/:entityName` | `CRM` | hidden | records of `:entityName` |
| `/crm/:entityName/:recordId` | `CRM` | hidden | record detail |
| `/crm/_schema` | `CRM` | hidden | schema designer |
| `/ai` | `AI` | hidden | AI transcript |

The existing `/ai-chat` route continues to work and routes to the same
`AI` Pane 1 selection. The new `/ai` is the canonical CRM path; the
old `/ai-chat` is a permanent alias.

## 3. Component reuse (exact)

The new navigation must reuse these existing components **byte-for-byte**:

| Existing component | Reused as | Notes |
|---|---|---|
| `frontend/src/components/chats/ChatSidebar.tsx` | Pane 2 | The chat list is **dropped in unchanged**. The component owns the `useChats()` TanStack Query call; the navigation does not wrap it. The component already respects the `0.65` confidence threshold and the contact display rule — no changes. |
| `frontend/src/components/layout/AuthStatusBanner.tsx` | global banner above Pane 2 | The banner is hoisted out of the page-level layout to the shell level so it stays visible across all three Pane 1 selections. No change to the banner itself. |
| `frontend/src/components/layout/AppShell.tsx` | the shell that owns Pane 1 + Pane 3 | The shell gains a new `pane1Selection` Zustand slot and renders Pane 2 conditionally. No change to its public API. |
| `frontend/src/pages/ChatsPage.tsx` | Pane 3 when selection is `Chats` | Dropped in unchanged. |

The four components above are **read-only** for the new module —
adding props to them is a separate change that must go through the
`PM-doc-audit` cycle. The new navigation must consume them as-is.

## 4. Locked values preserved

The three-pane restructure **does not** change any locked value of the
existing WhatsApp module:

- AI confidence threshold `0.65` (WhatsApp module) — preserved.
- Indonesian placeholder `"Grup belum dinamai"` — preserved.
- Contact display rule (5 cases, `senderPn` is the source) — preserved.
- Locked Indonesian fallback sentence
  `Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …` —
  preserved.
- Stack pins (Vite 5.x, React 18.x, TypeScript 5.x, Tailwind 3.x,
  React Router 6.x, TanStack Query 5.x, Zustand 4.x) — preserved.

The new CRM/RAG module's own threshold is declared in
[`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3.
The two thresholds coexist; this navigation does not introduce any
new threshold.

## 5. States

### 5.1 Pane 1 — left rail

| State | Trigger | UI |
|---|---|---|
| Idle | — | three items, active has 2 px bar + `bg-accent`. |
| Hover | mouse over an item | `bg-accent/50` overlay. Tooltip in collapsed mode. |
| Keyboard focus | Tab / arrow keys | focus ring; Enter activates. |
| Click | click an item | switches `pane1Selection` Zustand slot; React Router navigates to the matching `/chats`, `/crm`, or `/ai` route. |

### 5.2 Pane 2 (Chats menu only)

Inherits every state from the existing `ChatSidebar` component. No
new states added.

### 5.3 Pane 3

Inherits the states of the active page (`Chats`, `CrmWorkspace`,
`AiWorkspace`). No new states added at the navigation level.

## 6. Out of scope (Navigation)

- A right-side context panel (e.g. a "details" drawer). Future work.
- Drag-to-reorder of Pane 1 items. Future work.
- Custom Pane 1 item icons. Future work.

## 7. Cross-references

- Product framing: [`prd.md`](prd.md).
- Chat list reuse contract: [`../../../frontend/features/chats/spec.md`](../../../frontend/features/chats/spec.md).
- CRM data shapes: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- AI reply state machine: [`../../../tech/ai-reply-state-machine.md`](../../../tech/ai-reply-state-machine.md).
- Coexistence note: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md) §10 (added by the §10 patch).
- Stack: [`../../../tech/frontend-stack.md`](../../../tech/frontend-stack.md).
