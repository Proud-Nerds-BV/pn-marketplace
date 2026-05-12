---
name: update-docs
description: Refreshes ARCHITECTURE.md and topical docs under docs/architecture/ from per-module summaries stored in the code-knowledge layer at .pn/index/index.sqlite. Trigger when the user runs /pn-workflow:update-docs, says "refresh the docs", "update architecture docs", "sync docs from code knowledge", or "docs are stale". Rewrites only sections fenced by <!-- pn:auto-start --> and <!-- pn:auto-end --> markers; never touches manually authored prose. Repo-only output; no Jira mutations.
allowed-tools: Bash, Read, Write, Edit
---

# update-docs

Keeps `ARCHITECTURE.md` and topical architecture documents under `docs/architecture/` in sync with the current state of the code-knowledge layer. It queries the per-module summaries stored in `.pn/index/index.sqlite`, detects which summaries have changed since the last refresh, and rewrites only the auto-managed sections inside `<!-- pn:auto-start -->` / `<!-- pn:auto-end -->` fences. Manually authored prose outside those fences is never touched.

## When to use

- After the `index-on-write` hook has updated module summaries and you want the architecture docs to reflect those changes.
- As part of a sprint wrap-up or release readiness check.
- Whenever a team member asks "are the docs up to date?".
- On the Claude Code surface by QA or TL roles.

## When not to use

- When you want to write new manually authored documentation sections. This skill only manages the auto-generated regions.
- When `bootstrap-project` has not been run; the code-knowledge layer does not exist yet.
- When no source files have changed since the last `update-docs` run (the skill detects this and exits early).

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| `.pn/settings.json` | `code_knowledge.path`, `code_knowledge.format`, `language.output` | Read |
| Code-knowledge layer | Per-module summaries from `.pn/index/index.sqlite` (`summaries` table: `module`, `summary`, `updated_at`); last refresh timestamp from `schema_meta` | Bash (sqlite3) |
| `ARCHITECTURE.md` | Existing content, to preserve manually authored sections | Read |
| `docs/architecture/*.md` | Existing topical docs, to preserve manually authored sections | Read |
| `.pn/index/last-docs-refresh` | Timestamp of the previous `update-docs` run (written by this skill) | Read |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Updated architecture doc | `ARCHITECTURE.md` | Auto-managed sections replaced; manually authored prose preserved |
| Updated topical docs | `docs/architecture/<module>.md` | One file per module with a changed summary; created if absent |
| Refresh timestamp | `.pn/index/last-docs-refresh` | ISO timestamp; used for staleness detection on the next run |

No Jira mutations. No commits created unless the user explicitly requests one. No source code touched.

## Section markers

Auto-managed sections are delimited by:

```html
<!-- pn:auto-start module="<module-name>" updated="<ISO timestamp>" -->
...generated content...
<!-- pn:auto-end module="<module-name>" -->
```

These markers are inserted by this skill on first run and preserved across subsequent runs. Content between the markers is the only thing this skill replaces.

## Procedure

### 1. Read `.pn/settings.json`

Read `.pn/settings.json`. Extract `code_knowledge.path` (default `.pn/index/`). If `jira.cloud_id` is empty or any required `customfield_*` id still matches the placeholder `customfield_XXXXX`, abort with "project not bootstrapped".

### 2. Check code-knowledge availability

Verify that `.pn/index/index.sqlite` exists and is readable. If the file is missing, abort with "code-knowledge layer not found; run bootstrap-project or wait for index-on-write to seed it".

### 3. Read the last refresh timestamp

Read `.pn/index/last-docs-refresh`. If absent, treat as "never refreshed" (i.e., all summaries are stale).

### 4. Query changed summaries

Run via Bash with sqlite3:

```sql
SELECT module, summary, updated_at
FROM summaries
WHERE updated_at > '<last-refresh-timestamp>'
ORDER BY module;
```

If the result set is empty, print "all summaries up to date; nothing to refresh" and exit cleanly without writing any files.

### 5. Update `ARCHITECTURE.md`

Read `ARCHITECTURE.md`. If it does not exist, create it with a minimal skeleton:

```markdown
# Architecture

<!-- pn:auto-start module="overview" updated="<now>" -->
<!-- pn:auto-end module="overview" -->
```

For each changed module, locate the matching `<!-- pn:auto-start module="<module>" -->` ... `<!-- pn:auto-end module="<module>" -->` block. Replace the content between the markers with the new summary. Update the `updated` attribute in the opening marker. If no block for the module exists, append a new fenced block at the end of the file.

### 6. Update topical docs under `docs/architecture/`

Create `docs/architecture/` if it does not exist. For each changed module, read (or create) `docs/architecture/<module>.md`. Apply the same marker-based replacement as Step 5. The topical doc may contain additional manually authored sections above or below the auto-managed block; leave them untouched.

### 7. Write the refresh timestamp

Write the current ISO timestamp to `.pn/index/last-docs-refresh`. This resets the staleness window for the next run.

### 8. Summarise to chat

Print a summary of the run:

```
=== update-docs complete ===

Refreshed : <N> modules
Skipped   : <N> modules (up to date)
Files written:
  - ARCHITECTURE.md
  - docs/architecture/<module>.md
  - ...
Timestamp : <ISO timestamp>
```

## Edge cases

- **No summaries in the index at all:** Print "code-knowledge layer exists but contains no summaries; run index-on-write or seed the index first" and exit cleanly.
- **Module name contains path separators:** Sanitise the module name to a safe filename by replacing `/` and `\` with `-` before constructing the topical doc path.
- **Marker mismatch (start without end):** Log "malformed marker for module `<name>`; skipping that module" and continue with the rest.
- **Read-only filesystem:** The skill cannot write `.pn/index/last-docs-refresh` or the doc files. Abort with a filesystem error message rather than silently failing.

## Idempotency notes

- Re-running when no summaries have changed since the last refresh produces no file changes and exits immediately at Step 4.
- Re-running after new summaries are available updates only the stale modules; previously refreshed modules are left untouched.
- The refresh timestamp is updated only on a successful run; an aborted run does not advance the timestamp, so all modules remain stale for the next attempt.
