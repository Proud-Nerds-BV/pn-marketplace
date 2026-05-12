---
name: refine-draft-epic
description: Produces or updates a Jira epic with description, success criteria, outline-stories (titles only), PN Actor candidates per outline-story, and a list of risk-flagged modules drawn from the context-pack. Sets PN Phase = refine on the epic and advances it to estimate when the draft is approved. Writes an outline artefact at docs/pn/prd/<EPIC>.outline.md. Use when the user invokes /pn-po:refine-draft-epic, asks to draft or update the epic, or when a context-pack exists but the Jira epic description is still empty or incomplete.
allowed-tools: Read, Write, Edit, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__getJiraProjectIssueTypesMetadata, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue
---

# refine-draft-epic

Drafts or updates the Jira epic with structured description, success criteria, outline-stories, PN Actor candidates per story, and risk-flagged modules. Records iteration rounds as epic comments. When the user approves the draft, advances `PN Phase` from `refine` to `estimate`.

`pn_phase` value: `refine` (on entry); `estimate` (on approval exit)

## When to use

- A context-pack exists at `docs/pn/context-packs/<EPIC>.md` and the Jira epic needs a structured description and outline-stories.
- A draft epic exists but needs refinement based on grill-round feedback.
- The user explicitly approves the draft and wants to advance to `estimate`.

## When not to use

- `pn_phase` is already `estimate` or later; the draft is closed. Use `estimate-write-prd` for the full PRD.
- No context-pack exists; run `refine-capture-context` first.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) | Argument or user message | Yes |
| Context-pack | `docs/pn/context-packs/<EPIC>.md` | Yes; aborts with remediation if absent |
| Idea-brief | `docs/pn/ideas/<slug>.md` (if present) | No; enriches the draft if available |
| Grill-round records | Jira comments on the epic | No; read to inform the draft |

## Outputs

| Artefact | Path / Location | Description |
|----------|-----------------|-------------|
| Jira epic description | Epic on Jira | Structured description with all required sections |
| Iteration round comment | Epic on Jira | Comment per round recording rationale |
| Outline artefact | `docs/pn/prd/<EPIC>.outline.md` | Structured outline-stories with Actor candidates |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json`; confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). Abort if any required value is unresolved.
2. Read author from `git config user.name`.
3. Call `getJiraIssue` on the epic key. Read current `pn_phase`. If `pn_phase` is `estimate` or later and `--force` is not passed, refuse with a suggestion to use `estimate-write-prd`.
4. Read `docs/pn/context-packs/<EPIC>.md`. If absent, abort with: run `refine-capture-context <EPIC>` first.
5. If `docs/pn/ideas/` contains an idea-brief referencing this epic (detected by `jira_key:` frontmatter), read it too.
6. Confirm `docs/pn/prd/` exists; create it if absent.

### 1. Read existing draft state

Call `getJiraIssue` and read:
- Current epic description.
- All existing comments to extract prior iteration rounds.
- `pn_phase` value.

Identify which sections are already present (description, success criteria, outline-stories, Actor candidates, risk-flagged modules) and which are missing or incomplete.

### 2. Compose the draft

Using the context-pack, idea-brief, and grill-round records, compose or update:

**Description** ; What the epic is, why it exists, the key problem it solves. Maximum three paragraphs. No design decisions yet.

**Success criteria** ; A numbered list of observable, testable outcomes. At least three; each starting with "The system..." or "A user can...". Derived from grill-round convergence and context-pack Confluence spec.

**Outline-stories** ; A list of stories (titles only, no AC). Each title must:
- Be a short imperative phrase describing a deliverable behaviour (e.g. "Export invoice to PDF").
- Map to a single user-facing outcome.
- Not bundle two concerns.

Suggested range: 3-10 outline-stories. Flag if fewer than 3 (epic may be too small for a full PRD flow) or more than 10 (may need sub-epics).

**PN Actor candidates** ; For each outline-story, assign one of `AI`, `Human`, or `Joint` based on the story's nature:
- `AI` ; automatable, well-defined input/output, no human judgment required.
- `Human` ; requires UX, business judgment, or stakeholder interaction.
- `Joint` ; AI drafts, human reviews.

**Risk-flagged modules** ; List modules from the context-pack's "Affected Modules" section that carry a `high` or `medium` risk label. Include the module name and the risk rationale.

### 3. Present draft and iterate

Present the draft to the user. Ask for feedback on each section explicitly. If the user provides changes:

1. Apply the changes to the composed draft.
2. Record the iteration round as a Jira comment:
   ```
   --- Draft Round <N> | <YYYY-MM-DD> ---
   Changes applied: <summary of changes>
   Rationale: <user's stated reason>
   ```

Repeat until the user approves or instructs the skill to write the draft as-is.

### 4. Write the Jira epic description

Call `editJiraIssue` to update the epic description with the full draft:

```
h2. Description
<description>

