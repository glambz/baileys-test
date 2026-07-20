<!--
OWNER: @product-management
VERSION: 0.1.0
LAST_MODIFIED: 2026-07-02
DEPENDS_ON:
  - docs/crm/features/ai-chat/systemPrompt.md (system prompt SSoT)
  - docs/crm/features/ai-settings/spec.md (form, persistence)
  - docs/crm/features/ai-chat/spec.md (consumer)
  - docs/crm/features/ai-autoreply/spec.md (WhatsApp auto-reply consumer)
  - docs/tech/crm-data-model.md (threshold 0.7)
-->

# Tech Spec — AI Settings data model + system prompt template

> This doc is the **TypeScript-level Single Source of Truth** for
> the per-tenant AI Settings shape, the byte-stable default values,
> the system-prompt-template fragment, and the **hardened-rules
> block** (`getHardenedRulesBlock()`). It pairs with
> [`../crm/features/ai-settings/spec.md`](../crm/features/ai-settings/spec.md)
> (the product spec) — the two documents must agree on the four
> hardened rules, byte-for-byte.

## 1. TypeScript interfaces

```ts
/**
 * Tone of voice the AI uses. The runtime consumes this through
 * `buildSystemPromptFragment(settings)` — see §4. The literal union
 * is byte-identical to the table in
 * `docs/crm/features/ai-settings/spec.md` §4.2.
 */
export type AiTone =
  | 'formal'
  | 'casual'
  | 'friendly'
  | 'concise'
  | 'enthusiastic';

/**
 * Output language. `id` is Bahasa Indonesia (formal), `en` is English,
 * `id-mod` is Bahasa Indonesia colloquial / "Modern Indonesia". The
 * literal union is byte-identical to the enum and the user-specified
 * labels ("Indonesia" / "English" / "Modern Indonesia") in
 * `docs/crm/features/ai-settings/spec.md` §4.3.
 */
export type AiLanguage = 'id' | 'en' | 'id-mod';

export interface AiIdentity {
  name: string;            // required, <= 80 chars
  role: string;            // required, <= 120 chars
  description: string;     // optional, <= 500 chars
}

export interface AiScope {
  topics: string[];        // newline-split at save time
  excludedTopics: string[]; // newline-split at save time
}

export interface AiWhatsappAutoReply {
  enabled: boolean;
  /** In [0.50, 0.95], step 0.05. Default 0.7. */
  confidenceThreshold: number;
}

/**
 * The full per-tenant AI Settings record. This is the shape persisted
 * to localStorage under the key `baileys-frontend:ai-settings` and
 * (later) to the future `PUT /api/crm/ai/settings` endpoint.
 */
export interface AiSettings {
  identity: AiIdentity;
  tone: AiTone;
  language: AiLanguage;
  scope: AiScope;
  rules: string[];                 // one rule per element
  whatsappAutoReply: AiWhatsappAutoReply;
  /** ISO 8601 timestamp. Bumped on every successful save. */
  updatedAt: string;
}
```

## 2. Locked values (byte-identical to other docs)

| # | Locked value | Source |
|---|---|---|
| 1 | `AiLanguage = 'id' | 'en' | 'id-mod'` | this doc §1 + `docs/crm/features/ai-settings/spec.md` §4.3 |
| 2 | `AiTone = 'formal' | 'casual' | 'friendly' | 'concise' | 'enthusiastic'` | this doc §1 + `docs/crm/features/ai-settings/spec.md` §4.2 |
| 3 | `confidenceThreshold` default `0.7`, range `[0.50, 0.95]`, step `0.05` | `docs/tech/crm-data-model.md` §3 + settings spec §4.6 |
| 4 | `localStorage` key `'baileys-frontend:ai-settings'` | this doc §5 |
| 5 | Four hardened rules (Bahasa Indonesia, in canonical order) | this doc §3 + settings spec §4.7 |
| 6 | Indonesian fallback phrase (untouched here, but no drift) | `frontend/src/i18n/id.json ai.fallback.message` |
| 7 | `pane1Selection` literal union now includes `'settings'` | `docs/crm/features/ai-settings/spec.md` §3 |
| 8 | `name` default `"Baileys Studio AI Assistant"` | settings spec §4.1 + this doc §"Default values" |
| 9 | `role` default `"Agen CS WhatsApp"` | settings spec §4.1 + this doc §"Default values" |
| 10 | `tone` default `'friendly'` | settings spec §4.2 + this doc §"Default values" |
| 11 | `language` default `'id'` | settings spec §4.3 + this doc §"Default values" |

