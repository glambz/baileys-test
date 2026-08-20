---
name: human-verification-checklist
description: Use after implementation is complete and automated tests pass, before claiming a feature is done
---

# Human Verification Checklist

Automated tests prove the code does what the tests assert. They don't prove the app behaves correctly to the user. That's your job.

**Output:** `verification/<feature-name>.html` — an interactive checklist you fill in while clicking through the live app.

## Why

- Agent-driven visual verification burns tokens and hallucinates layout details.
- You own the spec mentally. Only you know what the screen is supposed to do.
- Notes attached to a check ("saves correctly but field X should be freetext") are **rework input** for the next plan iteration.

## When to Generate

After `executing-plans` reports all tasks complete and the full test suite passes. Before `finishing-a-development-branch`.

## Process

1. Read `docs/plans/YYYY-MM-DD-<feature>.md`.
2. For each acceptance criterion in the plan, derive one or more verification checks — observable behaviors the user can confirm by interacting with the live app.
3. Write a `verification-checks.json` file alongside the plan (or as a section in it).
4. Run the renderer (the `human-verification-checklist` helper) to produce `verification/<feature-name>.html`.
5. Tell the user the file is ready and how to open it.

## A Good Check

```markdown
- [ ] **VC-1.1: Save form persists data**
  - **Given** the form is filled with valid values
  - **When** the user clicks "Save"
  - **Then** the data is persisted and the user sees a success message
```

Each check has:

- **ID** (e.g. `VC-1.1` linking to acceptance criterion `AC-1`)
- **Title** — short, observable
- **Steps** — what to do in the UI
- **Expected** — what should happen

The user records for each check:

- **Status:** `PASS` / `FAIL` / `BLOCKED`
- **Observed:** what actually happened (especially when status ≠ PASS)
- **Notes:** free-form (e.g. "the dropdown for state should be freetext")

## Schema (`verification-checks.json`)

```json
{
  "feature": "Add password reset",
  "date": "2026-08-17",
  "plan": "docs/plans/2026-08-17-password-reset.md",
  "checks": [
    {
      "id": "VC-1.1",
      "title": "Save form persists data",
      "steps": ["Fill form with valid values", "Click Save"],
      "expected": "Data persisted, success message shown"
    }
  ]
}
```

See `.kilo/templates/verification-checks.schema.json` for the full schema.

## After Verification

- All checks PASS → invoke `finishing-a-development-branch`.
- Any FAIL → return to `writing-implementation-plan` (or to TDD execution) to address. Notes are the spec.
- BLOCKED → investigate; usually means the build is broken or the test environment is missing data.

## Compiling the Report

The rendered HTML has a persistent **Copy report** button at the bottom-right. It compiles all verdicts + observed + notes into a markdown block the reviewer can paste straight back:

```
# Verification: <feature name>
Date: <ISO timestamp>
Plan: <plan path>

[x] [VC-1.1 · group] <title>  —  PASS
  Observed: ...
  Notes: ...

[!] [VC-2.3] <title>  —  FAIL
  Observed: ...
  Notes: ...

[ ] [VC-3.1] <title>  —  PENDING

---
Summary: N pass, M fail, B blocked, P pending.
```

Just paste that back as the verification result. The agent uses it as rework input.

The template falls back to a manual-copy textarea if `navigator.clipboard.writeText` is unavailable (e.g. `file://` in some browsers, or non-secure contexts).

## Anti-Rationalization

| Excuse | Reality |
|---|---|
| "Tests pass, so it works" | Tests test the code. The user tests the app. Different things. |
| "The agent should screenshot and verify" | Screenshots hallucinate layout. You have eyes. |
| "I'll do it later" | Later is after merge. Bugs caught pre-merge are cheap. After-merge are expensive. |
| "It's obvious the form saves" | Is it? Open the app. Click. See. |