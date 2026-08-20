# CLAUDE.md

# Kilo — Build the App

Kilo is a small set of behavior-shaping skills for building an app. The agent that loads this file is one developer working on one codebase. There are no other personas to coordinate.

## The Rule

**Invoke the relevant Kilo skill BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If a skill applies, use it. Announce "Using `<skill-name>` to <purpose>" and follow the skill.

If a skill does not apply, do not invoke it.

## The Workflow

```
1. brainstorming              → decide what kind of task this is, refine intent
2. writing-app-spec           → architectural changes: produce docs/app-architecture.md
3. writing-implementation-plan → produce docs/plans/YYYY-MM-DD-<feature>.md (TDD per task)
4. using-git-worktrees        → isolated workspace + clean baseline
5. executing-plans            → run the plan task-by-task
6. test-driven-development    → every task: failing test → minimal code → green
7. systematic-debugging       → any bug, before proposing a fix
8. human-verification-checklist → generate interactive HTML for your manual pass. Each rendered checklist ships with a floating "Copy report" button so the reviewer can paste verdicts + notes straight back to the agent as rework input.
9. finishing-a-development-branch → tests green → merge / PR / keep
```

Skills compose. Use one at a time, in the order above.

## Persistent vs Per-Feature

| Artifact | Lifetime | Owner |
|---|---|---|
| `docs/app-architecture.md` | Lives with the app | You + agent, updated on architectural changes |
| `docs/plans/*.md` | One per feature | Plan-writing skill |
| `tests/...` | Live with the app | TDD discipline |
| `verification/<feature>.html` | One per feature | You, after implementation |

The architecture document is read at the start of every plan to make sure the plan respects it.

## Hard Rules

- No production code without a failing test first (TDD).
- No fix without root cause investigation (debugging).
- No completion claim without fresh verification (run the test command, then read the output).
- No skipping the brainstorming classification. Spike / bounded / architectural.
- The architecture doc is owned by you. The agent proposes changes; you approve.

## Token Economy

Keep every response short. The user knows the codebase. Do not re-explain what you just read.