## 3. Hardened-rules block

The **hardened-rules block** is the four Bahasa Indonesia rules
that the operator cannot edit, appended to the system prompt
unconditionally. It is exported as a function that returns a
**byte-stable** string, so a vitest snapshot can lock the return
value once and reject any future drift.

### 3.1 `getHardenedRulesBlock(): string`

```ts
/**
 * Returns a byte-stable string listing the four non-customizable
 * hardened rules in Bahasa Indonesia. This block is appended to the
 * system prompt AFTER the user's customized fragment, regardless of
 * what the operator types in the AI Settings form.
 *
 * The four lines appear in the canonical order:
 *   1. WhatsApp `contact_id` filter
 *   2. WhatsApp data source restriction (chat's contact + KB only)
 *   3. Dashboard `/ai` full-data scope
 *   4. AI writes only to CRM (never to KB)
 *
 * Drift from `docs/crm/features/ai-settings/spec.md` §"Hardened
 * rules" is a blocker. The vitest spec
 * `__tests__/getHardenedRulesBlock.test.ts` asserts byte-equivalence.
 */
export function getHardenedRulesBlock(): string;
```

### 3.2 The return value (byte-exact, locked)

The string returned by `getHardenedRulesBlock` is exactly the
following UTF-8 text — no leading or trailing whitespace, no
trailing newline, four items joined by single newlines:

```
1. Layanan WhatsApp WAJIB memfilter data berdasarkan `contact_id` chat. Data milik kontak lain TIDAK BOLEH diakses.
2. Layanan WhatsApp HANYA boleh menggunakan data kontak terkait dan basis pengetahuan (knowledge DB). Tidak ada akses ke data CRM kontak lain.
3. Dashboard `/ai` (halaman ini) boleh mengakses basis pengetahuan DAN seluruh data CRM tenant untuk tanya jawab internal.
4. AI HANYA boleh menulis ke CRM (data entitas). AI TIDAK BOLEH menulis ke knowledge DB untuk mencegah penyalahgunaan data.
```

The **same four lines appear** in
[`../crm/features/ai-settings/spec.md`](../crm/features/ai-settings/spec.md)
§"Hardened rules (read-only card)" §4.7, with the **same line
breaks, the same capitals, the same backticks**. The vitest spec
[`../crm/features/ai-chat/systemPrompt.test.ts`](../crm/features/ai-chat/systemPrompt.test.ts)
asserts byte-equivalence between the two restatements at every
test run.

### 3.3 Why a separate function

A separate function (rather than inlining the four rules into
`buildSystemPromptFragment`) makes the rule that "the hardened
block always wins" mechanically checkable: any caller of the system
prompt MUST call `getHardenedRulesBlock()` and append its return
value; the call site can be grep'd.

## 4. Default values + system prompt template

### 4.1 Byte-stable defaults

| Field | Value |
|---|---|
| `identity.name` | `"Baileys Studio AI Assistant"` |
| `identity.role` | `"Agen CS WhatsApp"` |
| `identity.description` | `"Asisten AI internal untuk menjawab pertanyaan tim tentang tenant ini."` |
| `tone` | `'friendly'` |
| `language` | `'id'` |
| `scope.topics` | `[]` |
| `scope.excludedTopics` | `[]` |
| `rules` | `[]` |
| `whatsappAutoReply.enabled` | `true` |
| `whatsappAutoReply.confidenceThreshold` | `0.7` |
| `updatedAt` | `'2026-07-02T00:00:00.000Z'` (initial value; bumped on every save) |

A constant `DEFAULT_AI_SETTINGS: AiSettings` exports this object
and is the single source of truth that
`useAiSettingsStore.reset()` and `__tests__/ai-settings.test.tsx`
both consume.

