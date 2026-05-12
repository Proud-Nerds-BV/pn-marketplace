---
name: refine-capture-context
description: Produces a context-pack at docs/pn/context-packs/<EPIC>.md by querying the code-knowledge layer for affected modules, searching Jira for related issues, searching Confluence for spec pages, and collecting related ADRs and glossary entries. Links the context-pack from the Jira epic via a comment and updates the epic description with a reference. Use when the user invokes /pn-workflow:refine-capture-context, asks to capture context for an epic, or when pn_phase on the epic is refine and a context-pack does not yet exist.
allowed-tools: Read, Write, Edit, Bash, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__searchConfluenceUsingCql, mcp__claude_ai_Atlassian__getConfluencePage
---

# refine-capture-context

Assembles a context-pack that bundles everything a DEV or TL needs to understand the blast-radius and background of an epic before architecture and estimation begin. Queries the code-knowledge layer, Jira, and Confluence; writes a single markdown file; and links that file from the Jira epic.

`pn_phase` value: `refine`

## When to use

- A Jira epic is in `pn_phase = refine` and no context-pack yet exists at `docs/pn/context-packs/<EPIC>.md`.
- Re-running to refresh the context-pack after new Confluence pages were added or new code modules were affected.

## When not to use

- `pn_phase` is `new`; capture the idea first with `new-capture-idea` and grill it with `refine-grill-requirements`.
- `pn_phase` is `estimate` or later; the context-pack should already exist. Re-run only if the user explicitly requests a refresh.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) | Argument or user message | Yes |
| Confluence space key(s) | `.pn/settings.json` under `confluence.spaces` or provided by user | Optional; degrades gracefully |
| Code-knowledge layer | `.pn/index/index.sqlite` | Optional; degrades gracefully |
| Ubiquitous language glossary | `UBIQUITOUS_LANGUAGE.md` | Optional; degrades gracefully |

## Outputs

| Artefact | Path | Description |
|----------|------|-------------|
| Context-pack | `docs/pn/context-packs/<EPIC>.md` | Full context bundle with six sections |
| Jira epic comment | Epic on Jira | Link to the context-pack file path |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json`; confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). Abort if any required value is unresolved.
2. Read the author from `git config user.name`. Never use "Claude" or a tool name.
3. Call `getJiraIssue` on the provided epic key. Verify `PN Phase` is `refine` (or `new`). If the phase is `estimate` or later, warn but allow a forced re-run when the user passes `--force`.
4. Confirm `docs/pn/context-packs/` exists; create it if absent.

### 1. Confluence spec content

Using `searchConfluenceUsingCql`, query the configured spaces for pages referencing the epic key or its title keywords. Retrieve the top 5 most relevant pages via `getConfluencePage`.

For each page, extract: page title, URL, and a summary of relevant sections.

If Confluence is unavailable or no results are found, record the section as:
```
none found ; query: <CQL used>
```

### 2. Architecture snapshot

Query the code-knowledge layer at `.pn/index/index.sqlite` (SQLite, via `Bash` with `sqlite3`):

```sql
SELECT path, lang, summary
FROM files
WHERE summary IS NOT NULL
ORDER BY mtime DESC
LIMIT 50;
```

Identify files whose summaries mention keywords from the epic title or Confluence content. Group them by module (top-level directory). List each module with its files and a one-line summary.

If the code-knowledge layer is absent or empty, record:
```
none found ; code-knowledge layer cold; re-run bootstrap-project to seed
```

### 3. Affected modules

From the architecture snapshot, flag modules that:
- Are directly referenced by the Confluence spec.
- Contain domain terms matching the epic's keywords.
- Have high churn (many recent modifications per `mtime`).

List each with a risk label: `low`, `medium`, `high` based on the number of matching signals.

If the layer is absent, record as "none found" with the degradation note.

### 4. Related Jira issues

Using `searchJiraIssuesUsingJql`, run two queries:

1. Issues in the same project whose summary contains epic title keywords.
2. Issues linked to the epic (via `issueLinks` field from `getJiraIssue`).

List each result with: key, summary, status, `pn_phase`, and relationship (linked / keyword-match).

If no issues found: record as "none found" with the JQL used.

### 5. Related ADRs

Search `docs/pn/adrs/` and `docs/anvil/adrs/` for ADR files whose titles or content mention the epic's domain terms. List each with: file path, title, status (Accepted / Proposed / Superseded).

If none found: record as "none found".

### 6. Glossary entries

Read `UBIQUITOUS_LANGUAGE.md` if present. Extract entries whose terms appear in the epic description or Confluence content. List each term with its definition.

If the file is absent: record as "none found ; UL glossary missing; run ubiquitous-language to create it".

### 7. Write the context-pack

Write `docs/pn/context-packs/<EPIC>.md`:

```markdown
---
prd: PRD-002
plan: PLAN-001
epic: <EPIC key>
date: <YYYY-MM-DD>
author: <git config user.name>
---

# Context Pack: <Epic summary>

## Confluence Spec Content

<results from step 1>

## Architecture Snapshot

<results from step 2>

## Affected Modules

<results from step 3>

## Related Jira Issues

<results from step 4>

## Related ADRs

<results from step 5>

## Glossary Entries

<results from step 6>
```

If the file already exists, overwrite all sections. Preserve the `date` frontmatter from the first run; add `updated: <YYYY-MM-DD>` for subsequent runs.

### 8. Link from the epic

Post a Jira comment on the epic via `addCommentToJiraIssue`:

```
Context-pack written: docs/pn/context-packs/<EPIC>.md
Sections: Confluence spec, Architecture snapshot, Affected modules, Related issues, ADRs, Glossary.
Re-run refine-capture-context --force to refresh after code or spec changes.
```

Then update the epic description via `editJiraIssue` to append (or update an existing reference block):

```
----
Context-pack: docs/pn/context-packs/<EPIC>.md (last updated: <YYYY-MM-DD>)
```

Do not overwrite unrelated content in the description; append the block at the bottom or update the existing `Context-pack:` line.

### 9. Report

Print: path of the context-pack, number of Confluence pages found, number of affected modules, number of related Jira issues, and any degradation notices.

## Edge cases

- **Atlassian MCP unavailable**: if Jira or Confluence calls fail, skip those sections (record "none found" with the error), write the context-pack with available data, and skip the Jira comment/description update. Report degradation clearly.
- **Epic not found in Jira**: abort with the key and a hint to verify `jira.project_key` in `.pn/settings.json`.
- **Code-knowledge layer cold**: degrade the architecture and modules sections; proceed with available data.
- **Context-pack already exists and `--force` not passed**: if `pn_phase` is `estimate` or later, warn the user and exit without overwriting. If `pn_phase` is still `refine`, overwrite (normal re-run).

## Idempotency

Re-running on the same epic refreshes all sections from live sources. The Jira comment is not duplicated; the skill posts a new comment with an updated timestamp. The description `Context-pack:` line is updated in place.

## `pn_phase` transitions

| Transition | When | Jira status change |
|------------|------|--------------------|
| none | This skill reads `pn_phase` but does not mutate it | none |
