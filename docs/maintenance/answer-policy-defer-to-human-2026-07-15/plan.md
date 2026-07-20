# Plan — Answer Policy: don't answer when KB has no direct answer; flag for human

> **Cycle id**: be-answer-policy-2026-07-15
> **Run id**: WF_BUGFIX-answer-policy-defer-to-human-2026-07-15
> **Triggered by**: user report 2026-07-15T16:35:36+07:00 — WhatsApp AI replied with stitched "kami menyediakan landing page [1] ... hubungi CS di 6285179652486 (24 jam)" when the KB has no services info. The AI confabulated an answer from tangential KB chunks (CS contact + 24-hour chunks) and named its own number.
> **Classification**: BUG_FIX (per ROUTING.md §1 precedence)
> **User intent**: "the ai shouldn't answer when it doesn't have answer to the questions, and flag in the UI to ask for human help."

## 1. Scope

### In scope (5 file changes)

| File | Change |
|---|---|
| `src/ai/retrieval/hybrid.js` | Activate `TAU_TURBO = 0.30` (was 0.0 = MVP-disabled per G-AI-8 resolution). When `retrievalScore < 0.30`, return empty chunks. Closes G-AI-8. |
| `src/ai/settings/composer.js` + FE mirror `frontend/src/lib/ai/systemPrompt.ts` | When `tone === 'warm-casual-indo'` (or any opt-in tone), the per-tenant fragment gets an explicit "don't confabulate from tangential CONTEXT" rule. New rule lives in the per-tenant fragment, NOT the byte-locked base prompt, so byte-identity is preserved. |
| `src/ai/whatsapp/trigger.js` | When `parsed.fallback_used === true` AND chat is `ai` mode, transition to `human_pending_flag` BEFORE sending the reply. (Currently the fallback is sent as a normal `ai` reply — no handoff signal in the UI.) |
| `src/ai/whatsapp/trigger.js` | Reply text is the locked fallback phrase verbatim when fallback_used=true. The existing "step 8.5 fallback augmentation" comment block already documents this; the behavior is correct, just need to ensure the turbo_cutoff path also uses it. |
| `frontend/src/components/chats/messagebubble.tsx` | New optional prop `isFallback: boolean`. When true, render a small "🤝 butuh bantuan manusia — silakan dijawab manual" indicator under the message bubble. |

### Out of scope

- The 1 pre-existing test failure (FE/BE fallback-text drift on `BAILEYS_AI_SYSTEM_PROMPT_ID`) — already closed in the prior cycle (2026-07-15T09:08:30).
- The pre-existing 1 test failure in `composer-byte-identity.test.mjs` byte-source check — already resolved.
- The per-tenant fragment's new "don't confabulate" rule is *conditional* on tone; the base prompt and existing tone descriptions are untouched.
- The `confidenceThreshold: 0.3` in `ai_settings.whatsapp_auto_reply` (currently the active value) is a different threshold — for the LLM's confidence, not the retrieval. This plan does not change it.

## 2. Why these 5 changes

1. **TAU_TURBO = 0.30**: when the LLM has no direct answer in CONTEXT, the turbo cutoff kicks in. Empty chunks → LLM has nothing to cite → `fallback_used: true` → bot sends the locked fallback phrase. This prevents the LLM from confabulating from tangential chunks (CS contact, 24-hour info).
2. **Per-tenant "don't confabulate" rule**: defensive layer in case turbo_cutoff misses the threshold for a marginal question. The LLM gets explicit instruction: if CONTEXT doesn't directly address the question, fall back. This is tone-gated so it doesn't break the formal-tone use case.
3. **Transition to `human_pending_flag` on fallback**: makes the UI show the human-handoff indicator, satisfying the user's "flag in the UI to ask for human help" requirement.
4. **Fallback phrase in turbo_cutoff path**: confirms the same locked phrase is used regardless of which gate fires.
5. **FE `isFallback` badge**: surfaces the handoff to the operator. The chat's `ai_mode` toggle already exists; the bubble-level indicator is the per-message complement.

## 3. TDD plan

### 3.1 RED — write failing tests first

| Test | Expected: RED (current code) |
|---|---|
| `src/test/answer-policy-tau-turbo.test.mjs` — when top retrieval score is 0.20, hybrid returns empty chunks | current code: `TAU_TURBO = 0.0`, so chunks are returned even at low score → test FAILS |
| `src/test/answer-policy-warm-persona.test.mjs` — when tone is `warm-casual-indo`, the per-tenant fragment contains the anti-confabulation rule | current code: fragment has no anti-confabulation rule → test FAILS |
| `src/test/answer-policy-handoff.test.mjs` — when LLM returns `fallback_used: true`, the trigger transitions the chat to `human_pending_flag` BEFORE sending | current code: no transition → test FAILS |
| `frontend/src/components/chats/__tests__/messagebubble.test.tsx` (NEW file) — when `isFallback=true`, the bubble renders the handoff indicator | current code: no `isFallback` prop → test FAILS |
| `src/test/answer-policy-regression.test.mjs` — a question with a high-score KB match still answers normally (regression guard) | current code: passes already; will continue to pass after the fix |

### 3.2 GREEN — apply the 5 file changes

### 3.3 REFACTOR — review

- Audit: are the tests symmetric? Does the byte-identity invariant hold?
- Check: did the LLM stop confabulating? (smoke test with curl to `/api/crm/ai/ask` with the services question)

## 4. Risks

| Risk | Mitigation |
|---|---|
| TAU_TURBO = 0.30 may be too aggressive — some valid questions with lower retrieval scores would now fallback | The settings already have a per-tenant `confidenceThreshold` field. Future: surface `TAU_TURBO` as a per-tenant setting. For now, 0.30 is the value the FE PRD documented (G-AI-8 resolution). |
| FE `isFallback` prop requires every `MessageBubble` caller to pass it; risk of one path omitting the prop | Add a default `false` so existing callers are unaffected; the WhatsApp thread is the only caller that needs to set it to true (only when the audit row shows `fallback_used`). |
| The "don't confabulate" rule in the per-tenant fragment is gated on tone — users who pick `friendly` (default) don't get the rule, so they could still see the bug | Mitigation: either default the rule for ALL tones, OR add a new scope.decided-by setting. For now: gate on `warm-casual-indo` (the operator's chosen tone) per the user's direction. Document the limitation. |
| The trigger.js change to transition on `fallback_used: true` may conflict with the locked-fallback-phrase pattern (the LLM ALWAYS returns the fallback phrase when it can't answer; sometimes a `fallback_used: true` reply is actually a "good" answer that we want to send) | The "good fallback" case IS the human-handoff case. The user explicitly wants the AI to NOT answer in this case and the human to take over. So transitioning on `fallback_used: true` is correct. The locked phrase is still sent as the visible reply (the contact sees "kak, butuh bantuan manusia ya 🙏"), AND the chat goes to `human_pending_flag` so the operator knows to take over. |

## 5. Definition of done

1. All 4 RED tests fail against current code.
2. All 4 GREEN tests pass after the fix.
3. Full BE suite: 134/137 (0 failed — 3 skipped preserved).
4. Full FE suite: 80+ tests pass.
5. `composer-byte-identity.test.mjs` 7/7 still pass (FE mirror updated symmetrically).
6. Smoke test: `curl /api/crm/ai/ask` with "jasa apa saja yang ditawarkan" returns the fallback phrase, NOT a stitched answer.
7. `OrchestratorState`, `DecisionLog`, `AuditReport` updated. `_SOT_INDEX` updated with the new artifacts.
