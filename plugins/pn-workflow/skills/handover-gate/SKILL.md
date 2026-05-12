---
name: handover-gate
description: Soft client-side Gate 1 that blocks the `PN Phase` transition from `handover` to `deploy` for a single Jira story. Verifies a five-item checklist (AC populated, code-review findings clean, tests green, release notes line present, no `pn_phase` regression); writes a pass/fail verdict + checklist as a Jira comment on the story; persists `docs/pn/releases/<VERSION>/<KEY>.handover.md`; sets `Handover Passed = Yes / No` on the story. On pass only: mutates `PN Phase: handover -> deploy` and transitions Jira status `In Review -> Waiting for customer`. On fail: leaves `PN Phase` and Jira status unchanged. Detects and reports drift between manual `PN Phase` edits and manual Jira status transitions between runs. Idempotent across re-runs. Trigger when the user runs `/pn-workflow:handover-gate`, asks to "run the handover gate", "check if a story can be handed over", "advance to deploy", or when `pn_phase = handover` after code evaluation.
allowed-tools: Read, Write, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__getAccessibleAtlassianResources
---

# handover-gate

Soft client-side Gate 1. Evaluates a structured checklist for a single story and either advances it from `PN Phase: handover` to `deploy` (transitioning Jira status `In Review -> Waiting for customer`) or emits a fix-list and leaves both stores unchanged. Because the gate is soft, a human can still manually edit `PN Phase` or Jira status; the gate detects and reports such drift on its next run without reversing it. The gate is idempotent: re-running after a pass re-emits the same verdict comment (updating in place) without re-transitioning.

## When to use

- After `review-evaluate-code` has set `PN Phase = handover` on a story.
- QA or TL wants to formally hand the story over to the customer / PO.
- After remediating a prior fail verdict (re-run to obtain a pass).
- To audit current gate state without intent to advance (re-run is idempotent).

## When not to use

- `PN Phase` is not `handover` (and no manual drift is suspected); use the appropriate upstream skill first.
- Multi-ticket or release-level gate; use `release-readiness-gate` (Phase 8) for that.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--key=<KEY>` | yes (unless resolvable from branch) | Jira story key, e.g. `SD-456`. |

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, `project.test_command`, custom field IDs (`pn_phase`, `acceptance_criteria`, `handover_passed`), `language.jira` | Read |
| Jira story | `Acceptance Criteria`, `PN Phase`, Jira status, `Handover Passed`, parent epic key, fix version | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Code-review findings | `docs/pn/findings/<KEY>.md` if present | Read |
| Release notes | `docs/pn/releases/<VERSION>/notes.md` if present | Read |
| Prior handover record | `docs/pn/releases/<VERSION>/<KEY>.handover.md` if present | Read |
| Test results | Run project test command from `.pn/settings.json` (`project.test_command`) | Bash |
| Git | Author name via `git config user.name`, current date | Bash |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Handover record | `docs/pn/releases/<VERSION>/<KEY>.handover.md` | Overwritten on each run; checklist outcomes + verdict |
| Jira comment | One per story; updated in place on re-runs | Verdict + checklist summary on the story |
| `Handover Passed` custom field | Jira story | `Yes` (pass) or `No` (fail) |
| `PN Phase` mutation | `handover -> deploy` | Only on pass; verified after write |
| Jira status transition | `In Review -> Waiting for customer` | Only on pass; via `transitionJiraIssue` |

## Handover record schema

### Frontmatter

```yaml
---
prd: PRD-005
plan: PLAN-001
key: <JIRA-KEY>
version: <FIX-VERSION>
epic: <PARENT-EPIC-KEY>
author: <git config user.name>
date: <YYYY-MM-DD>
verdict: pass | fail
handover_passed: Yes | No
pn_phase_before: <value read at run start>
pn_phase_after: <value after mutation, or same as before on fail>
jira_status_before: <value read at run start>
jira_status_after: <value after transition, or same as before on fail>
drift_detected: true | false
---
```

### Body structure

```
## Verdict

PASS | FAIL ; <one-line reason>

## Checklist

| # | Item | Result | Detail |
|---|------|--------|--------|
| 1 | AC populated | pass / fail | <detail> |
| 2 | Code review clean | pass / fail | <detail> |
| 3 | Tests green | pass / fail | <detail> |
| 4 | Release notes line present | pass / fail | <detail> |
| 5 | No pn_phase regression | pass / fail | <detail> |

## Drift report

<Omitted if no drift. Present if PN Phase or Jira status was manually edited between runs.>

## Fix-list

