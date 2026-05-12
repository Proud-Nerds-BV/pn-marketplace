---
name: progress-implement
description: Implements a Jira story (or a batch of stories) test-first in Claude Code. Single mode runs the canonical red -> green -> refactor -> error-handling TDD cycle per Acceptance Criterion, writes a pre-edit `blast-radius.md`, and produces append-only scratchpad artefacts at `docs/pn/stories/<KEY>/`. `--batch` mode fans out via the Ralph pattern (one sub-agent per story matching `"PN Phase" = todo AND "PN Actor" = AI`) while the invoking agent stays on as oracle/coordinator and snapshots context per sub-agent. Mutates `PN Phase` from `todo` to `progress` at start and from `progress` to `review` at completion, transitioning Jira status `To Do -> In Progress -> In Review` to match. Trigger when the user runs `/pn-dev:progress-implement`, asks to "implement the story", "start the TDD loop", "process the AI backlog", "build this ticket", or when a story is in `pn_phase = todo` and ready to start. Refuses on author == reviewer drift, missing blast-radius, missing test framework, or external `PN Phase` / Jira-status edits that would conflict with the planned mutation.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue
---

# progress-implement

Implements a Jira story (or a batch) end-to-end using strict test-driven development. The skill picks up a story whose `PN Phase = todo`, captures the expected blast-radius before touching source, runs a red -> green -> refactor -> error-handling cycle per Acceptance Criterion, appends progress to the story scratchpad, and on success advances the story through `PN Phase: todo -> progress -> review` with the matching Jira status transitions. In `--batch` mode it fans out across the Ready+Actor=AI backlog using the Ralph pattern: one sub-agent per story, the invoking agent retained as oracle, snapshots taken per sub-agent, no peer-to-peer coordination.

## When to use

- DEV starts work on a single Ready story (default single mode).
- TL processes the Ready+Actor=AI backlog in parallel (`--batch`).
- Re-entering an in-progress story to continue the TDD loop where it left off (single mode is idempotent and append-only).

## When not to use

- The story has no Acceptance Criteria filled in; route the user back to `estimate-check-ticket`.
- `PN Phase` is past `progress` (e.g., `review`, `handover`, `deploy`, `done`); refuse and surface the drift.
- The repository has no detectable test framework; refuse and route to `bootstrap-project`.
- The PR author and `git config user.email` would match for the eventual peer review; advisory only here (hard refusal lives in `review-pr`).

## Modes

### Single mode (default)

1. Resolve the current story key:
   - From `--key=<KEY>` argument if provided.
   - Else from the current git branch (`feature/<KEY>-*`, `bugfix/<KEY>-*`, `hotfix/<KEY>-*`).
   - Else refuse with a clear message.
2. Read the story from Jira via `mcp__claude_ai_Atlassian__getJiraIssue`. Capture: summary, `Acceptance Criteria` custom field, `Expected Scope`, `PN Phase`, `PN Actor`, Jira status.
3. Drift check (read-before-write): if `PN Phase` is not in {`todo`, `progress`} or Jira status is not in {`To Do`, `In Progress`}, refuse and cite both values plus any mismatch between them. No writes.
4. Mutate `PN Phase: todo -> progress` and transition Jira status `To Do -> In Progress` if not already there. Single-source-of-truth ordering: write `PN Phase` first, then transition Jira status; verify both before continuing.
5. Write the pre-edit `blast-radius.md` (see "Blast-radius procedure"). If the skill cannot produce one, it refuses to edit source.
6. For each AC in order:
   - **Red:** write a failing test that pins the AC behaviour; run the project's test runner; confirm it fails for the right reason. Record verbatim failure output to `tests.md`.
   - **Green:** make the smallest source edit that turns the test green; rerun the runner; confirm green.
   - **Refactor:** clean up under green tests; rerun to confirm still green.
   - **Error-handling:** add at least one negative-path test (invalid input, boundary, failure injection); make it pass; rerun all.
   - Append a dated entry to `notes.md` summarising the cycle and any ADR triggers (see "Scratchpad rules").
7. After all AC are green and the diff contains no untracked `TODO`/`FIXME` markers, mutate `PN Phase: progress -> review` and transition Jira status `In Progress -> In Review`. Verify both.
8. Print an exit summary citing: story key, AC count, tests added, files changed, prior `PN Phase`, prior Jira status, new `PN Phase`, new Jira status, and any drift observed during the run.

### `--batch` mode (Ralph pattern)

