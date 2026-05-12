---
name: todo-plan-phases
description: Produces docs/pn/plans/<EPIC>.md from an approved PRD and context-pack with phased breakdown, final per-story Acceptance Criteria, PN Actor, story points, model-tier hint, depends-on graph, and an explicit parallel-or-sequential decision per phase. Writes ADRs at docs/pn/adrs/NNNN-<slug>.md for non-obvious architectural decisions (new module, public-API change, framework choice, cross-module contract change), maintains docs/pn/adrs/README.md as an index, and lifts every in-scope Jira story's PN Actor, Acceptance Criteria, story points, Depends-on links, and PN Phase = todo. Refuses on cyclic depends-on graphs and shows the cycle path. Runs as an internal loop with the TL/Architect until the plan converges. Use when the user invokes /pn-workflow:todo-plan-phases, asks to architect or plan an epic, or when pn_phase on the epic is approval and stories are ready for sprint planning.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createIssueLink, mcp__claude_ai_Atlassian__getIssueLinkTypes
---

# todo-plan-phases

Turns an approved PRD plus context-pack into a phased plan with sharp AC, an acyclic depends-on graph, ADRs for non-obvious decisions, and fully populated Jira story fields. Internal-loop skill: iterates with the TL/Architect until the plan is coherent and converges.

`pn_phase` value transition: `approval` -> `todo` on the in-scope stories at run start; the epic's `pn_phase` is advanced to `todo` on TL confirmation.

PRD: docs/anvil/prds/PRD-003-architecture-planning.md
PLAN: docs/anvil/plans/PLAN-001-pn-skills-implementation.md

## Identity

- Role: TL/Architect primary; DEV consulted; PO/QA review the output read-only.
- Surface: Claude Code only.
- Phase: `pn_phase = todo`; Jira status remains `To Do` throughout.
- Mutations: plan file, ADR files, ADR index, Jira custom fields and issue links on in-scope stories. Never edits source code, tests, configuration, or transitions Jira workflow status.

## When to use

- `pn_phase` on the epic is `approval` and pre-trajectory validation has completed (`estimate-check-ticket` passed all stories).
- A PRD exists at `docs/pn/prd/<EPIC>.md` with `status: approved` (or equivalent) in the frontmatter.
- A context-pack exists at `docs/pn/context-packs/<EPIC>.md`.
- The TL needs a coherent technical plan before sprint-start.

## When not to use

- `pn_phase` is `new`, `refine`, or `estimate`; run the pre-trajectory skills first.
- `pn_phase` is `progress`, `review`, `deploy`, `release-ready`, or `released`; planning is done. Use the relevant downstream skill instead.
- The PRD is missing, unapproved, or partial; refuse with an actionable error pointing at `estimate-write-prd` and `estimate-check-ticket`.
- The context-pack is missing; refuse with a pointer to `refine-capture-context`.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) | Argument or user message | Yes |
| Approved PRD | `docs/pn/prd/<EPIC>.md` | Yes |
| Context-pack | `docs/pn/context-packs/<EPIC>.md` | Yes |
| Code-knowledge layer | `.pn/index/index.sqlite` | Yes; read-only |
| Jira epic and child stories | Atlassian MCP | Yes |
| Project config | `.pn/settings.json` (model-tier enum, language, custom-field ids) | Yes |
| Existing ADR index | `docs/pn/adrs/README.md` | Optional; created if absent |
| Author | `git config user.name` | Yes |

## Outputs

