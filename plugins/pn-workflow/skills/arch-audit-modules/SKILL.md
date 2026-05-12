---
name: arch-audit-modules
description: Runs a five-dimension architectural scorecard across all in-scope modules and produces docs/pn/audits/<DATE>-modules.md. Trigger when the user runs /pn-workflow:arch-audit-modules, asks to "audit the architecture", "score the modules", "check for architectural drift", or "run a module audit". Each dimension (depth, abstraction, type-safety, imports, autonomy) is evaluated by a dedicated sub-agent. Stage 2 creates a single RFC story in Jira for modules that score below threshold. Configurable thresholds in .pn/settings.json.
allowed-tools: Bash, Read, Write, Edit, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__getJiraIssueTypeMetaWithFields, mcp__claude_ai_Atlassian__getJiraProjectIssueTypesMetadata
---

# arch-audit-modules

Scores every in-scope module against five architectural dimensions using dedicated sub-agents and consolidates the results into a single scorecard document. A second stage reads the scorecard and creates one RFC redesign story in Jira for modules that fall below configurable thresholds. The skill is designed for quarterly use by the TL or on-pain when architecture drift is suspected.

## When to use

- Quarterly architectural review.
- After a major refactor or significant feature addition that touches multiple modules.
- When the team suspects coupling or cohesion issues are slowing velocity.
- When a module's test coverage drops or complexity spikes.
- On-pain: after a production incident whose root cause analysis points to architectural weaknesses.

## When not to use

- As a substitute for real-time code review. This skill operates at module level; use `review-pr` for per-PR review.
- For single-file analysis. The scorecard is most useful at module granularity.
- When the code-knowledge layer has not been seeded; the skill degrades significantly without module summaries.

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, `jira.custom_fields.*` ids, `arch_audit.thresholds.*`, `language.*` | Read |
| Code-knowledge layer | Module list and summaries from `.pn/index/index.sqlite` | Bash (sqlite3) |
| Source files | Module contents for the five sub-agent dimensions | Read |
| Existing audit reports | Previous `docs/pn/audits/*-modules.md` files (for trend comparison) | Read |
| Jira | Open RFC stories with label `pn-arch-rfc` in the project | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Scorecard | `docs/pn/audits/<YYYY-MM-DD>-modules.md` | Per-module table with dimension scores and recommendations |
| Jira RFC story | One story per run when at least one module scores below threshold | Carries `PN Phase = new` or `refine`; links to scorecard file |

The scorecard frontmatter links to PRD-007 and PLAN-001:

```yaml
---
prd: PRD-007
plan: PLAN-001
author: <git config user.name>
date: <YYYY-MM-DD>
scope: all-modules | <list of selected modules>
---
```

## Five dimensions

Each dimension is evaluated by a dedicated sub-agent that reads module source files and code-knowledge summaries:

| Dimension | What it measures | Score range |
|-----------|-----------------|-------------|
| **depth** | Nesting depth; call-stack depth; number of abstraction layers relative to module size | 1-5 |
| **abstraction** | Ratio of interface/contract definitions to concrete implementations; presence of dependency injection | 1-5 |
| **type-safety** | Coverage of type annotations, strict-mode settings, absence of `any`/`mixed` escape hatches | 1-5 |
| **imports** | Coupling: number of unique external module imports; circular dependency presence; import fan-out | 1-5 |
| **autonomy** | Deployability in isolation; absence of global state side effects; clean entry/exit points | 1-5 |

Score 5 = excellent; score 1 = critical concern. The composite score is the unweighted mean of the five dimensions, rounded to one decimal place.

Default thresholds (overridden per dimension in `.pn/settings.json` under `arch_audit.thresholds`):

```json
{
  "arch_audit": {
    "thresholds": {
      "composite": 3.0,
      "depth": 2.0,
      "abstraction": 2.0,
      "type_safety": 2.0,
      "imports": 2.0,
      "autonomy": 2.0
    }
  }
}
```

A module fails if its composite score is below `thresholds.composite` OR any single dimension is below its dimension threshold.

## Procedure

### Stage 1: Scorecard

#### 1. Read `.pn/settings.json`

