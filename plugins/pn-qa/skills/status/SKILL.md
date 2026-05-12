---
name: status
description: Displays a single-screen situational briefing for the current working context plus a short list of suggested next skill invocations derived from the current PN Phase. Trigger when the user runs /pn-qa:status, asks "what am I working on?", "show me status", "what is the current issue?", "what should I do next?", or "give me a briefing". Assembles four read-only sources: current git branch plus parsed Jira key, the linked Jira issue (summary, status, PN Phase), recent commit subjects, and the per-story scratchpad if one exists. Produces no files, no Jira mutations, and no git changes.
allowed-tools: Bash, Read, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__search
---

# status

Delivers a concise, terminal-friendly briefing of the developer's current working context by composing four read-only sources into a single chat output. It is explicitly a zero-side-effect skill: no files are written, no Jira issues are mutated, no commits are made, and no index is updated. Its sole purpose is situational awareness.

## When to use

- At the start of a coding session to orient yourself quickly.
- When returning to a branch after a context switch.
- When the PO or TL asks "where are we?" on a story.
- On either the Claude Code surface or Claude.ai PO surface.
- At any Jira workflow status; `status` has no status precondition.

## When not to use

- When you need to mutate state (transition an issue, write a comment, stage a commit). Use the appropriate phase skill instead.
- When you need a full audit history; `status` only shows the last ten commits and the current issue, not historical sprints.

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| Git working tree | `git branch --show-current` output | Bash |
| Git log | Last ten commit subjects on the active branch: `git log -10 --oneline` | Bash |
| Jira issue | Summary, description excerpt, status, `PN Phase` custom field, assignee, reporter | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Story scratchpad | `docs/pn/stories/<KEY>/scratchpad.md` at repo root if it exists | Read |
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, `jira.custom_fields.pn_phase` id | Read |

## Outputs

Rendered chat output only. No files are written. No Jira operations are performed. Nothing persisted between runs.

The output follows this layout:

```
=== status ===

Branch   : feature/PROJ-42
Jira key : PROJ-42

--- Jira issue ---
Summary  : <issue summary>
Status   : In Progress
PN Phase : progress
Assignee : <name>

--- Recent commits (last 10) ---
<sha> <subject>
...

--- Scratchpad ---
<contents of docs/pn/stories/PROJ-42/scratchpad.md, or "none">

--- Drift ---
<any detected drift between PN Phase and Jira status, or "none">

--- Next steps ---
<1-3 suggested skill invocations derived from current PN Phase, drift, and bootstrap state>
```

## Procedure

### 1. Read `.pn/settings.json`

Read `.pn/settings.json` at the repo root. Extract `jira.cloud_id`, `project.jira_project_key`, and the `customfield_*` id for `PN Phase`. If `.pn/settings.json` is missing or any required value is unresolved (`jira.cloud_id` or any `customfield_*` id), print a warning ("project not bootstrapped; Jira data unavailable") and continue with a degraded briefing.

### 2. Resolve the current branch and Jira key

Run `git branch --show-current`. Attempt to parse a Jira key using two patterns:

- Pattern A (preferred): `feature/PROJ-NNN`, `bugfix/PROJ-NNN`, `hotfix/PROJ-NNN` where `PROJ` is one or more uppercase letters and `NNN` is one or more digits.
- Pattern B (fallback): any branch segment that matches `[A-Z]+-[0-9]+`.

If no key can be parsed, record key as `n/a`. The briefing continues in degraded mode; the Jira and scratchpad sections display "n/a" instead of failing.

### 3. Fetch the Jira issue

If a key was parsed, call `mcp__claude_ai_Atlassian__getJiraIssue` with that key and the resolved `cloud_id`. Extract:
- `fields.summary`
- `fields.status.name`
- The `PN Phase` custom field value using the `customfield_*` id from `.pn/settings.json`
- `fields.assignee.displayName`
- `fields.reporter.displayName`
- First 300 characters of `fields.description` (for context, labelled "description excerpt")

On any MCP error, record all Jira fields as "unavailable (MCP error)" and continue.

### 4. Collect recent commits

Run `git log -10 --oneline` on the active branch. Include the output verbatim in the briefing.

