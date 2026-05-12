---
name: estimate-check-ticket
description: Validates every Jira story under an epic against five checks (AC measurable, Expected Scope filled, single concern, estimated under threshold, dependencies declared) and writes per-story verdict files at docs/pn/validations/<KEY>.md. Sets Validation Passed custom field to Yes or No on each story. When a story is too large, proposes 2-4 split candidates and refuses to pass it until the split is actioned. On all stories passing with PO approval, advances PN Phase from estimate to approval on the epic. Use when the user invokes /pn-po:estimate-check-ticket, asks to validate stories, or when pn_phase on the epic is estimate and stories have been created by estimate-write-prd.
allowed-tools: Read, Write, Edit, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__createIssueLink
---

# estimate-check-ticket

Validates Jira stories under an epic and enforces a pass/fail gate before the team commits to planning. Stories that are too large, ambiguous, or missing required fields are blocked with a concrete fix-list. All-pass triggers the `estimate -> approval` phase transition on the epic.

`pn_phase` value: `estimate` (on entry); `approval` (on all-stories-pass + PO approval)

## When to use

- `pn_phase` on the epic is `estimate`.
- Stories exist under the epic (created by `estimate-write-prd`).
- The user wants to validate one, several, or all stories.

## When not to use

- No stories exist under the epic; run `estimate-write-prd` first.
- `pn_phase` is `approval` or later; validation is already complete. Re-run only with `--force` to re-validate after manual story edits.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) | Argument or user message | Yes |
| Story key(s) to validate | Optional argument; defaults to all stories under the epic | No |
| Split threshold (story points) | `.pn/settings.json` under `validation.split_threshold`; default `8` | No |
| Blast-radius threshold (file count) | `.pn/settings.json` under `validation.blast_radius_threshold`; default `20` | No |

## Outputs

| Artefact | Path / Location | Description |
|----------|-----------------|-------------|
| Verdict file | `docs/pn/validations/<KEY>.md` | Per-story pass/fail with field-by-field check outcomes and fix-list |
| Jira story field | `Validation Passed` on each story | `Yes` (pass) or `No` (fail) |
| Split candidates | Inline in session + in verdict file | 2-4 child story proposals when "too large" |
| Jira epic phase | `PN Phase` on the epic | `estimate -> approval` on all-pass + PO approval |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json`; confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). Abort if any required value is unresolved.
2. Read author from `git config user.name`.
3. Read `validation.split_threshold` (default: `8`) and `validation.blast_radius_threshold` (default: `20`) from `.pn/settings.json`.
4. Call `getJiraIssue` on the epic key. Verify `pn_phase = estimate`. If not, refuse without `--force`.
5. Confirm `docs/pn/validations/` exists; create it if absent.

### 1. Enumerate stories

If no specific story key(s) were provided, run `searchJiraIssuesUsingJql`:
```
project = <project_key> AND issuetype = Story AND "Epic Link" = <EPIC>
```

For each story, call `getJiraIssue` to read all fields including:
- `summary`
- `customfield_*` for `Acceptance Criteria`
- `customfield_*` for `Expected Scope`
- `customfield_*` for `PN Actor`
- `customfield_*` for `PN Phase`
- `story_points` (or `customfield_*` for story points)
- `issueLinks` (for declared dependencies)
- `customfield_*` for `Validation Passed` (to detect already-validated stories)

Skip stories whose `Validation Passed = Yes` unless `--force` was passed.

### 2. Validate each story

Run five checks per story. Each check is pass or fail with a concrete finding:

**Check 1: AC measurable**
- Pass: `Acceptance Criteria` is non-empty AND each criterion starts with "Given", "When", "Then", "The system", or "A user can" AND contains a verb that implies an observable outcome.
- Fail finding: "AC is empty" or "AC contains vague language: <examples>".

**Check 2: Expected Scope filled**
- Pass: `Expected Scope` is non-empty AND distinguishes at least one "in scope" and one "out of scope" item.
- Fail finding: "Expected Scope is empty" or "Expected Scope does not distinguish in/out of scope".

**Check 3: Single concern**
- Pass: the story summary describes exactly one user-facing outcome and the AC does not cross two distinct user roles or two unrelated system behaviours.
- Fail finding: "Story bundles multiple concerns: <list>".
- Heuristic: count conjunctions in the summary ("and", "or", "also", "plus"); flag if > 1.

**Check 4: Estimated under threshold**
- Pass: `story_points` is set AND `story_points <= split_threshold`.
- Fail (unestimated): "Story points not set; default split threshold is <N> points; estimate before advancing".
- Fail (too large): "Story estimated at <N> points, exceeds threshold of <split_threshold>; split required".
- Skip (not blocking): if story points are missing but the user explicitly marks the story as spike/research, record as "skip: spike; not subject to point threshold".

**Check 5: Dependencies declared**
- Pass: if the story description or AC references other stories or external services, at least one `issueLink` of type "blocks" or "depends on" exists in Jira.
- Fail finding: "Story references <dependency> in description but no Jira issue link exists; declare with createIssueLink".
- Pass trivially: if no dependencies are referenced in description or AC, check passes without a link required.

**UL drift check (informational, not blocking)**
- Read `UBIQUITOUS_LANGUAGE.md` if present. Check whether the story summary or AC uses terms inconsistent with the glossary (e.g. uses a synonym instead of the canonical term). Record findings as warnings, not failures. If UL is absent, record as "skipped: UL glossary missing".

### 3. Evaluate "too large" trigger

If Check 4 fails with "too large":

1. Pause the validation loop for this story.
2. Propose 2-4 split candidates based on:
   - Natural boundaries in the AC (one candidate per distinct user scenario).
   - Distinct PN Actors (e.g. one `AI` sub-story, one `Human` sub-story).
   - Backend vs. frontend separation if applicable.
3. Present the candidates to the user. Each candidate must have:
   - A title.
   - A suggested PN Actor.
   - A one-sentence rationale.
   - Estimated points (total must sum to original estimate or lower).
4. Wait for the user to select a split.
5. Create the chosen child stories in Jira via `createJiraIssue` with `parent`/epic link set to the epic and an `issueLink` pointing to the original story (relationship: "is split from").
6. Set `Validation Passed = No` on the original story; add a Jira comment on the original story:
   ```
   Story split into: <KEY-1>, <KEY-2>, ...
   Original story is blocked pending validation of children.
   ```
7. Add the child stories to the validation queue for this run.

### 4. Write the verdict file

For each validated story, write `docs/pn/validations/<KEY>.md`:

```markdown
---
prd: PRD-002
plan: PLAN-001
epic: <EPIC key>
story: <STORY key>
date: <YYYY-MM-DD>
author: <git config user.name>
verdict: pass | fail
---