| Artefact | Path / Location | Description |
|----------|-----------------|-------------|
| Plan file | `docs/pn/plans/<EPIC>.md` | Phased plan with stories, final AC, Actor, points, depends-on, model-tier, parallel/sequential decision per phase |
| ADRs | `docs/pn/adrs/NNNN-<slug>.md` | One per non-obvious decision; sequence numbered without collisions |
| ADR index | `docs/pn/adrs/README.md` | Table of all ADRs; appended in-place |
| Jira story updates | Each in-scope story | `Acceptance Criteria`, `Expected Scope`, `Story Points`, `PN Actor`, `PN Phase = todo`, plan back-link in description, `Depends on` issue links |
| Jira epic comment | The epic | Link to the plan, list of stories updated, ADR count |
| Jira epic field update | The epic | `PN Phase = todo` (only on TL confirmation) |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json`; confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). Read `language.output`, `language.jira`, `model_tiers`, and the custom-field ids for `PN Phase`, `PN Actor`, `Acceptance Criteria`, `Expected Scope`, `Story Points`. Abort with an actionable message on any missing key.
2. Read the author via `git config user.name`. Abort if empty.
3. Call `getJiraIssue` on the epic; read `pn_phase`. If not `approval`, refuse and report the current phase with the correct next skill.
4. Read `docs/pn/prd/<EPIC>.md`. Verify frontmatter `status` is `approved` (or the project equivalent). Abort otherwise.
5. Read `docs/pn/context-packs/<EPIC>.md`. Abort if absent with: run `refine-capture-context` first.
6. List child stories via `searchJiraIssuesUsingJql`: `project = <project_key> AND "Epic Link" = <EPIC>`. Read each story's summary, description, current AC, Actor, points, links.
7. Confirm `docs/pn/plans/` exists; create it if absent. Confirm `docs/pn/adrs/`; create it and seed `README.md` with an empty index if absent.
8. Probe the code-knowledge layer at `.pn/index/index.sqlite`. If absent or empty, warn the TL and continue with reduced affected-modules awareness.
9. Resolve the Jira issue-link type for `Depends on` via `getIssueLinkTypes`. Abort if absent.

### 1. Derive draft plan

For every in-scope story:

1. Sharpen the AC into testable, mutually exclusive bullets (Given / When / Then or "The system..." or "A user can..."). Each bullet must be independently verifiable.
2. Assign `PN Actor` (one of `AI`, `Human`, `Joint`) based on PRD guidance, the Actor candidate captured during pre-trajectory, and the affected-modules risk flags.
3. Estimate `Story Points` using the project's existing scale (read sample stories on the epic for calibration). Re-use the pre-trajectory estimate if already sane; never silently overwrite without recording the change in the loop transcript.
4. Pick a `model-tier` hint from `.pn/settings.json.model_tiers` for every story with `PN Actor = AI` (omit for `Human` / `Joint`).
5. Declare `Depends-on` story keys.

### 2. Build the depends-on graph and detect cycles

1. Build a directed graph: nodes are story keys, edges are `Depends-on`.
2. Run a depth-first search with three colours (white / grey / black). On encountering a grey node, you have a cycle.
3. On cycle detection: refuse to write the plan or any Jira updates. Print the cycle path in human-readable form, for example: `ABC-12 -> ABC-15 -> ABC-19 -> ABC-12`. Return control to the loop so the TL can break the cycle.
4. On success: produce a topological order. Group stories into phases by depth (or by an explicit grouping the TL provides). Tag each phase as `parallel` (no internal dependencies) or `sequential` (internal dependencies present), with a one-line rationale referencing the graph.

### 3. Identify ADR-worthy decisions

A decision warrants an ADR when it:

- introduces a new module or service;
- changes a public API (request shape, response shape, or contract);
- picks a new framework, library, or storage technology;
- alters a cross-module contract or moves responsibility across module boundaries;
- otherwise records a non-obvious "why" that future readers could not reconstruct from the code.

For each ADR-worthy decision, compose an ADR (see template below). For trivial decisions, do not create an ADR; mention them inline in the plan's Technical Design section.

### 4. Run the internal loop

Iterate with the TL until convergence:

1. Present the draft plan summary: phases, stories per phase, AC count per story, Actor distribution, total points, graph status, ADRs identified.
2. Ask the TL: AC sharp enough? Actor right? Points right? Depends-on complete? Phase boundaries right? ADRs sufficient?
3. Apply edits.
4. Re-run cycle detection.
5. Stop when: (a) every AC passes testability, (b) every story has Actor and points, (c) the graph is acyclic, (d) the TL confirms. Abort writes if the TL aborts.

Record the iteration count for the session journal hook.

### 5. Write ADRs and update the index

1. Read `docs/pn/adrs/README.md` to find the highest existing `NNNN`. If the directory is empty, start at `0001`. Allocate consecutive numbers to new ADRs.
2. For each new ADR write `docs/pn/adrs/NNNN-<kebab-slug>.md` using the template:

```markdown
---
adr: NNNN
title: <Title>
status: proposed
date: <YYYY-MM-DD>
author: <git config user.name>
plan: docs/pn/plans/<EPIC>.md
epic: <EPIC>
prd: docs/pn/prd/<EPIC>.md
---

