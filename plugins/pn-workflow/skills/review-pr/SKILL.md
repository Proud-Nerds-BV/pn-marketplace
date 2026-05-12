---
name: review-pr
description: Peer-reviews a pull request on Bitbucket Cloud, GitHub, or Azure DevOps Repos (autodetected from `.pn/settings.json` then `git remote get-url origin`; persists the choice to `.pn/settings.json` as `pr.platform`). Posts inline comments anchored to specific files and lines, checks PN hard rules (no inline styles, no inline JS, no `<script>` in HTML, no pixel units in SCSS, no emdashes, English-only, no jQuery in non-jQuery projects), compares the PR diff to the story's `blast-radius.md` and `Acceptance Criteria`, and writes a single scope-drift verdict comment. Refuses with zero writes when the PR author email matches `git config user.email`. Re-runnable per push: resolved comments stay resolved, unresolved findings persist. Does not mutate `PN Phase`. Trigger when the user runs `/pn-workflow:review-pr`, asks to "review the PR", "peer review this push", "check the diff against AC", or after a push to a feature / bugfix / hotfix branch.
allowed-tools: Read, Bash, Edit, Grep, Glob, mcp__claude_ai_Atlassian__getJiraIssue
---

# review-pr

Peer-reviews the pull request associated with the current feature, bugfix, or hotfix branch. Autodetects the host platform, refuses if the PR author equals the active git user, fetches the diff, checks PN hard rules and acceptance-criteria scope drift against the story's `blast-radius.md`, posts inline comments anchored to specific lines, and writes a single scope-drift verdict comment. The skill never mutates `PN Phase` or Jira status; review-phase transitions are handled by `review-evaluate-code` and the handover gate.

## When to use

- After a push to `feature/*`, `bugfix/*`, or `hotfix/*` when a PR exists.
- Re-running on a subsequent push to the same PR (resolved comments stay resolved; unresolved findings persist).
- During a code-review pairing session where the reviewer wants a checklist-pass over the diff.

## When not to use

- The current branch has no open PR; refuse with a route to open one.
- The branch has multiple open PRs; refuse and ask the user which PR to target.
- The PR author email equals `git config user.email`; hard refusal with zero writes.
- The story's `Expected Scope` field is empty; degrade to PN-hard-rules-only review with a warning, but do not refuse outright.

## Inputs

| Source | What is read | How |
|--------|-------------|-----|
| `.pn/settings.json` | `pr.platform` (one of `bitbucket`, `github`, `azure-devops`); written on first run if unset | Read |
| Git remote | `git remote get-url origin` | Bash |
| Current branch | `git branch --show-current` | Bash |
| Jira story | Story key parsed from branch name; reads `Acceptance Criteria`, `Expected Scope`, `PN Phase`, Jira status | `mcp__claude_ai_Atlassian__getJiraIssue` |
| Story scratchpad | `docs/pn/stories/<KEY>/blast-radius.md` for scope-drift comparison | Read |
| PR diff + metadata | Author, title, files changed, line-level diff, prior comments | Platform CLI / REST (see below) |

## Platform autodetect

1. Read `.pn/settings.json`. If `pr.platform` is set, use it.
2. Else parse `git remote get-url origin`:
   - Matches `bitbucket.org` -> `bitbucket`.
   - Matches `github.com` -> `github`.
   - Matches `dev.azure.com` or `visualstudio.com` -> `azure-devops`.
3. If neither resolves, ask the user once; persist the answer to `.pn/settings.json` under `pr.platform`.
4. Verify the platform CLI is installed (`gh` for GitHub, `az` for Azure DevOps; Bitbucket uses raw REST via `curl` + an app password from `~/.netrc` or the `BITBUCKET_TOKEN` env var). If missing, refuse with a clear install command.

## Procedure