1. JQL fetch via `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql`: `"PN Phase" = todo AND "PN Actor" = AI AND project = <key>` (epic-scoped if `--epic=<KEY>` is passed).
2. If the result is empty, print an informational message ("no Ready+Actor=AI stories; nothing to do") and exit with status 0. Write nothing to Jira or the repo.
3. For each story in the result, dispatch one sub-agent that runs single-mode for that story. Snapshot the main-agent context per sub-agent before dispatch.
4. The invoking agent stays on as oracle/coordinator. Sub-agents do not coordinate with each other; all cross-talk routes through the oracle.
5. Supervise via messages. If a sub-agent surfaces a hard block (merge conflict with `main` or `develop`, hook hard-block, refusal due to drift), pause that sub-agent, surface the issue to the user, and continue the others.
6. On completion, print a per-story verdict table: story key, AC count, status (passed / refused / blocked), exit `PN Phase`, exit Jira status.

## TDD cycle (explicit)

Per Acceptance Criterion, in order, never collapsed:

1. **Red** ; write the failing test; run; capture failure.
2. **Green** ; minimal implementation; run; capture pass.
3. **Refactor** ; clean under green tests; run; confirm still green.
4. **Error-handling** ; at least one negative-path test; run; confirm pass.

The skill must not advance to the next AC until all four sub-steps for the current AC are green. The skill must not bypass, suppress, or retry around a `tdd-enforce` hook warning or block; on a hard block it surfaces and stops.

## Blast-radius procedure

Before the first source edit in any run, write `docs/pn/stories/<KEY>/blast-radius.md`:

```yaml
---
prd: PRD-004
plan: PLAN-001
key: <JIRA-KEY>
author: <git config user.name>
date: <YYYY-MM-DD>
---
```

Body:

- **Files expected to change:** bullet list derived from AC + Expected Scope.
- **Files imported by the changed files:** query `.pn/index/index.sqlite` (the code-knowledge layer); list the import edges.
- **Files importing the changed files:** reverse query; list the reverse-import edges.
- **Modules touched:** unique top-level module list.
- **Risk notes:** any cross-module contract changes, public-API changes, or non-obvious refactors.

If the code-knowledge layer is empty or unreachable, fall back to `grep`-based imports and note the fallback in the body. The blast-radius file is the single pre-condition for source edits; without it the skill refuses.

## Scratchpad rules

Files under `docs/pn/stories/<KEY>/`:

| File | Content |
|------|---------|
| `notes.md` | Append-only narrative: dated entries per AC cycle; ADR triggers (when a deviation needs an ADR, reference the ADR slug); blockers; questions for the PO. |
| `tests.md` | Append-only verbatim test failures + verbatim pass output, per AC, per sub-step. |
| `blast-radius.md` | Single-section file rewritten only when the planned scope materially changes; prior versions move to `blast-radius.history/<timestamp>.md` rather than being overwritten. |

All three files carry frontmatter linking `prd: PRD-004`, `plan: PLAN-001`, `key: <JIRA-KEY>`, and `author: <git config user.name>`. History is never rewritten in place.

## Edge cases

- **Empty backlog (`--batch`)**: exit cleanly with informational message and exit code 0; no writes.
- **Author == reviewer drift detected**: refuse; cite the offending identity; route the user to swap reviewers.
- **No test framework detected**: refuse; route to `bootstrap-project`; do not stub a fake runner.
- **Merge conflict with the integration branch during `--batch`**: pause the affected sub-agent; surface the conflict to the oracle; continue other sub-agents.
- **External `PN Phase` edit between invocations**: read-before-write detects the drift; refuse if the new value is incompatible; cite both `PN Phase` and Jira status in the refusal.
- **Manual Jira status transition between invocations**: same as above; the skill respects manual transitions and never auto-resolves drift.
- **Untracked `TODO`/`FIXME` in the diff at completion**: refuse the `progress -> review` mutation; surface the offending lines.
- **Acceptance Criteria empty on the Jira story**: refuse with a route to `estimate-check-ticket`.

## `pn_phase` transitions

| When | From | To | Jira status mapping |
|------|------|----|---------------------|
| Run start (single or batch sub-agent) | `todo` | `progress` | `To Do -> In Progress` |
| All AC green + clean diff | `progress` | `review` | `In Progress -> In Review` |

Each mutation is read-before-write and verifies both the new `PN Phase` value and the new Jira status before the skill exits.