# Validation: <STORY key> ; <Story summary>

## Verdict: PASS | FAIL

## Check Results

| Check | Result | Finding |
|-------|--------|---------|
| AC measurable | pass/fail | <finding or "ok"> |
| Expected Scope filled | pass/fail | <finding or "ok"> |
| Single concern | pass/fail | <finding or "ok"> |
| Estimated under threshold (<N> pts) | pass/fail | <finding or "ok"> |
| Dependencies declared | pass/fail | <finding or "ok"> |
| UL drift | warn/ok/skipped | <finding or "ok"> |

## Fix List

<ordered list of concrete fixes required; empty if verdict is pass>

## Split Candidates

<list of proposed children with title, Actor, rationale, points; empty if no split was required>
```

### 5. Update Jira story fields

For each validated story, call `editJiraIssue`:
- Set `Validation Passed` to `Yes` (pass) or `No` (fail) using the `customfield_*` id from `.pn/settings.json`.

If the story was split: set `Validation Passed = No` on the original and leave `Validation Passed` empty on the children (they are unvalidated until re-run).

### 6. Phase gate: `estimate -> approval`

After all stories in scope have been validated:

1. Re-query all stories under the epic to check their `Validation Passed` values.
2. If any story has `Validation Passed = No` or `Validation Passed` empty (not yet evaluated):
   - Report which stories are still failing or unvalidated.
   - Leave the epic's `pn_phase` at `estimate`.
   - Do not advance.
3. If all stories have `Validation Passed = Yes`:
   - Prompt the user: "All stories passed validation. Advance PN Phase from `estimate` to `approval`? (yes/no)"
   - On user approval: call `editJiraIssue` to set `PN Phase = approval` on the epic using the `customfield_*` id from `.pn/settings.json`.
   - Since `approval` maps to the same Jira status `To Do`, no Jira status transition is required.
   - Post a Jira comment on the epic:
     ```
     Validation complete. All <N> stories passed.
     PN Phase advanced: estimate -> approval by <git config user.name>.
     Next: run todo-plan-phases <EPIC> to begin architecture and planning.
     ```
4. If the user declines advancement, leave `pn_phase = estimate` and note the decision.

### 7. Report

Print:
- Stories validated: <N>.
- Stories passing: <N>.
- Stories failing: <N> (list keys).
- Stories split: <N> (list original -> children).
- Epic `pn_phase` after run.
- Verdict files written (list paths).

## Edge cases

- **No stories under the epic**: abort with: run `estimate-write-prd <EPIC>` first.
- **Story in wrong phase**: if a story's `PN Phase` is already `approval` or later, skip it and note it was skipped.
- **Atlassian MCP fails mid-loop**: write all verdict files for stories already processed; report partial completion; stop further Jira writes.
- **Split creates a child that is also too large**: add the child to the validation queue; apply the split flow recursively up to a maximum depth of 2 levels.
- **`pn_phase` manually advanced to `approval` between runs**: detect on `getJiraIssue`; do not regress; report current state.
- **UL glossary missing**: record the UL check as "skipped: no UBIQUITOUS_LANGUAGE.md" and proceed; this is informational only.

## Idempotency

Re-running on the same epic with `--force`:
- Re-validates all stories regardless of current `Validation Passed` value.
- Overwrites verdict files with fresh results and a changelog entry.
- Re-posts Jira fields; does not duplicate comments (each run is a distinct event).

Re-running without `--force`:
- Skips stories with `Validation Passed = Yes`.
- Validates only stories with `Validation Passed = No` or empty.

## `pn_phase` transitions

| Transition | From | To | When | Jira status change |
|------------|------|----|------|--------------------|
| Epic phase gate | `estimate` | `approval` | All stories pass + PO explicitly approves | none (both map to `To Do`) |
| Story phase (written by `estimate-write-prd`) | `estimate` | unchanged | This skill validates, not transitions, story phases | none |

The skill never regresses `pn_phase`. If the epic is already at `approval` or later, the phase mutation step is skipped.
