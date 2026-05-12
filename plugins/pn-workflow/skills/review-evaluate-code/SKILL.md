---
name: review-evaluate-code
description: Runs a deeper feature-level code evaluation across the union of PRs for a feature. Writes `docs/pn/findings/<KEY>.md` with severity-tagged, category-tagged findings (security, performance, correctness, style, architecture), each carrying a stable hash of `(file + line-range + category)` for deduplication across re-runs. Merges new findings into the existing file rather than appending duplicates; posts a single summary comment on the feature's epic with verdict + count by severity. On success advances `PN Phase: review -> handover`; Jira status remains `In Review`. Refuses with zero writes on missing PR, missing story, or incompatible `PN Phase`. Trigger when the user runs `/pn-workflow:review-evaluate-code`, asks to "evaluate the feature", "do a deeper code review", "check cross-PR drift", or when `pn_phase` is `review` after `review-pr` has produced its verdict.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue
---

# review-evaluate-code

Independent feature-level evaluation. The skill reads the diff for the story (or the union of PRs for a feature), generates findings tagged with severity and category, deduplicates them against any prior findings file by stable hash, writes the merged result to `docs/pn/findings/<KEY>.md`, and posts a one-comment summary on the feature's epic. On a clean run it advances `PN Phase` from `review` to `handover` (Jira status stays `In Review` because both phases map there). Refusals (incompatible phase, missing PR, missing story, missing diff base) leave Jira, the repo, and the epic untouched.

## When to use

- After `review-pr` has cleared a feature's PRs and `pn_phase = review`.
- QA or TL wants a deeper, cross-PR pass before Handover.
- A previous evaluation flagged findings and the team wants to re-evaluate after fixes (re-run dedupes).

## When not to use

- `PN Phase` is not `review`; refuse with read-before-write drift cited.
- No PR or diff base can be resolved for the story / feature; refuse.
- The story has no `Acceptance Criteria`; refuse with a route to `estimate-check-ticket`.

## Inputs

| Source | What is read | How |
|--------|-------------|-----|
| Branch / arg | Story key (`--key=<KEY>` or branch-parsed) | Bash |
| Jira story | `Acceptance Criteria`, `Expected Scope`, `PN Phase`, Jira status, parent epic key | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Code diff | `git diff <base>..HEAD` where `<base>` is the branch base (e.g., `develop` for `feature/*`) | Bash |
| Prior findings | `docs/pn/findings/<KEY>.md` if present | Read |
| Code-knowledge layer | `.pn/index/index.sqlite` for cross-module summaries and duplication hints | Bash (sqlite3) |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Findings file | `docs/pn/findings/<KEY>.md` | Source of truth; merged across re-runs |
| Epic comment | One per evaluation run; summary only | Posted to the parent epic of the story |
| `PN Phase` mutation | `review -> handover` on a clean run | Jira status unchanged (`In Review`) |

## Findings schema

Frontmatter:

```yaml
---
prd: PRD-004
plan: PLAN-001
key: <JIRA-KEY>
epic: <PARENT-EPIC-KEY>
author: <git config user.name>
date_first: <YYYY-MM-DD>
date_last: <YYYY-MM-DD>
---
```

Each finding:

```yaml
- id: <stable hash>
  title: <short title>
  severity: Critical | High | Medium | Low | Info
  category: security | performance | correctness | style | architecture
  location: <file>:<start_line>-<end_line>
  evidence: <code excerpt or description, max 200 chars>
  recommendation: <remediation guidance>
  status: new | carried-over | resolved
  first_seen: <YYYY-MM-DD>
  last_seen: <YYYY-MM-DD>
```

**Stable hash:** `sha1(file + ":" + start_line + "-" + end_line + ":" + category)`, truncated to 12 hex chars. This is the deduplication key; it stays stable across re-runs as long as the location and category do not change.

## Procedure

### 1. Resolve story + drift check