<Omitted on pass. Present on fail: one item per failing checklist entry with reason and remediation hint.>
```

## Checklist

The gate verdict is `pass` only when all five items are green. A single red item produces a `fail` verdict.

### Item 1: AC populated

- Read `Acceptance Criteria` from the Jira story.
- **Pass:** field is non-null and non-empty after trimming whitespace.
- **Fail:** field is null, empty, or whitespace only.
- Detail: quote the first 120 characters of the AC on pass; note "field is empty" on fail.

### Item 2: Code review clean

- Read `docs/pn/findings/<KEY>.md`.
- **Pass:** file exists AND contains zero findings with `severity: Critical` or `severity: High` and `status: new` or `status: carried-over`.
- **Fail (file absent):** findings file does not exist; `review-evaluate-code` has not run.
- **Fail (open criticals/highs):** file exists but has one or more Critical or High findings that are not `status: resolved`.
- Detail: list finding IDs and severities on fail.

### Item 3: Tests green

- Read `project.test_command` from `.pn/settings.json`. If absent or empty, skip with a `warn` result (not a fail; flag in the fix-list as advisory).
- Run the command in the repository root. Capture exit code.
- **Pass:** exit code 0.
- **Fail:** exit code non-zero; capture first 500 characters of stderr/stdout as detail.

### Item 4: Release notes line present

- Read `docs/pn/releases/<VERSION>/notes.md`.
- **Pass:** file exists AND contains `(<KEY>)` anywhere in the body (i.e., the story's key appears in a rendered bullet).
- **Fail (file absent):** notes file does not exist; run `handover-release-notes` first.
- **Fail (key absent):** notes file exists but does not contain `(<KEY>)`.

### Item 5: No pn_phase regression

- Read the prior handover record if it exists. Extract `pn_phase_before` from the prior run.
- Compare current `PN Phase` (from Jira) against the prior recorded `pn_phase_after`.
- **Pass:** current value is `handover` (expected pre-gate value) or equals the expected post-gate value (`deploy`) if this is a re-run after a pass.
- **Fail:** current value is a phase earlier than `handover` in the canonical ordering (`new < refinement < planning < dev < review < handover`); this indicates a regression.
- If this is the first run (no prior record), pass unconditionally for this item.

## Drift detection

Drift is when `PN Phase` and Jira status disagree with their expected pairing per the canonical mapping, OR when either was manually changed between the prior run and this run.

**Canonical mapping (light Jira workflow):**

| PN Phase | Expected Jira status |
|----------|---------------------|
| `handover` | `In Review` |
| `deploy` | `Waiting for customer` |

**Detection logic:**

1. Read `pn_phase_before` and `jira_status_before` from the prior handover record (skip if no prior record).
2. Compare to current Jira values.
3. If either changed outside the gate's own transition, flag `drift_detected: true` in the frontmatter.
4. Report the drift in the "Drift report" section of the handover record and in the Jira comment.
5. Do not revert either value. Report only.

If `pn_phase_before` is already `deploy` (prior pass), this is a re-run after pass: proceed in idempotent mode (see Idempotency section).

## Procedure

### 1. Read `.pn/settings.json`

Read `.pn/settings.json`. Extract `jira.cloud_id`, `project.jira_project_key`, `project.test_command`, all custom field IDs, and `language.jira`. Confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). If not bootstrapped, abort with remediation message.

### 2. Resolve story key

Use `--key` arg if provided. Otherwise parse the current branch name (e.g. `feature/SD-456` yields `SD-456`). If neither resolves, abort: "Cannot determine story key; pass --key=<KEY>."

### 3. Read Jira story

Call `getJiraIssue` for the story key. Capture:
- `PN Phase` (current value).
- Jira status (current value).
- `Handover Passed` current value.
- `Acceptance Criteria`.
- Parent epic key.
- Fix version (used as `<VERSION>` for output paths).

### 4. Drift detection

Load prior handover record if present. Run drift detection logic as specified in the Drift detection section. Record findings for inclusion in the handover record and Jira comment.

### 5. Phase pre-check

- If `PN Phase` is earlier than `handover` (not counting manual edit drift): abort with "PN Phase is <value>; handover gate requires PN Phase = handover. Run upstream skills first."
- If `PN Phase` is `deploy` (prior pass; idempotent re-run): continue to checklist evaluation but skip the final phase mutation and Jira status transition steps (already done). Log "Re-run detected; prior pass confirmed; skipping transition."
- If `PN Phase` is `handover`: proceed normally.

### 6. Run checklist

Execute all five checklist items as specified. Collect results.

### 7. Determine verdict

- All five items pass (or warn): verdict = `pass`.
- Any item fails: verdict = `fail`.

### 8. Write handover record

Create `docs/pn/releases/<VERSION>/` if absent. Write `docs/pn/releases/<VERSION>/<KEY>.handover.md` with frontmatter + body as per schema. Always overwrite (full replacement).

### 9. Post or update Jira comment

Search the story's existing comments for one authored by the gate (marker: contains the string `handover-gate verdict`). If found, replace its body. If not found, post a new comment. Comment content mirrors the handover record body (checklist table + verdict + fix-list if fail + drift report if drift).

Use `addCommentToJiraIssue` for new comments. For updates, edit the existing comment via the appropriate Atlassian MCP call if available; otherwise post a new comment and note "prior verdict superseded" in the body.

### 10. Set `Handover Passed` custom field

Call `editJiraIssue` to set `Handover Passed` to `Yes` (pass) or `No` (fail).

### 11. On pass only: phase mutation + Jira transition

Skip this step if this is an idempotent re-run (PN Phase already `deploy`).

1. Call `editJiraIssue` to set `PN Phase = deploy`.
2. Call `getTransitionsForJiraIssue` to retrieve available transitions.
3. Identify the transition whose target status name is `Waiting for customer` (or closest match; log if ambiguous).
4. Call `transitionJiraIssue` with that transition ID.
5. Re-read the story to verify `PN Phase = deploy` and Jira status = `Waiting for customer`. If verification fails, log the mismatch to chat and in the handover record; do not retry automatically.

### 12. Exit summary

Print to chat:

```
=== handover-gate complete ===

