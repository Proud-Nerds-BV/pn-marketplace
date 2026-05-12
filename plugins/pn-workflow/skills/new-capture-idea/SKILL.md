---
name: new-capture-idea
description: Captures a raw idea from the PO and writes a structured idea-brief at docs/pn/ideas/<slug>.md with sections for problem, user, hypothesis, raw scope, and open questions. No Jira issue is created or touched. Usable in a Claude Desktop session without repo-level code access. Use when the user wants to record a new product idea, feature request, or improvement hypothesis before any refinement has started; triggers on /pn-workflow:new-capture-idea or when the user describes an idea and asks to capture it.
allowed-tools: Read, Write, Bash
---

# new-capture-idea

Records a PO's raw idea as a structured idea-brief markdown artefact. No Jira issue is created or modified; no source code is read. This is the entry point to the Pre-Trajectory pipeline.

`pn_phase` value: `new`

## When to use

- A PO or DEV has a new product idea, feature request, or improvement hypothesis and wants to record it before any refinement takes place.
- `PN Phase` on the eventual Jira epic is intended to start at `new`.

## When not to use

- A Jira epic already exists and refinement is underway; use `refine-grill-requirements` instead.
- The idea has already been captured; use the existing idea-brief as input to `refine-grill-requirements`.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Idea description | User message | Yes |
| Slug (URL-safe short name) | Derived from idea title or provided by user | Yes (auto-derived if not provided) |
| Author | `git config user.name` | Yes (auto-read) |

## Outputs

| Artefact | Path | Description |
|----------|------|-------------|
| Idea-brief markdown | `docs/pn/ideas/<slug>.md` | Structured brief with five sections plus frontmatter |

## Procedure

### 0. Preconditions

1. Confirm `git config user.name` returns a non-empty value; use it as `author` throughout. Never use "Claude" or any tool name.
2. Confirm `docs/pn/ideas/` exists; create it (with parent directories) if absent.
3. Check whether `.pn/settings.json` is present. If absent, continue with degraded mode (no Jira links possible) and note the absence in the idea-brief's open questions.

### 1. Gather idea details

If the user's message does not contain all required sections, ask targeted questions in a single round to collect:

- **Problem** ; What pain point or opportunity is this addressing? Who currently suffers from it?
- **User** ; Primary user role(s) affected (e.g., PO, DEV, end-customer).
- **Hypothesis** ; What outcome do we expect if we build this?
- **Raw scope** ; Rough list of capabilities, features, or changes implied. No design yet; brain-dump only.
- **Open questions** ; Anything unresolved that must be answered before refinement can begin.

Do not fill in sections the user has not provided; mark them `TBD` and add them to open questions.

### 2. Derive slug

Transform the idea title to a slug: lowercase, spaces and special characters replaced with hyphens, max 50 characters, no leading or trailing hyphens. If `docs/pn/ideas/<slug>.md` already exists, append a `-2`, `-3`, etc. suffix.

### 3. Write the idea-brief

Write `docs/pn/ideas/<slug>.md` with the following structure:

```markdown
---
prd: PRD-002
plan: PLAN-001
date: <YYYY-MM-DD>
author: <git config user.name>
status: draft
jira_key: none
related: []
---

# <Idea title>

## Problem

<problem statement>

## User

<user roles affected>

## Hypothesis

<expected outcome>

## Raw Scope

<brain-dump of implied capabilities>

## Open Questions

<unresolved questions, one per bullet>
```

If the file already exists (idempotent re-run), overwrite only the sections the user has provided new content for; preserve any manually edited content in other sections.

### 4. Report

Print the path of the created or updated file and a one-line summary of the idea.

## Edge cases

- **Slug collision** ; If the derived slug already exists and the user is describing the same idea (detected by comparing titles), update the existing file rather than creating a duplicate.
- **Missing `docs/pn/ideas/` directory** ; Create it and proceed.
- **No `git config user.name`** ; Abort with: set `git config user.name` and re-run.
- **Claude Desktop without git access** ; The user can supply the author name manually; the skill accepts an explicit `author:` override in the invocation.

## Idempotency

Re-running with the same slug updates only sections where new content was supplied. The `date` frontmatter field is set on first creation and never overwritten on subsequent runs.

## `pn_phase` transitions

| Transition | When | Jira status change |
|------------|------|--------------------|
| none | This skill only writes a local artefact; no Jira issue exists yet | none |

Note: `pn_phase` is set on the Jira epic when one is created later. This skill does not create or touch Jira.
