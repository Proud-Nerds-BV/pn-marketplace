---
name: security-audit
description: Runs an OWASP-aligned security audit on the repository and produces a CWE-tagged findings report at docs/pn/findings/security-<DATE>.md. Trigger when the user runs /pn-qa:security-audit, asks to "audit security", "check for vulnerabilities", "run a security scan", or "find CWE issues". Accepts --delta (default; since last release tag) or --full mode and an optional --cwe-filter. Creates or reuses a security epic in Jira with one child task per new finding; deduplicates against prior reports. New tasks enter the normal refinement loop at PN Phase = new.
allowed-tools: Bash, Read, Write, Edit, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__editJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__search
---

# security-audit

Performs a structured, OWASP-aligned security audit of the repository. It reads source code and git history, identifies potential vulnerabilities, tags each finding with CWE identifiers and OWASP categories, deduplicates against previous reports, persists findings to `docs/pn/findings/security-<DATE>.md`, and creates or updates a Jira security epic with one child task per new finding. The Jira tasks carry `PN Phase = new` so they enter the normal `refine_*` loop without a separate security-only workflow.

## When to use

- At the end of each sprint (QA/Sec role).
- Before a release branch is cut.
- On-pain: when a suspected vulnerability is reported or a dependency patch is available.
- After a significant refactor that touches authentication, data persistence, or external integrations.

## When not to use

- As a substitute for a dedicated SAST tool integrated in CI/CD. This skill produces findings that require human review; it does not replace automated pipeline scanners.
- During active development on a half-implemented feature; the delta scope will include incomplete code that inflates false positives.

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--delta` | yes (default) | Audit only files changed since the previous release tag (`git describe --tags --abbrev=0`). Falls back to full if no tag exists. |
| `--full` | no | Audit all source files in the working tree. |
| `--cwe-filter=CWE-89,CWE-79,...` | none | Restrict output to the listed CWE identifiers. Comma-separated; no spaces. |

## Inputs

| Source | What is read | Tool |
|--------|-------------|------|
| Git working tree | Changed files since last tag (`git diff <tag>..HEAD --name-only`) or all files | Bash |
| Source files | File contents for review | Read |
| Code-knowledge layer | Per-module summaries at `.pn/index/index.sqlite`; used to prioritise review order | Read (sqlite3 query via Bash) |
| Prior reports | All `docs/pn/findings/security-*.md` files (for deduplication) | Read |
| `.pn/settings.json` | `jira.cloud_id`, `project.jira_project_key`, `jira.custom_fields.*` ids, `language.*` | Read |
| Jira | Open security epic query: issues with type Epic and label `pn-security` in the project | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` |

## Outputs

| Output | Path | Description |
|--------|------|-------------|
| Security report | `docs/pn/findings/security-<YYYY-MM-DD>.md` | One markdown report per run; numeric suffix (`-2`, `-3`) if same-date re-run |
| Jira security epic | Created or reused; labelled `pn-security` | One epic per project; not per run |
| Jira child tasks | One per new finding under the security epic | Carry CWE id in label and link to the report file |

## Report schema

Each finding in `docs/pn/findings/security-<DATE>.md` carries these fields:

```yaml
- title: <short title>
  severity: Critical | High | Medium | Low | Info
  cwe: CWE-NNN
  owasp: A01:2021 | A02:2021 | ... (OWASP Top 10 2021 category)
  location: <file>:<start_line>-<end_line>
  evidence: <code excerpt or description, max 200 chars>
  recommendation: <remediation guidance>
  status: new | carried-over | resolved
```

The report frontmatter links to PRD-007 and PLAN-001:

```yaml
---
prd: PRD-007
plan: PLAN-001
author: <git config user.name>
date: <YYYY-MM-DD>
mode: delta | full
scope_tag: <previous release tag, or "none">
---
```

## Procedure

### 1. Read `.pn/settings.json`

Read `.pn/settings.json`. Extract `jira.cloud_id`, `project.jira_project_key`, and all `customfield_*` ids (especially `pn_phase`). Confirm `jira.cloud_id` is set and required `customfield_*` ids are populated (no `customfield_XXXXX` placeholders). If not bootstrapped, abort with a remediation message.

### 2. Determine audit scope

Parse the `--delta` / `--full` argument. For `--delta`, run `git describe --tags --abbrev=0` to get the most recent release tag. If no tag exists, log "no release tag found; falling back to full scan" and treat as `--full`. Run `git diff <tag>..HEAD --name-only` to collect the changed file list. For `--full`, collect all source files respecting `.gitignore` (use `git ls-files`). Filter to code file extensions: `.php`, `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.rb`, `.java`, `.go`, `.cs`, `.sh`. If `--cwe-filter` is set, note it for post-processing.