Story    : <KEY>
Version  : <VERSION>
Verdict  : PASS | FAIL
PN Phase : handover -> deploy | handover (unchanged)
Status   : In Review -> Waiting for customer | In Review (unchanged)
Handover Passed : Yes | No

Checklist:
  1. AC populated              : pass | fail
  2. Code review clean         : pass | fail
  3. Tests green               : pass | fail | warn
  4. Release notes line present: pass | fail
  5. No pn_phase regression    : pass | fail

Drift    : none | <summary of drift>
Record   : docs/pn/releases/<VERSION>/<KEY>.handover.md
Comment  : <posted|updated> on <KEY>
```

## Edge cases

- **`PN Phase` is not `handover` or `deploy`:** abort before checklist; do not write any artefact.
- **Jira MCP unavailable:** abort; do not run checklist (cannot verify AC or post results); log "Jira unavailable; gate cannot run".
- **Test command absent in `.pn/settings.json`:** item 3 is `warn` (advisory); does not block pass.
- **Test command times out (> 5 minutes):** treat as fail; detail "test command timed out after 300s".
- **`docs/pn/findings/<KEY>.md` absent:** item 2 fails; detail "findings file missing; run review-evaluate-code".
- **`docs/pn/releases/<VERSION>/notes.md` absent:** item 4 fails; detail "notes.md missing; run handover-release-notes".
- **Fix version absent from story:** use `"unknown"` as `<VERSION>` and note in the handover record.
- **Multiple fix versions on the story:** use the first; note the others in the handover record.
- **Repeat pass re-run:** idempotent; update the Jira comment in place; set `Handover Passed = Yes` again; skip phase mutation and Jira transition; log "idempotent re-run; no transitions applied".
- **Manual `PN Phase` edit to `deploy` between runs (drift):** detected and reported; gate treats it as an idempotent re-run scenario; does not re-transition.
- **Manual Jira status advance beyond `Waiting for customer`:** detected as drift; reported; gate does not reverse it.

## Idempotency

Re-running the gate for a story that already has `PN Phase = deploy`:
- Runs the full checklist (conditions may have changed).
- Overwrites the handover record with fresh results.
- Updates the Jira comment in place.
- Sets `Handover Passed` to the current verdict.
- Does NOT re-apply the `PN Phase` mutation or the Jira status transition.

Re-running for a story still at `PN Phase = handover` (prior fail):
- Runs the full checklist.
- Overwrites the handover record and Jira comment.
- On pass: applies phase mutation + status transition.
- On fail: leaves both unchanged.

## `pn_phase` transitions

| When | From | To | Jira status change |
|------|------|----|-------------------|
| Verdict `pass` (first run) | `handover` | `deploy` | `In Review -> Waiting for customer` |
| Verdict `pass` (re-run) | `deploy` | `deploy` (no-op) | `Waiting for customer` (no-op) |
| Verdict `fail` | `handover` | `handover` (unchanged) | `In Review` (unchanged) |
