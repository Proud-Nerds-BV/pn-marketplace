---
name: refine-grill-requirements
description: Stress-tests the assumptions in an idea-brief by running structured brainstorm rounds with the user (PO, DEV, optionally Designer). Records each round as a Jira epic comment once an epic exists, or appends rounds to the originating idea-brief while still pre-Jira. Stops automatically when a round produces no new insights or the user signals done. Use when the user invokes /pn-workflow:refine-grill-requirements, asks to grill or stress-test an idea, or wants to run a requirements brainstorm session on an existing idea-brief or Jira epic.
allowed-tools: Read, Write, Edit, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, Bash
---

# refine-grill-requirements

Runs structured brainstorm rounds to stress-test the assumptions in an idea-brief or Jira epic. Each round produces a set of targeted questions, captures the team's answers, and identifies net-new acceptance criteria or risks. The loop stops on a "no-new-insights" signal.

`pn_phase` value: `refine`

## When to use

- An idea-brief at `docs/pn/ideas/<slug>.md` exists and the team is ready to pressure-test assumptions before creating a Jira epic.
- A Jira epic is in `pn_phase = refine` and grill rounds have not yet converged.
- The team wants to add a grill round to an already-started epic.

## When not to use

- `pn_phase` on the epic is `estimate` or later; refinement is closed. Use `estimate-check-ticket` for late-stage validation.
- No idea-brief or epic key is provided; capture the idea first with `new-capture-idea`.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Epic key (e.g. `ABC-42`) or idea-brief slug | Argument or user message | One of the two is required |
| Participating roles | Declared by user at invocation (PO, DEV, Designer) | Yes; a round with only one role is flagged |
| Round content (answers to questions) | User message during loop | Yes |

## Outputs

| Artefact | Path / Location | Description |
|----------|-----------------|-------------|
| Grill round records | Jira epic comment (when epic exists) or appended section in `docs/pn/ideas/<slug>.md` | One comment / appended section per completed round |

## Procedure

### 0. Preconditions

1. Read `.pn/settings.json` and confirm `jira.cloud_id` is set and required `customfield_*` ids are populated. If absent or unresolved, abort with: run `bootstrap-project` first.
2. If an epic key is provided: call `getJiraIssue` to fetch the epic. Verify `PN Phase` is `refine` (or `new` if no rounds have run yet and the epic was just created). If `pn_phase` is `estimate` or later, refuse to run and report the current phase.
3. If only a slug is provided: read `docs/pn/ideas/<slug>.md`. No Jira call needed.
4. Read existing round history (from Jira comments or idea-brief sections) to avoid re-asking questions already answered.

### 1. Declare participating roles

Ask the user which roles are present if not already declared:
- `PO` ; required.
- `DEV` ; recommended; flag as missing if absent.
- `Designer` ; optional.

A round with only one role is recorded but flagged as `roles: incomplete` in its header.

### 2. Run a grill round

Each round has four steps:

1. **Analyse** ; Review the idea-brief / epic description and all previous round records. Identify the 3-5 highest-value unresolved assumptions or risks.
2. **Question** ; Present a numbered list of targeted questions. Each question must be specific, testable, and map to a single assumption. No open-ended "anything else?" questions.
3. **Capture answers** ; Wait for the user's answers. Record them verbatim under the relevant question.
4. **Extract delta** ; Identify net-new acceptance criteria, risks, or open questions surfaced by the answers. Count them. If the delta is zero, proceed to the stop check in step 3.

### 3. Stop condition check

After each round, evaluate:

- **User signal**: User says "done", "no more", "stop", "converged", or equivalent.
- **Two consecutive zero-delta rounds**: The last two rounds each produced zero new acceptance criteria, risks, or open questions.

If either condition is met, proceed to step 5. Otherwise, loop back to step 2.

### 4. Record the round

**When an epic exists (Jira path):**

Post a Jira comment to the epic via `addCommentToJiraIssue` with the following structure:

```
--- Grill Round <N> | <YYYY-MM-DD> | Roles: <PO, DEV, ...> ---

Questions asked:
1. <question text>
   Answer: <answer text>
2. ...

Net-new insights:
- <insight or AC delta>
- ...

Status: <converged | in-progress>
```

**When pre-Jira (idea-brief path):**

Append to `docs/pn/ideas/<slug>.md` under a `## Grill Rounds` section (create section on first append):

```markdown
### Round <N> ; <YYYY-MM-DD> ; Roles: <PO, DEV, ...>

**Questions asked:**
1. <question text>
   **Answer:** <answer text>

**Net-new insights:**
- <insight or AC delta>

**Status:** <converged | in-progress>
```

### 5. Convergence summary

When the loop ends, post a final Jira comment (or append a final idea-brief section) recording:

- Total rounds run.
- Round number in which convergence was reached.
- Consolidated list of all net-new acceptance criteria.
- Consolidated list of all open questions still unresolved.
- Recommended next skill: `refine-capture-context`.

## Edge cases

- **Atlassian MCP unavailable**: if an epic key was provided but the MCP call fails, degrade to appending rounds to the idea-brief and note MCP was unavailable. Proceed; do not abort.
- **`pn_phase` has been manually advanced past `refine`**: detect via `getJiraIssue`, refuse to add rounds, and report the current phase with a suggestion to use the appropriate skill.
- **Single-role round**: record the round but add `WARNING: single-role round; validate with full team before proceeding` to the round record.
- **Duplicate epic key and slug supplied**: prefer the epic key; use the Jira comment path.
- **Epic key provided but epic is not found**: abort with the key and a hint to check the Jira project key in `.pn/settings.json`.

## Idempotency

Re-running the skill on the same epic re-reads the existing round history and continues from where it left off. It does not re-ask questions already answered. If convergence was already recorded, the skill reports that and exits cleanly.

## `pn_phase` transitions

| Transition | When | Jira status change |
|------------|------|--------------------|
| none | This skill does not mutate `pn_phase`; it only records rounds | none |

Note: `pn_phase` is set to `refine` by `refine-draft-epic` (or by the team manually on the epic). This skill reads but does not write that field.