### 3. Load prior findings for deduplication

Read all existing `docs/pn/findings/security-*.md` files. For each finding, extract the deduplication key: `(cwe, location, normalised_title)` where `normalised_title` is the title lowercased with punctuation stripped. Store in a deduplication set.

### 4. Perform the audit

For each file in scope, read its contents and analyse for the following OWASP Top 10 2021 categories at minimum:

- **A01 Broken Access Control:** missing authorisation checks, path traversal, privilege escalation patterns.
- **A02 Cryptographic Failures:** weak algorithms (`md5`, `sha1` without salt, hardcoded keys), plaintext secrets.
- **A03 Injection:** SQL, command, LDAP, XPath injection vectors; template injection; unsafe `eval`.
- **A05 Security Misconfiguration:** debug flags left on, default credentials, overly permissive CORS.
- **A06 Vulnerable and Outdated Components:** lockfile dependency versions against known CVEs (surface what is readable; do not call external APIs).
- **A07 Identification and Authentication Failures:** missing session expiry, weak password policies surfaced in code.
- **A08 Software and Data Integrity Failures:** missing integrity checks on serialised data, unsafe deserialization.
- **A09 Security Logging and Monitoring Failures:** missing try/catch around sensitive operations, swallowed exceptions.
- **A10 Server-Side Request Forgery:** unvalidated URLs passed to HTTP client calls.

For each finding, assign severity according to CVSS base score range: Critical (9.0-10.0), High (7.0-8.9), Medium (4.0-6.9), Low (0.1-3.9), Info (0.0).

Assign the most specific CWE identifier that applies. If `--cwe-filter` is set, discard findings whose CWE is not in the filter list.

### 5. Deduplicate findings

For each new finding, compute its deduplication key. If the key exists in the set from Step 3, mark the finding `status: carried-over`; do not create a new Jira task for it. Only findings with `status: new` proceed to Jira creation.

### 6. Write the report

Determine the output filename: `docs/pn/findings/security-<YYYY-MM-DD>.md`. If that file already exists, append `-2`, `-3`, etc. until a free name is found. Write the full report with frontmatter and all findings (both `new` and `carried-over`). Create the `docs/pn/findings/` directory if absent.

### 7. Find or create the security epic in Jira

Query Jira: issues with `type = Epic AND labels = pn-security AND project = <project_key> AND statusCategory != Done`. If exactly one open epic is found, use it. If none is found, create one:

- Summary: `Security findings ; <project_key>`
- Type: Epic
- Labels: `pn-security`
- `PN Phase`: `new`
- Description: "Umbrella epic for CWE-tagged security findings produced by security-audit. Do not close until all child tasks are resolved."

If multiple open epics are found, use the most recently created one and log a warning to chat ("multiple open security epics found; using the most recent").

### 8. Create Jira child tasks for new findings

For each finding with `status: new`, create one Jira task under the security epic:

- Summary: `[<CWE>] <finding title>`
- Type: Task (or Sub-task if the Jira project requires it)
- Parent: the security epic key
- Labels: `<CWE>`, `pn-security`
- `PN Phase`: `new`
- Description: formatted markdown block with severity, OWASP category, location, evidence, recommendation, and a link to the report file path.

### 9. Summarise to chat

Print a summary:

```
=== security-audit complete ===

Mode     : delta | full
Scope    : <N> files reviewed
New      : <N> findings (Critical: N, High: N, Medium: N, Low: N, Info: N)
Carried  : <N> findings (already in prior reports)
Report   : docs/pn/findings/security-<DATE>.md
Epic     : <EPIC-KEY> (<created|reused>)
Tasks    : <N> new Jira tasks created
```

## Edge cases

- **No changed files in delta mode:** Print "no files in delta scope; nothing to audit" and exit cleanly without writing a report or touching Jira.
- **No release tag:** Fall back to full mode with a logged notice.
- **Jira MCP unavailable:** Write the report file but skip all Jira steps. Log "Jira unavailable; report written locally only".
- **Same-date re-run:** Append numeric suffix to filename; do not overwrite. The prior run's findings remain unchanged on disk.
- **All findings are carried-over:** Write a report with all findings marked `carried-over`; do not create a new epic or tasks. Print "no new findings; report written as a snapshot".

## Idempotency notes

- Re-running with `--delta` on an unchanged codebase since last run will produce a report with all findings `carried-over` and no new Jira tasks.
- The security epic is reused across runs; one task is created per unique finding only once.
- The filename suffix scheme (`-2`, `-3`) ensures no prior report is ever overwritten.