Read `.pn/settings.json`. Extract all required fields. Confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). If not bootstrapped, abort with a remediation message.

#### 2. Load module inventory

Query `.pn/index/index.sqlite`:

```sql
SELECT DISTINCT module FROM summaries ORDER BY module;
```

If no modules are found, fall back to discovering modules by directory structure: top-level directories under `src/`, `app/`, or `lib/` (whichever exists). If no code-knowledge layer is present, log "code-knowledge layer unavailable; module discovery is best-effort from directory structure".

#### 3. Run five sub-agent evaluations

For each module, dispatch five sub-agent evaluations (one per dimension). Each sub-agent:

1. Reads the module's source files (up to 50 files; skip binary files).
2. Reads the module's summary from the code-knowledge layer if available.
3. Scores the dimension on the 1-5 scale according to the criteria in the Five dimensions table.
4. Returns: `{ module, dimension, score, evidence, recommendation }`.

Sub-agents run in parallel per module. All five evaluations for a module must complete before the module's row is written to the scorecard.

#### 4. Compute composite scores and flag failures

For each module, compute the composite score. Compare composite and per-dimension scores against thresholds from `.pn/settings.json`. Mark modules as `pass` or `fail`.

#### 5. Load previous scorecard for trend data

Read the most recent `docs/pn/audits/*-modules.md` file by filename sort order. Parse the per-module composite scores from the previous run to calculate a trend delta (`+0.3`, `-0.5`, etc.). If no previous scorecard exists, omit the trend column.

#### 6. Write the scorecard

Create `docs/pn/audits/` if absent. Write `docs/pn/audits/<YYYY-MM-DD>-modules.md`. The scorecard contains:

- Frontmatter (see above).
- A summary table: one row per module with columns: Module, Depth, Abstraction, Type-Safety, Imports, Autonomy, Composite, Trend, Status (pass/fail).
- A recommendations section: one subsection per failing module with the evidence and recommendations from the sub-agent evaluations.
- A "passed modules" section listing passing module names without detail.

### Stage 2: RFC story

#### 7. Determine whether an RFC story is needed

If no modules failed, print "all modules passed; no RFC story created" and exit. If at least one module failed, proceed.

#### 8. Check for an existing open RFC story

Query Jira: `type = Story AND labels = pn-arch-rfc AND project = <project_key> AND statusCategory != Done`. If an open RFC story already exists, add a comment to it with the new scorecard findings rather than creating a duplicate. If none exists, proceed to create one.

#### 9. Create the RFC story

Create a single Jira story:

- Summary: `Architecture RFC: module redesign <YYYY-MM-DD>`
- Type: Story
- Labels: `pn-arch-rfc`
- `PN Phase`: `new` (or `refine` if the team is already in refinement; default to `new`)
- Description: formatted markdown listing the failing modules, their composite scores, dimension breakdowns, and a link to the scorecard file path.

### Stage 3: Report to chat

#### 10. Summarise to chat

```
=== arch-audit-modules complete ===

Modules audited : <N>
Passed          : <N>
Failed          : <N> (below threshold)
Scorecard       : docs/pn/audits/<DATE>-modules.md
RFC story       : <STORY-KEY> (<created|updated|none>)
```

## Edge cases

- **Module has no source files (empty directory):** Score all dimensions as 0; mark as `fail`; note "empty module" in recommendations.
- **Module exceeds 50 files:** Evaluate a representative sample (first 25 + last 25 by filename sort); note "sampled" in the scorecard row.
- **Jira MCP unavailable:** Write the scorecard but skip Stage 2. Log "Jira unavailable; RFC story not created".
- **Previous scorecard malformed:** Skip trend calculation; log "previous scorecard unreadable; trend column omitted".
- **All modules fail:** Create one RFC story covering all failing modules; do not create multiple stories.

## Idempotency notes

- Re-running on the same date appends `-2`, `-3` to the filename rather than overwriting.
- The RFC story is created at most once per open Jira story (matched by label `pn-arch-rfc` and open status); subsequent runs add comments rather than new stories.
- Thresholds in `.pn/settings.json` are read fresh on each run; changing them between runs changes which modules are flagged without any other side effects.