h2. Success Criteria
<numbered list>

h2. Outline Stories
<numbered list with Actor candidate for each>

h2. Risk-Flagged Modules
<list with risk label and rationale>

----
Context-pack: docs/pn/context-packs/<EPIC>.md
Outline: docs/pn/prd/<EPIC>.outline.md
```

Note: Jira descriptions use Jira wiki markup (`h2.`, `*`, `#`). Do not use markdown headers inside the Jira description field.

### 5. Write the outline artefact

Write `docs/pn/prd/<EPIC>.outline.md`:

```markdown
---
prd: PRD-002
plan: PLAN-001
epic: <EPIC key>
date: <YYYY-MM-DD>
author: <git config user.name>
---

# Outline: <Epic summary>

## Description

<description>

## Success Criteria

<numbered list>

## Outline Stories

| # | Title | PN Actor |
|---|-------|----------|
| 1 | <title> | <AI/Human/Joint> |
...

## Risk-Flagged Modules

| Module | Risk | Rationale |
|--------|------|-----------|
| <name> | high/medium | <rationale> |
```

If the file already exists, overwrite it. Add `updated: <YYYY-MM-DD>` to the frontmatter on subsequent runs.

### 6. `pn_phase` advancement on approval

If the user explicitly approves the draft (says "approve", "looks good, advance", or equivalent):

1. Call `editJiraIssue` to set `PN Phase = estimate` on the epic using the `customfield_*` id from `.pn/settings.json`.
2. Verify `pn_phase` was `refine` before advancing. If it was already `estimate`, report the current state and skip the mutation.
3. Since both `refine` and `estimate` map to Jira status `To Do`, no Jira status transition is required.
4. Post a Jira comment:
   ```
   Draft approved by <git config user.name>. PN Phase advanced: refine -> estimate.
   Next: run estimate-write-prd <EPIC> to produce the full PRD and Jira stories.
   ```

If the user does not explicitly approve, leave `pn_phase` as `refine` and report: "Draft written. Run again and approve when ready to advance."

### 7. Report

Print: path of the outline artefact, number of outline-stories, `pn_phase` value after the run, and any warnings (too few/many stories, risk-flagged modules).

## Edge cases

- **Context-pack absent**: abort and direct the user to run `refine-capture-context` first.
- **`pn_phase` already `estimate`**: refuse without `--force`; with `--force`, overwrite description and outline but do not regress the phase to `refine`.
- **`pn_phase` manually advanced to a later phase between runs**: detect on `getJiraIssue`, refuse to mutate, report the current phase, and suggest the correct skill.
- **Zero outline-stories**: flag as incomplete; refuse to write the Jira description until at least one outline-story exists.
- **More than 10 outline-stories**: warn and suggest splitting into sub-epics; allow the user to override.

## Idempotency

Re-running on the same epic with the same content produces the same result. Iteration round comments are always new (not deduplicated); the epic description is overwritten (not appended). The outline artefact is overwritten.

## `pn_phase` transitions

| Transition | From | To | When | Jira status change |
|------------|------|----|------|--------------------|
| Draft approved | `refine` | `estimate` | User explicitly approves the draft in step 6 | none (`To Do` maps to both) |

The skill never regresses `pn_phase`. If the epic is already at `estimate` or later, the phase is not touched.