### 4.2 `buildSystemPromptFragment(settings: AiSettings): string`

```ts
/**
 * Build the per-tenant-customized prompt fragment from the
 * operator-controlled `AiSettings`. The result is APPENDED after
 * `buildSystemPrompt({ language, tenantName })` (from
 * `frontend/src/lib/ai/systemPrompt.ts`) and BEFORE the hardened
 * rules block from §3.
 *
 * The fragment does NOT itself contain the four hardened rules;
 * see `getHardenedRulesBlock()`.
 *
 * The runtime never re-orders the three blocks:
 *   base prompt
 *     -> per-tenant fragment (this function)
 *       -> hardened rules block (getHardenedRulesBlock)
 */
export function buildSystemPromptFragment(settings: AiSettings): string;
```

#### Output sketch

The function emits a Markdown block roughly shaped as follows
(exact wording is locked by the vitest snapshot; the byte-stable
content here is illustrative, the literal text is locked by tests):

```
# Pengaturan tenant

## Identitas
Anda adalah <identity.name> — <identity.role>.
<identity.description>

## Suara & nada
- <one bullet describing the chosen tone semantics>

## Bahasa
Bahasa yang digunakan: <id|en|id-mod>.

## Topik yang dibahas
- <one bullet per scope.topics entry>

## Topik yang dikecualikan
- <one bullet per scope.excludedTopics entry>

## Aturan tambahan
1. <rules[0]>
2. <rules[1]>
...
```

Empty sections are dropped (e.g. if `scope.topics.length === 0`,
the "Topik yang dibahas" section is omitted; same for excluded
and rules).

### 4.3 What is NOT rendered

| Field in `AiSettings` | Where consumed |
|---|---|
| `whatsappAutoReply.enabled` | the WhatsApp auto-reply pipeline gates itself on this flag at decision time; it is NOT rendered into the prompt |
| `whatsappAutoReply.confidenceThreshold` | the WhatsApp auto-reply pipeline uses this threshold at decision time instead of the system default `0.7`; NOT rendered into the prompt |
| `updatedAt` | a UI metadata field shown in the settings page "last saved" affordance; NOT rendered into the prompt |

## 5. Storage

### 5.1 Now (this run)

- Path: `localStorage` under the key **`'baileys-frontend:ai-settings'`**.
- Shape: a tagged JSON object — `{ version: 1, value: AiSettings }`.
  The `version` field is reserved for future migrations; current
  readers ignore it. A missing or `version !== 1` row triggers the
  `hydrate()` fallback (§3 of the settings spec §"States").
- Adapter: `useAiSettingsStore` at
  `frontend/src/store/useAiSettingsStore.ts` (a new Zustand slice
  **separate from** `useUiStore`).

### 5.2 Future (BE persistence)

- Endpoint: `GET /api/crm/ai/settings` and
  `PUT /api/crm/ai/settings` (declared in
  `docs/frontend/api/api-spec.md` §6 with `[mock]` until the
  backend lands).
- The `AiSettings` TypeScript interface is unchanged across the
  migration; only the adapter in
  `frontend/src/store/useAiSettingsStore.ts` swaps.
- The localStorage key `'baileys-frontend:ai-settings'` is kept as
  an offline cache for `getState().hydrate()`; on `PUT` success the
  cache is updated.

## 6. Cross-references

- Product spec: [`../crm/features/ai-settings/spec.md`](../crm/features/ai-settings/spec.md).
- PRD: [`../crm/features/ai-settings/prd.md`](../crm/features/ai-settings/prd.md).
- The `/ai` page that consumes the fragment: [`../crm/features/ai-chat/spec.md`](../crm/features/ai-chat/spec.md).
- The WhatsApp auto-reply that consumes the threshold + fragment: [`../crm/features/ai-autoreply/spec.md`](../crm/features/ai-autoreply/spec.md).
- Canonical system prompt: [`../crm/features/ai-chat/systemPrompt.md`](../crm/features/ai-chat/systemPrompt.md).
- Data model + threshold `0.7`: [`crm-data-model.md`](crm-data-model.md).
- Future API endpoints: [`../frontend/api/api-spec.md` §6](../frontend/api/api-spec.md).
