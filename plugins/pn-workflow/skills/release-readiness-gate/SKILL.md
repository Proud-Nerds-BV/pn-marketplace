---
name: release-readiness-gate
description: Soft client-side Gate 2 that blocks the pn_phase transition from release-ready to released for any ticket in a Jira fix-version. Trigger when the user runs /pn-workflow:release-readiness-gate, asks "is the release ready?", "run the release gate", "check release readiness", "can we ship version X?", or "gate the release". Evaluates every ticket in the version: pn_phase must be release-ready, Handover Passed must be Yes, no open blockers via Jira link graph, and per-ticket handover artefacts must be present. On pass, advances every ticket pn_phase from release-ready to released (no Jira workflow status transition; both phases map to Done). On fail, emits a categorised fix-list and leaves all tickets unchanged. Writes docs/pn/releases/<VERSION>/readiness.md and posts a verdict to the configured Jira release-tracking target (release-issue, version-comment, or parent-epic per .pn/settings.json). Idempotent across re-runs.
allowed-tools: Read, Write, Edit, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__getAccessibleAtlassianResources, mcp__claude_ai_Atlassian__search
---

# release-readiness-gate

Soft client-side Gate 2 of the Proud Nerds light workflow. It sweeps every ticket in a Jira fix-version, evaluates four criteria per ticket, aggregates an auditable verdict, and either advances `PN Phase` to `released` on pass or emits a categorised fix-list on fail. All Jira interaction is through the Atlassian MCP; no direct REST calls.

**This gate is soft (client-side).** No server-side Jira workflow validators are installed. A human may manually edit `PN Phase` or transition Jira status regardless of this gate's verdict; the gate detects and reports such overrides on its next run but never reverses them.

## When to use

- Before shipping a version: confirm every ticket in the release is at `release-ready`, every blocker is resolved, and every handover artefact is present.
- After addressing a previous fail verdict: re-run to get an updated pass/fail.
- To produce an auditable record of release approval for audit or retrospective purposes.

## When not to use

- Per-ticket handover checks (Gate 1); use `handover-gate` instead.
- While tickets are still in active development (not yet at `release-ready`); the gate will fail and clutter the fix-list.

## Inputs

| Source | What is read | How |
|--------|-------------|-----|
| Argument or `.pn/settings.json` | Jira fix-version key (e.g. `2.4.0`); argument takes precedence | Read / prompt |
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, `jira.custom_fields.*`, `release.current_version`, `release.version_location`, `language.*` | Read |
| Jira | All tickets in the version, `PN Phase`, `Handover Passed`, issue links per ticket | Atlassian MCP |
| Repository | `docs/pn/releases/<VERSION>/<KEY>.handover.md` per ticket | Read |

## Outputs