1. **Platform + branch resolution.** Detect platform; resolve current branch; parse the Jira key.
2. **PR discovery.** List open PRs from the current branch:
   - GitHub: `gh pr view --json author,number,title,headRefName,baseRefName,url,reviewDecision`.
   - Azure DevOps: `az repos pr list --source-branch <branch> --status active --output json`.
   - Bitbucket: `GET /2.0/repositories/<workspace>/<repo>/pullrequests?q=source.branch.name="<branch>"&state=OPEN`.
   - Zero PRs: refuse. More than one: refuse and list them.
3. **Author equality check.** Compare the PR author email/handle to `git config user.email`. On match, refuse and exit with zero writes.
4. **Story read.** Read the Jira story (read-before-write contract); capture `Acceptance Criteria`, `Expected Scope`, `PN Phase`, Jira status. Cite both in the exit summary.
5. **Diff fetch.** Fetch the PR's file-by-file unified diff:
   - GitHub: `gh pr diff <number>`.
   - Azure DevOps: `az repos pr show --id <id> --query 'lastMergeSourceCommit'` + `az repos diff` or REST.
   - Bitbucket: `GET /2.0/repositories/<workspace>/<repo>/pullrequests/<id>/diff`.
6. **PN hard-rules pass.** For each hunk, scan for and flag (one inline comment per violation, anchored to the exact line):
   - Inline styles (`style="..."`).
   - Inline JavaScript (`onclick="..."`, `on*=` handlers).
   - `<script>` tags in HTML.
   - Pixel units in SCSS (`\b\d+px\b` outside comments).
   - Emdashes (`;`).
   - Non-English identifiers or comments (heuristic: non-ASCII letter runs outside string literals).
   - jQuery usage (`$(`, `jQuery(`) in projects without jQuery in `composer.json` / `package.json`.
   - Procedural PHP that should be OOP (top-level statements outside a class in `.php` files that are not entrypoints).
7. **Scope-drift pass.** Build the set of files actually touched by the PR. Compare to the union of files listed in `docs/pn/stories/<KEY>/blast-radius.md`. Compute:
   - **In-scope:** in both sets.
   - **Unexpected:** in PR diff, not in blast-radius.
   - **Missing:** in blast-radius, not in PR diff.
   Compare the PR contents to each `Acceptance Criterion`: AC met / partial / missing.
8. **Post inline comments.** For each hard-rule violation, post one inline comment via the platform API anchored to `(file, line)`. Use the prior-comments list (step 2 extension) to skip lines where an unresolved comment already exists for the same rule (idempotency on re-runs).
9. **Post scope-drift verdict.** Post a single summary comment on the PR with:
   - Verdict: `clean`, `minor drift`, or `major drift`.
   - Unexpected files (count + list).
   - Missing files (count + list).
   - AC status table (met / partial / missing per AC).
   - Hard-rule violations grouped by rule.
10. **Exit summary.** Print to chat: PR url, author, reviewer (active git user), platform, hard-rule count, scope-drift verdict, `PN Phase` and Jira status read in step 4, and any drift between them.

## Edge cases

- **No PR for branch:** refuse; suggest opening one. Zero writes.
- **Multiple PRs for branch:** refuse; list them with urls; ask which to target.
- **Platform CLI not installed:** refuse; print the install command for the detected platform.
- **Author == reviewer:** refuse with zero writes (PR, Jira, repo).
- **Empty `Expected Scope`:** degrade to hard-rules-only; warn in the verdict comment; do not refuse.
- **Missing `blast-radius.md`:** degrade scope-drift to AC-only (compare diff against AC alone); flag the missing file in the verdict.
- **`PN Phase` already past `review`:** post comments but flag the drift in the exit summary; do not mutate phase or status.
- **Re-run on same push:** dedupe inline comments by `(file, line, rule)`; do not repost resolved comments.

## `pn_phase` transitions

None. This skill never mutates `PN Phase` or Jira status. Drift between the two is reported in the exit summary.
