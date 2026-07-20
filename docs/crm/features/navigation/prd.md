<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-01
DEPENDS_ON:
  - docs/crm/features/navigation/spec.md
-->

# PRD — Navigation (three-pane)

## 1. Problem

The operator has three top-level jobs (read chats, work the CRM, ask
the AI) and currently has to context-switch between two URLs. The
shell needs a single, persistent way to move between them without
losing the place in the chat list.

## 2. Goal

A three-pane shell that lets the operator switch jobs in one click
and keeps the chat list visible while doing the other two jobs is
nice-to-have, not required. (For CRM and AI, the chat list is hidden
to give the workspace full width.)

## 3. Users

| Persona | Why they care |
|---|---|
| Operator | The single user; the shell is theirs. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-1 | operator | to switch between Chats, CRM, and AI with one click | I do not lose my place when I context-switch. |
| US-2 | operator | the chat list to stay visible while I read chats | I can scan for new messages while I reply. |
| US-3 | operator | CRM and AI to be full-width (no chat list) | I have room for tables and transcripts. |
| US-4 | operator | to collapse the left rail when I need more room | I can focus on the content. |

## 5. Non-goals

- Multi-window or pop-out.
- Custom Pane 1 item icons.
- Mobile / responsive < 1024 px.

## 6. Success criteria

| ID | Measurable |
|---|---|
| A1 | A click on a Pane 1 item updates the URL and the active state within 100 ms (local Zustand read). |
| A2 | The chat list at `/chats` is the same `ChatSidebar` component that ships today (visual diff: identical). |
| A3 | Pane 2 is removed from the layout (not just hidden) when Pane 1 is `CRM` or `AI`; a Playwright snapshot shows Pane 2 not in the DOM tree. |
| A4 | All locked values of the WhatsApp module (0.65, "Grup belum dinamai", the senderPn display rule, the fallback sentence, the stack pins) remain byte-identical in the codebase after the change. |

## 7. Open questions

- None for this run.

## 8. Cross-references

- Spec: [`spec.md`](spec.md).
- Module overview: [`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md).
