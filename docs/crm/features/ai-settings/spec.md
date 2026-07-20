<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-02
DEPENDS_ON:
  - docs/tech/ai-settings-data-model.md (canonical interfaces, hardened block)
  - docs/crm/features/ai-chat/systemPrompt.md (system prompt SSoT)
  - docs/crm/features/navigation/spec.md (Pane 1 + route-sync)
  - docs/crm/features/ai-chat/spec.md (the /ai page that consumes these settings)
  - docs/tech/crm-data-model.md (threshold 0.7)
  - docs/frontend/api/api-spec.md (§6 future endpoints)
-->

# Feature Spec — AI Settings

> Per-tenant customization of the Baileys Studio AI Assistant.
> This spec is authoritative for the page UI, the form model, the
> persistence shape, and the hardened rules that the operator cannot
> edit. The TypeScript interfaces live in
> [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md);
> the system-prompt composition rules live in
> [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md) §"Default values + system prompt template".

## 1. Purpose

Today the AI's identity, voice, scope, and rules are baked into
[`../../../frontend/src/lib/ai/systemPrompt.ts`](../../../frontend/src/lib/ai/systemPrompt.ts).
Tenant admins have no way to adapt them to their brand without
editing TS code. This feature ships a single-page workspace where a
logged-in operator (or admin) can configure, per tenant:

- **Identity** — name, role, and a free-form description.
- **Tone** — one of five named voices.
- **Language** — one of three: `"Indonesia"` (`id`), `"English"`
  (`en`), `"Modern Indonesia"` (`id-mod`).
- **Scope** — topics the AI handles, and topics it refuses.
- **Rules** — free-form, one-per-line.
- **WhatsApp auto-reply** — enable / disable, plus a numeric
  confidence threshold in `[0.5, 0.95]`.

In addition to the operator-editable form, the page exposes the
**hardened rules** — four locked data-safety rules that cannot be
edited. These exist so the operator can SEE what the system promises
its customers, and so no future change can silently drop them.

## 2. Route + page

| Path | Page component | Hook | Layout slot |
|---|---|---|---|
| `/ai-settings` | `frontend/src/pages/crm/AiSettingsPage.tsx` (new) | `useAiSettings()` — selector over `useAiSettingsStore` (see §7) | a single-column workspace, like CRM (`pane1Selection === 'settings'` hides Pane 2) |

The page is reachable from two places:

1. The new **fourth menu item** in `Pane1Rail` (see §3).
2. The `Pengaturan AI` link at the top of [`./ai-chat/spec.md`](./ai-chat/spec.md) §7.4.

The page **does not** have a Pane 2; it is a single-page workspace.
The Pane 1 route-sync `useEffect` in `AppShell.tsx` learns
`path.startsWith('/ai-settings')` → `pane1Selection = 'settings'`.

## 3. Menu placement + `pane1Selection` change

`Pane1Rail` grows a fourth item:

| Slot | Icon (lucide-react) | Label | href |
|---|---|---|---|
| 1 | `MessageSquare` | `Chats` | `/chats` (unchanged) |
| 2 | `Briefcase` | `CRM` | `/crm` (unchanged) |
| 3 | `Sparkles` | `AI` | `/ai` (unchanged) |
| **4** | **`SlidersHorizontal`** | **`AI Settings`** | `/ai-settings` |

The fourth item is **equal in height (`48 px`), equal in vertical
placement**, and follows the existing "active state has 2 px primary
bar + bg-accent" treatment. Hovering in collapsed mode shows the
tooltip "AI Settings".

The `pane1Selection` Zustand slot (defined in
[`../../general/MODULE_OVERVIEW.md`](../../general/MODULE_OVERVIEW.md))
gains a fourth variant: `'settings'`. The full literal union is
now `'chats' | 'crm' | 'ai' | 'settings'`.

The route-sync `useEffect` in
`frontend/src/components/layout/AppShell.tsx` learns:

```ts
let next: 'chats' | 'crm' | 'ai' | 'settings' = 'chats';
if      (path.startsWith('/chats'))     next = 'chats';
else if (path.startsWith('/crm'))       next = 'crm';
else if (path.startsWith('/ai-settings')) next = 'settings';
else if (path.startsWith('/ai'))        next = 'ai';
setPane1Selection(next);
```

`showPane2` is computed in `AppShell.tsx` as
`pane1Selection === 'chats'`. The new `'settings'` variant leaves
`showPane2 === false`. No other layout slot changes.

