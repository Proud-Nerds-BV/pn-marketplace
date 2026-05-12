---
name: handover-release-notes
description: Generates per-version release notes for the PO in the language configured by `language.jira` in `.pn/settings.json` (default English; Dutch when set to `nl`). Reads only the `Acceptance Criteria` custom field from Jira stories in the target version whose `PN Phase` is at or beyond `handover`; no other field contributes to note body text. Writes `docs/pn/releases/<VERSION>/notes.md` grouped by epic; stories missing AC are collected into a fix-list section instead. Re-running overwrites the file idempotently. Read-only against Jira workflow status and `PN Phase`. Trigger when the user runs `/pn-workflow:handover-release-notes`, asks to "generate release notes", "write release notes for a version", or when `pn_phase` is at `handover` for one or more stories in a version.
allowed-tools: Read, Write, Bash, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__getAccessibleAtlassianResources
---

# handover-release-notes

Builds structured release notes for a Jira version. The sole input for note body text is the `Acceptance Criteria` custom field on each eligible story. Stories without AC are not silently skipped; they are listed in a fix-list section and require remediation before the version notes can be considered complete. The skill is fully read-only: it does not mutate `PN Phase`, Jira status, or any custom field.

## When to use

- Before running `handover-gate` for a version; release notes must exist for the gate to pass.
- After the QA team has merged all stories for a version and set `PN Phase` to `handover` or beyond.
- To regenerate notes after AC have been corrected (re-run is idempotent; notes.md is overwritten).

## When not to use

- When no stories in the version have reached `PN Phase = handover` yet; nothing to render.
- To generate notes for a single story in isolation; the skill always operates at version scope.
- To edit or fill in AC; use `estimate-check-ticket` for that.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--version=<VERSION>` | yes (unless resolvable from `.pn/settings.json` or active release branch) | Jira fix version label, e.g. `v1.4.0`. |

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, custom field IDs (`pn_phase`, `acceptance_criteria`), `language.jira` | Read |
| Jira version stories | All stories in the fix version with `PN Phase` at or beyond `handover` | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` |
| Each story | `Acceptance Criteria`, `PN Phase`, parent epic key, summary | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Each parent epic | Epic summary (for grouping label) | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Git | Author name via `git config user.name` | Bash |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Release notes | `docs/pn/releases/<VERSION>/notes.md` | Overwritten on each run; structured markdown with frontmatter |

## Release notes schema

### Frontmatter

```yaml
---
prd: PRD-005
plan: PLAN-001
version: <VERSION>
date: <YYYY-MM-DD>
author: <git config user.name>
stories:
  - key: <JIRA-KEY>
    title: <story summary>
    epic: <EPIC-KEY>
    ac_present: true | false
---
```

### Body structure

The body is written in the language determined by `language.jira` in `.pn/settings.json`: English when unset or set to `en`; Dutch when set to `nl`.

Sections appear in this fixed order; empty sections are rendered explicitly as empty (never omitted):

```
## Nieuw  (Dutch) / ## New  (English)
## Gewijzigd  (Dutch) / ## Changed  (English)
## Verwijderd  (Dutch) / ## Removed  (English)
## Bekende problemen  (Dutch) / ## Known issues  (English)
```

Each story contributes exactly one bullet under its section, derived from its AC text. The bullet:
- Is written in the target language as a user-facing sentence; avoids technical jargon.
- Preserves user-visible terms from the AC (UI labels, field names, action names).
- Does not quote the raw AC verbatim; it is a translation into user-facing prose.
- Cites the story key in parentheses at the end: `(SD-123)`.

Section assignment heuristic (applied in order; first match wins):
1. AC text contains "verwijder", "remove", "delete", "archiveer", "archive" as a primary action: **Removed**.
2. AC text contains "wijzig", "update", "aanpas", "change", "modify", "edit" as a primary action: **Changed**.
3. AC text contains "bekende fout", "known issue", "known bug", "workaround": **Known issues**.
4. Default: **New**.

