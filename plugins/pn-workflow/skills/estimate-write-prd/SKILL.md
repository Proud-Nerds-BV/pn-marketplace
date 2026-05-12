---
name: estimate-write-prd
description: Produces docs/pn/prd/<EPIC>.md (a full PRD with frontmatter linking to the Jira epic) and creates one Jira story per outline-story under the epic, each populated with Acceptance Criteria, Expected Scope, story points, and PN Actor. All stories link back to the PRD in their description. Idempotent: re-runs update existing stories rather than duplicating them. Use when the user invokes /pn-workflow:estimate-write-prd, asks to write the PRD, or when pn_phase on the epic is estimate and no PRD exists yet.
allowed-tools: Read, Write, Edit, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__getJiraProjectIssueTypesMetadata, mcp__claude_ai_Atlassian__getJiraIssueTypeMetaWithFields
---

# estimate-write-prd

Produces the full PRD from the context-pack and grilled idea-brief, then creates or updates Jira stories under the epic. The PRD is committed to the repo; each story links back to it.

`pn_phase` value: `estimate`

## When to use

- `pn_phase` on the epic is `estimate`.
- The outline artefact at `docs/pn/prd/<EPIC>.outline.md` exists.
- No PRD yet exists, or the user requests a PRD update.

## When not to use

- `pn_phase` is `refine` or `new`; draft the epic first with `refine-draft-epic`.
- `pn_phase` is `approval` or later; stories already exist and validation is in progress. Use `estimate-check-ticket` to continue.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) | Argument or user message | Yes |
| Outline artefact | `docs/pn/prd/<EPIC>.outline.md` | Yes |
| Context-pack | `docs/pn/context-packs/<EPIC>.md` | Yes |
| Idea-brief | `docs/pn/ideas/<slug>.md` (if present) | No; enriches the PRD |

## Outputs

| Artefact | Path / Location | Description |
|----------|-----------------|-------------|
| Full PRD | `docs/pn/prd/<EPIC>.md` | Complete PRD with all required sections |
| Jira stories | Under the epic in Jira | One per outline-story with all required fields |
| Jira epic comment | Epic on Jira | Link to the PRD and list of story keys created |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json`; confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). Abort if any required value is unresolved.
2. Read author from `git config user.name`.
3. Call `getJiraIssue` on the epic key. Verify `pn_phase = estimate`. If not, refuse and report the current phase with the correct skill to use.
4. Read `docs/pn/prd/<EPIC>.outline.md`. Abort if absent with: run `refine-draft-epic` first.
5. Read `docs/pn/context-packs/<EPIC>.md`. Abort if absent with: run `refine-capture-context` first.
6. If an idea-brief referencing this epic exists in `docs/pn/ideas/`, read it.
7. Confirm `docs/pn/prd/` exists; create it if absent.

### 1. Compose the PRD

Compose `docs/pn/prd/<EPIC>.md` with the following structure:

```markdown
---
prd: PRD-002
plan: PLAN-001
epic: <EPIC key>
date: <YYYY-MM-DD>
author: <git config user.name>
status: draft
---

# PRD: <Epic summary>

## Problem Statement

<derived from idea-brief and epic description; max 3 paragraphs>

## User Roles

| Role | Goals | Key Interactions |
|------|-------|-----------------|
| <role> | <goals> | <interactions> |

## In Scope

<numbered list of scope items, one per outline-story>

## Out of Scope

<list of explicitly excluded capabilities>

## Acceptance Criteria

<per-scope-item numbered list of testable criteria; each starting with
"Given / When / Then" or "The system..." or "A user can...">

## Constraints

<non-negotiable technical or business constraints>

## Dependencies

| Dependency | Impact | Status |
|------------|--------|--------|
| <dependency> | <impact> | <status> |

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| <metric> | <target> | <method> |

## Appendix: Jira Stories

| Key | Title | PN Actor | Story Points |
|-----|-------|----------|--------------|
| <to be filled after story creation> |

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| <YYYY-MM-DD> | Initial draft | Created by estimate-write-prd |
```

Populate each section using the outline, context-pack, and idea-brief. Do not leave sections empty; write "None identified at this stage" where genuinely nothing applies.

### 2. Write the PRD file

Write `docs/pn/prd/<EPIC>.md`. If the file already exists, overwrite it and add a changelog entry. Preserve the original `date` frontmatter; add `updated: <YYYY-MM-DD>`.

### 3. Create or update Jira stories

For each outline-story in the outline artefact:

1. **Check for existing story**: run `searchJiraIssuesUsingJql` with:
   `project = <project_key> AND issuetype = Story AND "Epic Link" = <EPIC> AND summary ~ "<story title>"`
   If found and summary matches, update rather than create.

2. **Create the story** via `createJiraIssue` (or `editJiraIssue` on update) with:
   - `summary`: the outline-story title.
   - `issuetype`: `Story`.
   - `parent`/`Epic Link`: the epic key.
   - `description` (Jira wiki markup):
     ```
     h2. PRD Reference
     PRD: docs/pn/prd/<EPIC>.md (see Appendix for this story's AC)

     h2. Acceptance Criteria
     <populated from PRD section>

     h2. Expected Scope
     <bullet list of what is included and what is not>
     ```
   - `customfield_*` for `Acceptance Criteria`: the plain-text AC for this story.
   - `customfield_*` for `Expected Scope`: a brief bullet list of in/out scope.
   - `customfield_*` for `PN Actor`: the Actor candidate from the outline (`AI`, `Human`, or `Joint`).
   - `customfield_*` for `PN Phase`: `estimate`.
   - `story_points` / `customfield_*` for story points: derive from the outline if a point estimate is recorded; otherwise leave as `null` and flag for `estimate-check-ticket` to populate.

3. Record the created/updated story key.

### 4. Update the PRD appendix

After all stories are created, update the Appendix table in `docs/pn/prd/<EPIC>.md` with the actual story keys, titles, Actor values, and story points.

### 5. Link from the epic

Post a Jira comment on the epic:
```
PRD written: docs/pn/prd/<EPIC>.md
Stories created: <KEY-1> <KEY-2> ... <KEY-N>
Each story carries Acceptance Criteria, Expected Scope, and PN Actor.
Next: run estimate-check-ticket <EPIC> to validate all stories.
```

### 6. Report

Print: PRD file path, number of stories created vs updated, list of story keys, and any fields left null for `estimate-check-ticket` to populate.

## Edge cases

- **Outline absent**: abort with: run `refine-draft-epic <EPIC>` first.
- **Duplicate story detection fails (JQL returns no match)**: create a new story; warn the user to check for accidental duplicates.
- **Atlassian MCP unavailable**: write the PRD file with placeholder story keys; skip all Jira calls; report which steps were skipped.
- **`pn_phase` not `estimate`**: refuse and report the current phase with the correct next skill.
- **Story creation partially fails** (some stories succeed, some fail): report successful creates with their keys; list failures with the error; do not abort the full run.

## Idempotency

Re-running on the same epic:
- Overwrites `docs/pn/prd/<EPIC>.md` with a changelog entry.
- Updates existing Jira stories (matching by summary) rather than creating duplicates.
- Posts a new Jira comment (not deduplicated; each run is a distinct event).

## `pn_phase` transitions

| Transition | When | Jira status change |
|------------|------|--------------------|
| Sets `PN Phase = estimate` on each new story | Story creation | none (both map to `To Do`) |

The epic's own `pn_phase` is not changed by this skill; it remains `estimate`. The transition to `approval` is handled by `estimate-check-ticket`.