## 4. Form sections

The page renders **seven** cards in this order:

### 4.1 Identity

| Field | Input | Validation | Default |
|---|---|---|---|
| `name` | `<Input>` | required, ≤ `80` chars | `"Baileys Studio AI Assistant"` |
| `role` | `<Input>` | required, ≤ `120` chars | `"Agen CS WhatsApp"` |
| `description` | `<Textarea>` (2–3 rows) | optional, ≤ `500` chars | `"Asisten AI internal untuk menjawab pertanyaan tim tentang tenant ini."` |

The labels above the fields are `Nama`, `Peran`, and `Deskripsi`,
rendered in Bahasa Indonesia to match the existing UX language.

### 4.2 Tone

A `<Select>` over the **`AiTone`** union declared in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md):

```ts
type AiTone = 'formal' | 'casual' | 'friendly' | 'concise' | 'enthusiastic';
```

The `<Select>` options are rendered with these Bahasa Indonesia
labels (visible to the operator):

| Value | Label |
|---|---|
| `formal` | `Formal` |
| `casual` | `Santai` |
| `friendly` | `Ramah` |
| `concise` | `Ringkas` |
| `enthusiastic` | `Antusias` |

Default = `'friendly'`.

### 4.3 Language

A `<Select>` over the **`AiLanguage`** union declared in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md):

```ts
type AiLanguage = 'id' | 'en' | 'id-mod';
```

The `<Select>` options are rendered with the labels the user
specified verbatim:

| Value | Label (operator-visible) |
|---|---|
| `id` | `Indonesia` |
| `en` | `English` |
| `id-mod` | `Modern Indonesia` |

The three labels **must** appear byte-identical (including the
double quotes `"Indonesia"`, `"English"`, `"Modern Indonesia"`)
wherever the spec restates them. Default = `'id'`.

The enum values `'id' | 'en' | 'id-mod'` are byte-identical to
the corresponding typing in the data model doc; drift blocks the
run.

### 4.4 Scope

A card with **two** multi-line text inputs:

| Field | Input | Default | Storage |
|---|---|---|---|
| `topics` | `<Textarea>` (one item per line) | (empty) | `string[]` |
| `excludedTopics` | `<Textarea>` (one item per line) | (empty) | `string[]` |

Lines are trimmed; blank lines are dropped on save.

> **Per-surface default divergence (intentional, per `docs/be/MVP.md` §8):** the FE `DEFAULT_AI_SETTINGS.whatsappAutoReply.enabled = true` (this spec §4.6) is a **UI preference default** — the toggle renders as on when the operator first opens `/ai-settings`. The BE `src/ai/settings/defaults.js` ships `whatsappAutoReply.enabled = false` as a **runtime safety default** — the `messages.upsert` handler short-circuits on `enabled === false` so an unconfigured tenant cannot silently auto-reply. The two surfaces reconcile on the first operator Save (PATCH flows FE → `src/ai/settings/store.js`). Documented in `docs/tech/be-data-model.md` §3 (new locked-values row + per-surface default note).

### 4.5 Rules

A single `<Textarea>` reading "Tulis satu aturan per baris." The
operator types one rule per line. Default = `[]` (empty array).

Storage: `rules: string[]`.

### 4.6 WhatsApp auto-reply

| Field | Input | Validation | Default |
|---|---|---|---|
| `enabled` | `<Switch>` (lucide labels `Aktif` / `Nonaktif`) | boolean | `true` |
| `confidenceThreshold` | numeric `<Input type="number">` | in `[0.50, 0.95]`, step `0.05` | `0.7` |

The placeholder shown next to the numeric input is `contoh: 0.8`.
The value `0.8` is **example only** — the default stays `0.7`.

If the operator enters a value outside `[0.50, 0.95]`, the form
shows an inline error "Nilai harus antara 0.50 dan 0.95" and the
Save button is disabled until the value is corrected.

### 4.6.5 Example operator-defined rules (illustrative — NOT defaults)