| Artefact | Path | Conditions |
|----------|------|------------|
| Readiness report | `docs/pn/releases/<VERSION>/readiness.md` | Written on every run with at least one ticket; overwritten on re-run |
| Jira verdict comment | Release-tracking target per `.pn/settings.json` `release.version_location` | Written on every run with at least one ticket; updated in-place on re-run |
| `PN Phase` mutation | Every ticket in the version: `release-ready` -> `released` | On pass only; idempotent |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json` at the repo root. If missing or any required value is unresolved (`jira.cloud_id`, `project.jira_project_key`, or any of the six `customfield_*` ids), abort with: "Project not bootstrapped; run bootstrap-project first."
2. Resolve the version key: use the explicit argument if provided; otherwise fall back to `.pn/settings.json` `release.current_version`. If neither is available, prompt the user once for the version key and proceed.
3. Resolve `release.version_location` from `.pn/settings.json`. Accepted values: `release-issue`, `version-comment`, `parent-epic`. Default to `release-issue` if the field is absent.
4. Resolve language settings: `language.jira` for Jira-facing text, `language.output` for the repository artefact. Default both to `en`.
5. Record `author` as the output of `git config user.name`. This is the authorship in every artefact; never use an AI or tool name.
6. Sanitise the version key for filesystem use: replace `/`, `:`, and space with `-`. Store as `VERSION_SAFE`.

### 1. Enumerate tickets in the version

Call `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` with:

```
project = "<JIRA_PROJECT_KEY>" AND fixVersion = "<VERSION>" ORDER BY key ASC
```

Request fields: `summary`, `status`, `assignee`, the `customfield_*` id for `PN Phase`, the `customfield_*` id for `Handover Passed`, `issuelinks`.

**If zero tickets are returned:**
- Write a chat message: "Version `<VERSION>` contains no tickets; gate not evaluated."
- Write no repository artefact and no Jira comment.
- Exit cleanly.

### 2. Per-ticket evaluation

For each ticket, run the following four checks and record results in a per-ticket result object.

#### Check A: PN Phase

- PASS if `PN Phase == release-ready` or `PN Phase == released` (the latter means the ticket already passed a previous gate run).
- FAIL if `PN Phase` is any other value (including empty).
- Record actual value for the report.

#### Check B: Handover Passed

- PASS if `Handover Passed == Yes`.
- FAIL otherwise (including empty).
- Record actual value for the report.

#### Check C: Open blockers

Inspect `issuelinks` for links whose type is `Blocks` or `Is Blocked By` (case-insensitive). For each such link, resolve the linked issue to determine its resolution status.

- PASS if no such links exist, or all such linked issues are resolved (resolution is not null).
- FAIL if any linked issue has no resolution (still open).
- For each failing blocker, record the linked issue key and summary.

#### Check D: Handover artefact presence

Attempt to read `docs/pn/releases/<VERSION_SAFE>/<KEY>.handover.md` at the repo root.

- PASS if the file exists and is non-empty.
- FAIL if the file is absent or empty.
- Record the expected path for the fix-list.

### 3. Aggregate verdict

- **PASS** if and only if every ticket passes all four checks (A, B, C, D).
- **FAIL** if any ticket fails any check.

Build a categorised fix-list for FAIL verdicts:

- **Phase gaps:** tickets where check A failed; list key + actual `PN Phase`.
- **Handover-passed gaps:** tickets where check B failed; list key + actual `Handover Passed` value.
- **Open blockers:** tickets where check C failed; for each, list the ticket key and each blocking issue key + summary.
- **Missing handover artefacts:** tickets where check D failed; list key + expected file path.

Build a consistency warning list (non-blocking; included in the report on both pass and fail):

- A ticket in the version whose handover artefact is missing (already in fix-list on fail; annotated as "gap" on pass if it somehow occurred).
- Contradictions in the aggregated handover artefact content: one artefact claims "DB migration added", another claims "no schema changes"; surface the contradiction verbatim under "Consistency warnings" without resolving it. A contradiction is two artefacts containing mutually exclusive statements about the same dimension (schema changes, environment variables, deployment steps). Surface at most five such pairs; if more exist, note the count.

### 4. Write readiness.md

Determine the output directory: `docs/pn/releases/<VERSION_SAFE>/`. Create it if it does not exist (`mkdir -p` equivalent via Bash).

Write `docs/pn/releases/<VERSION_SAFE>/readiness.md` with the following structure. Overwrite if it already exists.

```markdown
---
version: <VERSION>
date: <YYYY-MM-DD>
author: <git config user.name>
verdict: <PASS|FAIL>
prd: PRD-006
plan: PLAN-001
---

# Release Readiness: <VERSION>

**Date:** <YYYY-MM-DD>
**Author:** <author>
**Verdict:** PASS | FAIL

## Summary

<One sentence: "All N tickets in version <VERSION> passed the release readiness gate." or "N of M tickets failed one or more checks; release is not ready.">

## Per-ticket table

| Key | Summary | PN Phase | Handover Passed | Blockers | Artefact |
|-----|---------|----------|-----------------|----------|----------|
| KEY-1 | <summary> | release-ready | Yes | none | present |
| KEY-2 | <summary> | progress | No | KEY-99 (open) | missing |
...

## Fix-list

<Omit entire section on PASS>

### Phase gaps

- KEY-2: PN Phase is `progress` (expected `release-ready`)

### Handover-passed gaps

- KEY-2: Handover Passed is empty

### Open blockers

- KEY-2: blocked by KEY-99 (<summary of KEY-99>)

### Missing handover artefacts

- KEY-2: expected at `docs/pn/releases/<VERSION_SAFE>/KEY-2.handover.md`

## Consistency warnings

<"None" if no contradictions; otherwise list up to five pairs>

## Gate notes