Grouping: bullets are grouped under a `### <Epic summary>` subheading within each section. If a story has no parent epic, it is grouped under `### Overig` (Dutch) or `### Other` (English).

### Fix-list section

Appended after the four main sections when one or more stories are missing AC:

```
## Ontbrekende acceptatiecriteria  (Dutch) / ## Missing acceptance criteria  (English)

The following stories are included in version <VERSION> but have no Acceptance Criteria and could not be included in the release notes. Resolve the AC and re-run this skill.

- <KEY>: <story summary>
```

## Procedure

### 1. Read `.pn/settings.json`

Read `.pn/settings.json`. Extract `jira.cloud_id`, `project.jira_project_key`, custom field IDs for `pn_phase` and `acceptance_criteria`, and `language.jira` (default `en`). If not bootstrapped (`jira.cloud_id` empty or required `customfield_*` ids unresolved), abort with a remediation message pointing to `bootstrap-project`.

### 2. Resolve version

Use `--version` arg if provided. Otherwise read `project.active_version` from `.pn/settings.json`. If neither is available, abort: "No version specified and no active version in .pn/settings.json; pass --version=<VERSION>."

### 3. Query eligible stories

JQL: `project = "<PROJECT_KEY>" AND fixVersion = "<VERSION>" AND cf[<pn_phase_field_id>] in ("handover", "deploy", "release-ready", "released")`.

If the result is empty, abort: "No stories in version <VERSION> with PN Phase at or beyond `handover`. Nothing to render."

### 4. Fetch story detail

For each story, call `getJiraIssue`. Capture:
- `Acceptance Criteria` field value (may be null / empty string).
- `PN Phase` current value.
- Parent epic key (from `parent` or `Epic Link` field depending on Jira version).
- Story summary.

### 5. Fetch epic summaries

For each unique epic key encountered, call `getJiraIssue` to get the epic summary. Cache results; do not call the same epic key twice.

### 6. Classify stories

Split into two sets:
- **With AC:** stories where `Acceptance Criteria` is non-null and non-empty after trimming.
- **Without AC:** all others.

### 7. Compose note bullets

For each story in the **with AC** set:
1. Determine the target language (`language.jira`).
2. Translate the AC into a single user-facing sentence in the target language (preserve user-visible terms; avoid internal jargon).
3. Assign section (New / Changed / Removed / Known issues) using the heuristic in the schema section.
4. Record the bullet and its section + epic grouping.

### 8. Write notes.md

Create `docs/pn/releases/<VERSION>/` if it does not exist. Write `notes.md`:
1. Frontmatter (as schema above).
2. Four sections in fixed order; each section contains its grouped epic subheadings and bullets. If a section has no bullets, write the heading followed by *(none)*.
3. If the **without AC** set is non-empty, append the fix-list section.

The file is always written atomically (full overwrite); no incremental appending.

### 9. Exit summary

Print to chat:

```
=== handover-release-notes complete ===

Version  : <VERSION>
Language : <en|nl>
Stories  : <N> eligible (PN Phase >= handover)
Notes    : <N> stories rendered
Fix-list : <N> stories without AC (listed in notes.md)
File     : docs/pn/releases/<VERSION>/notes.md
```

## Edge cases

- **Empty version (no eligible stories):** abort with message; do not write a file.
- **All stories lack AC:** write the file with all four sections empty and a populated fix-list section; exit normally (not an error; notes.md is valid and gate will fail on the fix-list).
- **Story without parent epic:** group under `### Overig` / `### Other`.
- **`language.jira` set to a value other than `nl`:** treat as `en`.
- **Jira MCP unavailable:** abort without writing; log "Jira unavailable; cannot fetch story data".
- **`docs/pn/releases/<VERSION>/` does not exist:** create it silently.

## Idempotency

Re-running for the same version unconditionally overwrites `notes.md`. The fix-list is regenerated from current AC state on each run. No state is accumulated across runs.

## `pn_phase` transitions

None. This skill is fully read-only with respect to Jira data and `PN Phase`.