> **Example** — operator-facing illustrations only. These four rules are
> **not** part of the persisted defaults; the `rules: string[]` field
> starts empty (`[]`) when an operator first opens `/ai-settings`. The
> rules below are samples a tenant may copy, adapt, or ignore.
>
> Contoh di bawah ini hanya ilustrasi. Operator TIDAK otomatis
> diberikan aturan-aturan ini — saat pertama kali halaman `/ai-settings`
> dibuka, kolom Rules kosong. Isi sendiri sesuai kebutuhan tenant.
>
> 1. Jangan sebut harga tanpa konfirmasi dari operator.
> 2. Untuk barter atau permintaan di luar transaksi langsung, AI akan menjawab: 'Saya akan menghubungkan Anda dengan staf kami untuk mendiskusikan opsi ini.' dan tidak menawar sendiri.
> 3. Jika kontak menanyakan refund atau eskalasi, selalu minta supervisor sebelum menjawab.
> 4. Jika kontak menulis dalam bahasa campur (Indonesia + Inggris), jawab dalam Bahasa Indonesia formal kecuali mereka jelas menulis English-only.

### 4.7 Hardened rules (read-only card, NOT editable)

This is the seventh card. It is rendered **read-only** with a
title "Aturan yang dikunci", a lock icon (`lucide-react` `Lock`)
on the right of the title row, and the four locked rules listed
below. A one-line note at the bottom reads exactly:

> "Aturan ini dikunci demi keamanan data tenant dan tidak dapat diubah."

The four rules appear in this exact order, byte-for-byte identical
to the `getHardenedRulesBlock()` return value in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md)
§3.2:

1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.

These four lines are LOCKED. Drift between this card and the data
model doc is a blocker (§3.2 of the data model doc).

## 5. Save model + reset

- A primary `<Button>` "Simpan pengaturan" at the bottom of the
  page. There is **no autosave** — the form is local React state
  until the button is pressed.
- On Save, the page calls `useAiSettingsStore.getState().save(next)`,
  shows a success toast "Pengaturan AI disimpan" (`<Toast variant="success">`
  with duration `4000 ms`), and re-renders the form with the saved
  values (so the input boxes show what is now persisted).