- Resolve the story key from `--key` or the branch.
- Read the Jira story; capture `PN Phase`, Jira status, `Acceptance Criteria`, `Expected Scope`, parent epic key.
- Read-before-write: if `PN Phase != review`, refuse with both values cited and any drift between `PN Phase` and Jira status spelled out. No writes.

### 2. Load prior findings

- If `docs/pn/findings/<KEY>.md` exists, parse it into a map keyed by stable hash. Capture every prior finding's `status`, `first_seen`, and `last_seen`.
- If absent, start with an empty map.

### 3. Generate fresh findings

- Resolve the diff base (typically `develop` for `feature/*`, `main` for `hotfix/*`).
- Run `git diff <base>..HEAD --unified=3`.
- Analyse the diff for:
  - **security:** unsafe interpolation, missing authz, leaked secrets, unsafe deserialization.
  - **performance:** N+1 queries, unbounded loops, unnecessary recomputation.
  - **correctness:** off-by-one, missing null/empty checks, wrong operator, missed AC.
  - **style:** PN hard-rule violations not caught by `review-pr` (e.g., emdashes in comments, non-rem units in computed SCSS).
  - **architecture:** cross-module duplication, public-API churn, layering violations (consult `.pn/index/index.sqlite` for module summaries).
- Tag each finding with severity, category, and compute the stable hash.

### 4. Dedupe + merge

- For each fresh finding:
  - If its hash exists in the prior map: mark `status: carried-over`; update `last_seen`; keep the prior `first_seen`.
  - Else: mark `status: new`; set both `first_seen` and `last_seen` to today.
- For each prior finding not present in the fresh set: mark `status: resolved`; keep `first_seen`; leave `last_seen` at the prior value.

### 5. Write the merged findings file

- Recompute the frontmatter (`date_last` = today; `date_first` = earliest `first_seen` across all findings).
- Write `docs/pn/findings/<KEY>.md` atomically. The file is the single source of truth.

### 6. Post the epic summary comment

- Compose a one-comment summary on the parent epic with:
  - Verdict: `pass` (no Critical / High new findings) or `block` (any Critical / High new findings).
  - Counts by severity: new, carried-over, resolved.
  - Link to the findings file path.
- Post via `mcp__claude_ai_Atlassian__addCommentToJiraIssue`. Do not post a separate comment per finding.

### 7. Phase advance on pass

- If the verdict is `pass`, mutate `PN Phase: review -> handover` via `editJiraIssue`. Do not transition Jira status (both phases map to `In Review`). Verify the new `PN Phase`.
- If the verdict is `block`, leave `PN Phase` and Jira status unchanged.

### 8. Exit summary

Print to chat:

```
=== review-evaluate-code complete ===

Story    : <KEY>
Epic     : <EPIC-KEY>
PN Phase : review -> handover | review (blocked)
Status   : In Review (unchanged)
Findings : <N> new (Critical: N, High: N, Medium: N, Low: N, Info: N)
Carried  : <N>
Resolved : <N>
File     : docs/pn/findings/<KEY>.md
Comment  : posted to <EPIC-KEY>
```

## Edge cases

- **No diff base resolvable:** refuse; ask the user for the base branch.
- **Findings file present but corrupt:** back it up to `docs/pn/findings/<KEY>.md.bak-<timestamp>`; start with an empty prior map; flag in the exit summary.
- **All findings carried-over:** verdict is `pass` if no Critical/High remain `carried-over` as still-present; otherwise `block`. Phase advance follows the verdict.
- **No findings at all:** verdict `pass`; phase advances; write a minimal findings file with empty findings list and frontmatter.
- **Manual `PN Phase` edit between runs:** read-before-write detects it; refuse if incompatible; cite both values.
- **Jira MCP unavailable:** write the findings file locally; skip the epic comment and phase mutation; log "Jira unavailable; findings written locally only".

## `pn_phase` transitions

| When | From | To | Jira status mapping |
|------|------|----|---------------------|
| Verdict `pass` | `review` | `handover` | unchanged (`In Review`) |
| Verdict `block` | `review` | `review` | unchanged (`In Review`) |