# ADR NNNN: <Title>

## Context

<What forces are at play; what problem are we solving; cite the relevant plan section.>

## Decision

<The decision in one or two sentences.>

## Consequences

<Positive, negative, neutral. Include any new obligations on other modules.>

## Alternatives Considered

<Each alternative with a one-line reason for rejection.>

## References

- Plan: docs/pn/plans/<EPIC>.md#<section-anchor>
- PRD: docs/pn/prd/<EPIC>.md
- Context-pack: docs/pn/context-packs/<EPIC>.md
```

3. Append a row to `docs/pn/adrs/README.md`:

```markdown
# ADR Index

| NNNN | Title | Status | Date | Epic |
|------|-------|--------|------|------|
| 0001 | <Title> | proposed | <YYYY-MM-DD> | <EPIC> |
```

Never silently rewrite an existing ADR; only append.

### 6. Write the plan file

Write `docs/pn/plans/<EPIC>.md` using the ANVIL plan structure:

```markdown
---
plan: <EPIC>
prd: docs/pn/prd/<EPIC>.md
context_pack: docs/pn/context-packs/<EPIC>.md
epic: <EPIC>
upstream_prd: PRD-003
upstream_plan: PLAN-001
date: <YYYY-MM-DD>
author: <git config user.name>
status: draft
---

# Plan: <Epic summary>

## Status

draft | approved | superseded

## Author

<git config user.name>

## PRDs

- Upstream PRD: PRD-003 (docs/anvil/prds/PRD-003-architecture-planning.md)
- Epic PRD: docs/pn/prd/<EPIC>.md
- Context-pack: docs/pn/context-packs/<EPIC>.md

## Problem

<One to three paragraphs lifted from the PRD problem statement and refined with planning insight.>

## Acceptance Criteria (epic-level)

<Numbered list aggregating the PRD's AC; per-story AC live in the Story Breakdown.>

## Technical Design

<Affected modules (from code-knowledge layer); high-level approach; data flows; module
boundaries; references to each ADR by number; inline mention of trivial decisions.>

## Implementation Phases

### Phase 1: <name>
- **Execution:** parallel | sequential
- **Rationale:** <one line referencing the graph>
- **Stories:**
  - **<KEY-1>** - <title>
    - **PN Actor:** AI | Human | Joint
    - **Model-tier:** <tier> (AI only)
    - **Story Points:** <n>
    - **Depends-on:** <KEY-x>, <KEY-y> (or `none`)
    - **Acceptance Criteria:**
      1. <testable AC>
      2. <testable AC>
    - **Affected modules:** <module-a>, <module-b>
    - **ADR refs:** <NNNN> (if any)

### Phase 2: <name>
<...>

## Parallelization

<Summary table of phases and their parallel/sequential decision; cross-phase ordering;
identify which stories may run in parallel under PRD-004's `--batch` flag.>

| Phase | Execution | Stories | Rationale |
|-------|-----------|---------|-----------|
| 1 | parallel | <KEY-1>, <KEY-2> | independent leaves of the graph |

## Review

<Reviewers, sign-off log, links to grilling sessions / loop iterations.>

## Out of Scope

<Explicit non-goals lifted from the PRD plus any planning-time exclusions.>

## Open Questions

<Numbered list of unresolved technical questions with owners.>

## Amendment Log

