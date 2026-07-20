<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-02
DEPENDS_ON:
  - docs/crm/features/ai-settings/spec.md
  - docs/tech/ai-settings-data-model.md
  - docs/crm/features/ai-chat/spec.md
-->

# PRD — AI Settings

## 1. Problem

The Baileys Studio AI Assistant's behavior is currently fixed in
TypeScript. Tenant admins cannot adapt identity / tone / language /
scope / rules to their brand without editing code, and there is no
operator-visible surface for the **hardened rules** the system
promises customers. This feature is the operator-side answer: a
single-page workspace at `/ai-settings` where the admin can tune
the AI for a tenant and inspect the four locked rules.

## 2. Goal

Ship a `/ai-settings` page that lets a logged-in admin:

1. Configure the AI's **identity** (name / role / description).
2. Pick one of five **tones** for the AI.
3. Pick one of three **languages**: `Indonesia` / `English` /
   `Modern Indonesia`.
4. Define the AI's **scope** (what it covers, what it excludes).
5. Enter free-form **rules** (one per line).
6. Toggle **WhatsApp auto-reply** on or off, and pick its
   confidence threshold in `[0.50, 0.95]`.
7. **Read** (not edit) the four hardened rules that protect
   tenant data.

The page must be reachable as a new fourth menu item in `Pane1Rail`
and from the `Pengaturan AI` link on the `/ai` page header.

## 3. Users

| Persona | Why they care |
|---|---|
| Tenant admin | One page that captures brand voice + boundaries without engineering help. |
| Operator | A "what does this AI actually do?" surface; can inspect the locked rules without code. |
| Security reviewer | The locked rules are visible at the UI level — operator and admin can both audit them. |

## 4. User stories

| ID | As a | I want | So that |
|---|---|---|---|
| AIS-1 | tenant admin | a dedicated "AI Settings" menu in Pane 1 | I can find the page without traversing other workspaces |
| AIS-2 | tenant admin | to fill in name / role / description | the AI greets contacts in our brand voice |
| AIS-3 | tenant admin | to pick one of five tones | the assistant sounds like us, not like a generic bot |
| AIS-4 | tenant admin | to pick `Indonesia` / `English` / `Modern Indonesia` | the assistant replies in the language our customers use |
| AIS-5 | tenant admin | to list topics the AI handles and topics it refuses | the AI's scope matches what we actually sell / support |
| AIS-6 | tenant admin | to write free-form rules, one per line | we can record our house style / boundaries without code edits |
| AIS-7 | tenant admin | to enable / disable WhatsApp auto-reply and tune its threshold | I decide how aggressive the auto-reply is per tenant |
| AIS-8 | tenant admin | to see the four hardened rules as a read-only card | I can prove to my customers what the AI will never do |
| AIS-9 | tenant admin | a single Save button (no autosave) | accidental edits don't get persisted |
| AIS-10 | tenant admin | a Reset-to-defaults button | I can recover from a misconfiguration |
| AIS-11 | operator | to be navigated to `/ai-settings` from the `Pengaturan AI` link on `/ai` | I can tune without leaving the page tree |

## 5. UX requirements

### 5.1 Menu placement

| ID | Requirement |
|---|---|
| UX-M1 | A fourth item appears in `Pane1Rail` with lucide icon `SlidersHorizontal` and label `AI Settings`. |
| UX-M2 | The item highlights on `pane1Selection === 'settings'` with the existing `bg-accent` + 2 px primary bar treatment. |
| UX-M3 | The collapsed-mode tooltip reads "AI Settings" byte-identical. |

### 5.2 Form sections