### 5. Read the scratchpad

Attempt to read `docs/pn/stories/<KEY>/scratchpad.md` at the repo root. If the file exists, include its full contents. If it does not exist, write "none".

### 6. Detect drift

Compare `PN Phase` to the expected Jira status for that phase using the canonical mapping (see `.pn/settings.json` `workflow.*` if present, otherwise use the default PN light workflow):

| PN Phase | Expected Jira status |
|----------|---------------------|
| new | To Do |
| refine | To Do |
| estimate | To Do |
| approval | In Progress |
| todo | To Do |
| progress | In Progress |
| review | In Review |
| handover | In Review |
| deploy | In Progress |
| release-ready | In Progress |
| released | Done |

If the actual Jira status does not match the expected status, report "DRIFT: PN Phase is `<phase>` but Jira status is `<status>` (expected `<expected>`)". Do not resolve the drift; only report it.

### 7. Suggest next steps

Derive 1-3 suggested skill invocations from the briefing state and present them as a bulleted list. The list is advisory; it never auto-invokes anything. Selection rules, in priority order:

1. **Not bootstrapped** (`.pn/settings.json` missing or required values unresolved): suggest `/pn-qa:bootstrap-project` and stop.
2. **No Jira key parsed from branch**: suggest `/pn-qa:new-capture-idea` (if no idea-brief exists yet for this work) and `/pn-qa:refine-capture-context` (if an epic key was provided manually). Stop.
3. **Drift detected** (Step 6 reported DRIFT): suggest manual reconciliation first; recommend the user re-align Jira status or `PN Phase` before invoking any phase skill. Do not propose phase-advancing skills until drift is resolved.
4. **Phase-driven suggestions** (no drift, Jira reachable): map the current `PN Phase` to the canonical next skill(s):

   | PN Phase | Suggested next skills |
   |----------|----------------------|
   | new | `/pn-qa:refine-capture-context` |
   | refine | `/pn-qa:refine-grill-requirements`, `/pn-qa:refine-draft-epic` |
   | estimate | `/pn-qa:estimate-write-prd`, `/pn-qa:estimate-check-ticket` |
   | approval | `/pn-qa:todo-plan-phases` |
   | todo | `/pn-qa:progress-implement` |
   | progress | `/pn-qa:progress-implement` (continue), `/pn-qa:review-pr` (after push) |
   | review | `/pn-qa:review-pr`, `/pn-qa:review-evaluate-code` |
   | handover | `/pn-qa:handover-release-notes`, `/pn-qa:handover-gate` |
   | deploy | `/pn-qa:release-readiness-gate` |
   | release-ready | `/pn-qa:release-readiness-gate` |
   | released | (none; story is done) |

5. **Scratchpad signals**: if the scratchpad contains an "Open questions" or "Blockers" section with non-empty bullets, prepend `/pn-qa:refine-grill-requirements` to the suggestions regardless of phase.

Each suggestion line has the form `- /<skill_name> -- <one-line rationale tied to current state>`. Keep the rationale short; cite the phase or the artefact that triggered the suggestion.

If `PN Phase` is unavailable (MCP error or no key), fall back to a generic suggestion based on branch name and presence of `docs/pn/` artefacts. If nothing applies, print "no suggestions; status has no signal to act on".

### 8. Render the briefing

Compose the output layout described in the Outputs section, including the "Next steps" section produced in Step 7. Print it to chat. Exit cleanly.

## Edge cases

- **Detached HEAD:** `git branch --show-current` returns empty. Display branch as "(detached HEAD)"; attempt pattern B on `git rev-parse --abbrev-ref HEAD`. If still empty, degrade to no-key mode.
- **Shallow clone:** `git log -10` may return fewer commits. Include what is available; do not error.
- **Multiple keys in branch name:** Use the first matched key only.
- **Scratchpad directory exists but file is empty:** Display "scratchpad exists but is empty".
- **MCP unavailable (no Atlassian MCP configured):** Skip the Jira fetch section entirely; display "Jira unavailable (MCP not configured)".

## Idempotency notes

This skill has no persistent state. Running it multiple times in a row produces the same output (given unchanged branch, commits, and Jira state) and never accumulates side effects.