| Date | Change | Reason |
|------|--------|--------|
| <YYYY-MM-DD> | Initial plan | Created by todo-plan-phases |
```

On re-run: preserve the original `date`, add `updated: <YYYY-MM-DD>` to frontmatter, append an amendment-log row describing what changed. Never wipe history. Merge non-destructively with any TL-side manual edits to story descriptions or AC: surface conflicts in the loop for explicit resolution before writing.

### 7. Update Jira stories

For each in-scope story, in topological order:

1. `editJiraIssue` with:
   - `description` (Jira wiki markup): append or replace a `h2. Plan Reference` block linking to `docs/pn/plans/<EPIC>.md#<story-anchor>`. Preserve any prior PRD reference block.
   - `customfield_*` for `Acceptance Criteria`: the final AC text for this story.
   - `customfield_*` for `Expected Scope`: tightened in/out list.
   - `customfield_*` for `Story Points`: the planning estimate.
   - `customfield_*` for `PN Actor`: `AI` | `Human` | `Joint`.
   - `customfield_*` for `PN Phase`: `todo`.
2. For every `Depends-on` declared in the plan, call `createIssueLink` with link type `Depends on` between this story and its predecessor. Skip if the link already exists (read existing links first).
3. Never transition Jira workflow status.

If any story update fails: stop, do not advance the epic's `pn_phase`, report the partial state, and return to the loop.

### 8. Advance the epic's pn_phase on TL confirmation

After all stories are updated and the TL has confirmed the plan:

1. `editJiraIssue` on the epic: set `PN Phase = todo`.
2. Post a Jira comment on the epic in `language.jira`:

```
Plan written: docs/pn/plans/<EPIC>.md
Stories updated: <N> (<KEY-1> ... <KEY-N>)
ADRs created: <M> (NNNN, NNNN, ...)
Depends-on graph: acyclic; <P> phases (<parallel-count> parallel, <sequential-count> sequential).
PN Phase advanced: approval -> todo on the epic and all in-scope stories.
Next: run progress-implement (PRD-004) per story when sprint starts.
```

### 9. Report

Print to the session:

- Plan file path.
- Number of stories updated and their keys.
- New ADRs (numbers and titles); skipped ADRs and why.
- Graph summary: total nodes, total edges, phase count, parallel-vs-sequential split.
- Loop iteration count.
- Any open questions left in the plan.

## Edge cases

- **PRD missing**: refuse. Tell the user: run `estimate-write-prd <EPIC>`.
- **PRD unapproved** (frontmatter `status` not `approved`): refuse. Tell the user: run `estimate-check-ticket <EPIC>` and obtain PO approval first.
- **Context-pack missing**: refuse. Tell the user: run `refine-capture-context <EPIC>` first.
- **Code-knowledge layer cold**: warn the TL; proceed with degraded affected-modules awareness; record the warning in the plan's Open Questions.
- **Cyclic Depends-on graph**: refuse all writes; print the cycle path; loop continues for fix-up.
- **Atlassian MCP unavailable**: write the plan file and ADRs only; skip all Jira mutations; report which steps were skipped; do not advance the epic's `pn_phase`.
- **Story manually edited between runs**: detect via comparing the prior plan's per-story AC against the live Jira story AC. On divergence, surface the diff in the loop and let the TL decide which side wins before writing.
- **Existing ADR with the same slug**: never overwrite; allocate the next `NNNN` and add a `supersedes: <prior-NNNN>` entry to the new ADR's frontmatter, and a `superseded-by:` row in the prior ADR's README index entry.
- **No ADR-worthy decisions**: write zero ADRs; the plan's Technical Design section still records the inline rationale.
- **TL aborts the loop**: write nothing; report the iteration count and the unresolved blockers.

## Idempotency

Re-running the skill on the same epic:

- Updates `docs/pn/plans/<EPIC>.md` in place; preserves the original `date`; appends an amendment-log row.
- Adds new ADRs only; never rewrites existing ADRs.
- Updates Jira story fields rather than duplicating; creates missing `Depends-on` links; does not delete links that the plan still declares.
- Re-posts a fresh epic comment (each run is a distinct event).

## `pn_phase` transitions

| Transition | When | Jira status change |
|------------|------|--------------------|
| Stories: `approval` -> `todo` | At the end of step 7, only on full success | none |
| Epic: `approval` -> `todo` | Step 8, only on TL confirmation | none |

Jira workflow status is never transitioned by this skill.