- A secondary `<Button variant="secondary">` "Reset ke default"
  sits to the left of Save. Clicking it opens a `<Dialog>` "Yakin
  reset ke pengaturan awal?" with `Reset` and `Batal` actions.
  Resetting calls `useAiSettingsStore.getState().reset()` and
  re-renders the form with the byte-stable defaults
  ([`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md) §"Default values").

## 6. Validation

| Field | Rule | Error message (Bahasa Indonesia) |
|---|---|---|
| `name` | required, ≤ 80 chars | `"Nama wajib diisi."` |
| `role` | required, ≤ 120 chars | `"Peran wajib diisi."` |
| `description` | ≤ 500 chars | `"Deskripsi maksimal 500 karakter."` |
| `topics` / `excludedTopics` | each line ≤ 200 chars | `"Topik maksimal 200 karakter per baris."` |
| `rules` | each line ≤ 300 chars | `"Aturan maksimal 300 karakter per baris."` |
| `confidenceThreshold` | in `[0.50, 0.95]`, step `0.05` | `"Nilai harus antara 0.50 dan 0.95."` |
| Save | disabled while any error is present | — |

## 7. Persistence (`useAiSettingsStore`)

A **NEW** Zustand store slice lives at
`frontend/src/store/useAiSettingsStore.ts`. It does **not** modify
the existing `useUiStore`. The store has:

| API | Description |
|---|---|
| `state: AiSettings` | the current persisted shape |
| `state.save(next: AiSettings): void` | writes through to localStorage and updates state |
| `state.reset(): void` | replaces state with the byte-stable defaults |
| `state.hydrate(): void` | called once on app boot; reads from localStorage if present |

LocalStorage key: `'baileys-frontend:ai-settings'`. The persisted
JSON is a tagged object: `{ version: 1, value: AiSettings }`.
`version: 1` is reserved for future migrations; current readers
ignore it.

The Zustand store selector `useAiSettings()` is the page's read-only
view. The form uses local React state for staged edits; only Save
writes through to the store.

The future backend will replace the localStorage layer with a
`GET/PUT /api/crm/ai/settings` pair declared in
[`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).
The TS interface (`AiSettings`) is unchanged across that migration;
only the store's adapter swaps.

## 8. System prompt composition (preview)

The settings page does NOT render the system prompt. It only owns
the `AiSettings` record. The runtime prompt assembly is:

```
buildSystemPrompt({ language, tenantName })     // from systemPrompt.ts
  + "\n\n# Pengaturan tenant\n"
  + buildSystemPromptFragment(aiSettings)        // user fragment
  + "\n\n" + getHardenedRulesBlock()             // locked block
```

Both functions live in the future `frontend/src/lib/ai/settings.ts`
and are declared in
[`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
The settings page never imports them.

## 9. States

### 9.1 First load (no localStorage row yet)

| Region | UI |
|---|---|
| Header | "Pengaturan AI" + a subtitle "Sesuaikan identitas, suara, dan aturan AI untuk tenant ini." |
| Form | pre-filled with the byte-stable defaults from §4 |
| Hardened-rules card | visible, scroll-locked, lock icon visible |
| Save | enabled |
| Reset | enabled |
| Toast | — |

### 9.2 Loading (hydrate)

A full-page spinner with text "Memuat pengaturan…" while
`hydrate()` resolves. Same path as a network round-trip in the
future.

### 9.3 Error (hydrate fail)

If the persisted JSON is corrupted (invalid JSON, missing keys,
wrong `version`), the page falls back to the byte-stable defaults
and renders a warning banner "Pengaturan tersimpan rusak —
mengembalikan ke default." above the form. `localStorage.removeItem`
is called so the next load is clean.

### 9.4 Saved (post-Save)

The form re-renders with the saved values; success toast appears
(§5). All errors are cleared.

### 9.5 Locked values preserved byte-identically

| Locked value | Source | Preserved? |
|---|---|---|
| `confidenceThreshold` default `0.7` | [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md) §3 | yes |
| Indonesian fallback phrase | `i18n/id.json` `ai.fallback.message` and [`../../../crm/features/ai-chat/systemPrompt.md`](../../../crm/features/ai-chat/systemPrompt.md) | yes (not edited here, but not drifted) |
| `Grup belum dinamai` placeholder | [`../../../frontend/general/MODULE_OVERVIEW.md`](../../../frontend/general/MODULE_OVERVIEW.md) §7 | yes |
| `senderPn` display rule | same | yes |
| `AIReplyMode` literal | [`../../../frontend/src/types/crm.ts`](../../../frontend/src/types/crm.ts) | yes |
| Stack pins (Vite 5.x, React 18.x, TypeScript 5.x, Tailwind 3.x, React Router 6.x, TanStack Query 5.x, Zustand 4.x, lucide-react latest, dayjs 1.x, zod 3.x, shadcn/ui latest) | [`../../../tech/frontend-stack.md`](../../../tech/frontend-stack.md) | yes |
| Three language option labels: `"Indonesia"`, `"English"`, `"Modern Indonesia"` | this doc §4.3 | yes (enforced by vitest snapshot) |
| Four hardened rules (Bahasa Indonesia, in canonical order) | this doc §4.7 + data model doc §"Hardened-rules block" | yes (byte-identical across both docs) |

Any drift blocks the run.

## 10. Out of scope

- Real-time LLM tuning sliders (temperature, top-p, etc.). The
  threshold knob is the only numeric lever.
- Editing the four hardened rules. They are intentionally
  non-customizable per the user directive.
- A "test my AI" playground on the settings page. The `/ai` page
  is the playground.
- Per-contact overrides (e.g., "for Contact A, use a stricter
  threshold"). The WhatsApp auto-reply is per-chat contact-scoped
  (§5 of [`./ai-autoreply/spec.md`](./ai-autoreply/spec.md)) which
  already gives per-contact safety; per-contact voice is future work.
- Multi-tenant routing on this page; this run is single-tenant.

## 11. Cross-references

- Product framing: [`prd.md`](prd.md).
- Data model + system prompt template: [`../../../tech/ai-settings-data-model.md`](../../../tech/ai-settings-data-model.md).
- The AI chat page that consumes these settings: [`../ai-chat/spec.md`](../ai-chat/spec.md).
- Canonical system prompt: [`../ai-chat/systemPrompt.md`](../ai-chat/systemPrompt.md).
- Navigation changes: [`../navigation/spec.md`](../navigation/spec.md).
- Data model + threshold: [`../../../tech/crm-data-model.md`](../../../tech/crm-data-model.md).
- API contract (future, all `[mock]`): [`../../../frontend/api/api-spec.md` §6](../../../frontend/api/api-spec.md).

The examples in §4.6.5 are operator-facing illustrations only and are not seeded into new tenants. Tenants that want any of those behaviors must add them manually in the Rules field on first visit.