| ID | Requirement |
|---|---|
| UX-F1 | Seven cards in this order: Identity, Tone, Language, Scope, Rules, WhatsApp auto-reply, Hardened rules. |
| UX-F2 | Labels are rendered in Bahasa Indonesia (`Nama`, `Peran`, `Deskripsi`, `Nada`, `Bahasa`, `Cakupan`, `Topik`, `Topik yang dikecualikan`, `Aturan tambahan`, `Auto-reply WhatsApp`, `Aturan yang dikunci`). |
| UX-F3 | The Language `<Select>` shows exactly the three labels `"Indonesia"`, `"English"`, `"Modern Indonesia"` — byte-identical. |
| UX-F4 | The Tone `<Select>` shows exactly `Formal`, `Santai`, `Ramah`, `Ringkas`, `Antusias` — byte-identical. |
| UX-F5 | Hardened-rules card is read-only; lock icon (`lucide-react` `Lock`) is on the right of the title row. |
| UX-F6 | Hardened-rules note reads exactly `"Aturan ini dikunci demi keamanan data tenant dan tidak dapat diubah."`. |

### 5.3 Save / Reset / toast

| ID | Requirement |
|---|---|
| UX-S1 | Primary `<Button>` "Simpan pengaturan" persists the form to `useAiSettingsStore` on click. |
| UX-S2 | A success toast "Pengaturan AI disimpan" appears for 4 seconds after save. |
| UX-S3 | Secondary `<Button variant="secondary">` "Reset ke default" opens a `<Dialog>` "Yakin reset ke pengaturan awal?" with `Reset` and `Batal` actions; only `Reset` calls the store reset. |
| UX-S4 | Inline errors are shown for invalid fields; Save is disabled while any error is present. |

### 5.4 Cross-page

| ID | Requirement |
|---|---|
| UX-C1 | Clicking `Pengaturan AI` on the `/ai` page header navigates to `/ai-settings` and switches `pane1Selection` to `'settings'`. |
| UX-C2 | Pane 2 is hidden on `/ai-settings` (the page is a single-column workspace, like `/crm`). |

## 6. Non-goals

- Editing the four hardened rules. Per the user directive, these
  are intentionally non-customizable.
- Streaming LLM tuning sliders (temperature, top-p, etc.); the
  confidence threshold is the only numeric lever.
- Per-contact overrides on this page. (The WhatsApp auto-reply's
  `contact_id` filter is already per-chat and is enforced in
  [`./ai-autoreply/spec.md`](./ai-autoreply/spec.md) §5.)
- A "test my AI" playground. `/ai` is the playground.
- Multi-tenant routing on `/ai-settings`; this run is single-tenant.

## 7. Success criteria

| ID | Measurable |
|---|---|
| A1 | The `pane1Selection` slot accepts `'settings'` and the rail highlights the `AI Settings` item. |
| A2 | Saving a valid form persists to `localStorage` under the key `'baileys-frontend:ai-settings'`. |
| A3 | Reloading the page after Save hydrates the form with the saved values. |
| A4 | Clicking `Reset ke default` after Save restores the byte-stable defaults and clears localStorage. |
| A5 | Hardened-rules card renders the four locked Bahasa Indonesia lines byte-identical to the same four lines in the data model doc. |
| A6 | The Language `<Select>` options read exactly `"Indonesia"`, `"English"`, `"Modern Indonesia"` byte-identical. |
| A7 | A confidenceThreshold of `0.4` is rejected with the inline error and Save is disabled; `0.95` and `0.50` are accepted. |
| A8 | The form layout uses the seven-card grid; the route-sync useEffect learns `path.startsWith('/ai-settings')` exactly. |

## 8. Open questions

- Should the hardened-rules card be downloadable as a PDF for the
  tenant's compliance folder? (Out of scope this run.)
- Should `id-mod` ("Modern Indonesia") get its own colloquial
  vocabulary list? (Out of scope for this run; the enum exists but
  the runtime does not yet switch on it.)

## 9. Cross-references

- Spec: [`spec.md`](spec.md).
- Data model + system prompt template: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
- The `/ai` page that consumes these settings: [`../ai-chat/spec.md`](../ai-chat/spec.md).
- Navigation changes: [`../navigation/spec.md`](../navigation/spec.md).
- Data model + threshold: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