- Gate type: soft client-side (Gate 2)
- No Jira workflow status transitions performed by this gate.
- PN Phase advances to `released` on every ticket on PASS only.
- Manual edits to PN Phase or Jira status remain possible and are respected on the next run.
```

### 5. Post verdict to Jira

Determine the Jira write target from `.pn/settings.json` `release.version_location`:

- `release-issue`: post a comment on the issue whose key is stored in `.pn/settings.json` `release.issue_key` (or prompt for it once if absent and persist). On MCP error or missing issue key, write readiness.md only and warn.
- `version-comment`: post a comment on the fix-version description page via the Atlassian MCP. If the API call is unsupported or returns an error, fall back to a comment on the parent epic if one exists; otherwise write readiness.md only and warn.
- `parent-epic`: post a comment on the parent epic of the first ticket in the version. If the field is absent on the first ticket, try subsequent tickets until one is found; if none found, write readiness.md only and warn.

Comment content (in `language.jira`):

```
[release-readiness-gate] <VERSION> ; <PASS|FAIL> ; <YYYY-MM-DD>

<Summary line from readiness.md>

<On FAIL: Fix-list as plain text, grouped by category, one item per line.>
<On PASS: "All checks passed. PN Phase advanced to `released` on N tickets.">

Full report: docs/pn/releases/<VERSION_SAFE>/readiness.md
```

**Idempotency:** Before posting, search existing comments on the target issue for a comment that starts with `[release-readiness-gate] <VERSION>`. If found, edit it in place. If the Atlassian MCP does not support comment editing, add a new comment and note the previous comment key in the new comment's header.

### 6. Advance PN Phase on PASS

On PASS only:

For each ticket whose `PN Phase` is currently `release-ready` (skip tickets already at `released`):
1. Call `mcp__claude_ai_Atlassian__editJiraIssue` to set `PN Phase` to `released`.
2. On MCP error for a specific ticket, record the error against that ticket and continue with remaining tickets.
3. After processing all tickets, report any per-ticket errors in chat.

**Do not transition Jira workflow status.** Both `release-ready` and `released` map to Jira status `Done`; no Jira workflow transition is required or performed.

On FAIL: take no action on any ticket's `PN Phase`.

### 7. Report to chat

Print a terminal-friendly summary:

```
=== release-readiness-gate ===

Version  : <VERSION>
Verdict  : PASS | FAIL
Tickets  : N total, N passed, N failed
Date     : <YYYY-MM-DD>

<On PASS>
All tickets advanced to PN Phase: released.
Report written: docs/pn/releases/<VERSION_SAFE>/readiness.md
Verdict posted: <Jira target description>

<On FAIL>
Fix-list (<N> items):
  Phase gaps         : <count>
  Handover-passed gaps: <count>
  Open blockers      : <count>
  Missing artefacts  : <count>

Report written: docs/pn/releases/<VERSION_SAFE>/readiness.md
Verdict posted: <Jira target description>
No PN Phase mutations performed.
```

## Edge cases

- **Empty version:** Zero tickets returned by JQL. Exit cleanly with chat message; write no artefact and no Jira comment. Step 1 handles this.
- **Missing release-tracking issue:** Write readiness.md; warn in chat; skip Jira comment. Step 5 handles this.
- **Re-run on a passed version (all tickets already at `released`):** Check A passes for all (since `released` is accepted); verdict is PASS; readiness.md is overwritten with current timestamp; Jira comment is updated; no PN Phase mutations occur (all tickets already at `released`). Report notes "N tickets already at `released`; no mutations."
- **Manual PN Phase edits between runs:** Respected as-is. If a ticket was manually advanced beyond `release-ready`, check A passes. If manually set to a pre-release phase, check A fails and it appears in the fix-list. Report notes any unexpected values under "Consistency warnings" as drift.
- **Concurrent runs same day:** Both runs produce the same verdict given unchanged Jira state. The second run finds the readiness.md already present and overwrites it; finds the Jira comment already present and edits it in place. Final artefacts are identical. No duplicates.
- **MCP call failure mid-sweep:** Record the affected ticket as "evaluation error: MCP unavailable"; count it as a fail. Do not abort the sweep; continue with remaining tickets.
- **Version key contains filesystem-unsafe characters:** VERSION_SAFE substitution (step 0) ensures the path is always valid.
- **`language.jira` or `language.output` missing from `.pn/settings.json`:** Default to `en` for both. Do not abort.

## Idempotency guarantees

- readiness.md is always overwritten (not appended); the latest run is canonical.
- Jira comments are updated in place; no duplicate comments accumulate.
- PN Phase mutation is guarded: tickets already at `released` are skipped silently; tickets at `release-ready` are advanced; tickets at any other value are left unchanged (check A would have failed, so the gate would not reach step 6 for a fail verdict).
- Re-running against a fully-released version produces the same PASS verdict and the same artefacts with no new mutations.
