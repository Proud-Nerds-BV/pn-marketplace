---
name: bootstrap-project
description: Bootstraps a Proud Nerds project for the pn-skills toolkit. Produces .pn/settings.json (shared, committed), seeds CLAUDE.md with PN conventions, discovers the six global Jira custom fields by name and records their customfield_* IDs, validates the shared PN light workflow, verifies Atlassian MCP reachability via the claude.ai Atlassian add-on (no per-project .mcp.json is written), seeds the code-knowledge layer at .pn/index/index.sqlite when sqlite3 is available, scaffolds docs/pn/, and writes docs/pn/desktop-onboarding.md for the PO. Hook wiring is owned by the plugin install (the marketplace ships hooks/hooks.json); bootstrap does not touch .claude/settings.json. Idempotent on re-run; prompts only on genuine conflicts. Use when the user says /pn-qa:bootstrap-project, runs bootstrap on a fresh repo, or asks to set up pn-skills in a new project.
allowed-tools: Read, Write, Edit, Bash
---

# bootstrap-project

Initialises a project to use the Proud Nerds skill-set. This is a hard prerequisite: every other `pn_*` skill refuses to run until `.pn/settings.json` exists with all required values resolved (see the "Is the project bootstrapped?" predicate below).

This skill is the entry point for setting up `.pn/settings.json`, the `CLAUDE.md` pn-skills seed, the code-knowledge layer at `.pn/index/`, and the PO onboarding doc in a consuming project. Hook wiring is owned by the `pn-skills` plugin install (the marketplace ships `hooks/hooks.json`); bootstrap does not touch `.claude/settings.json`. Atlassian MCP access is assumed to be provided by the claude.ai Atlassian add-on at the user-account level; bootstrap does not write a per-project `.mcp.json`.

## When to run

- Fresh repo where pn-skills is being adopted.
- Existing repo where pn-skills is being reinstalled or re-aligned with a new Jira instance, new PR platform, or new language setting.
- Any time `.pn/settings.json` is missing or its `version` is behind the current skill-set's expected schema.

## Procedure

The procedure is a single skill invocation. Every step is idempotent: detect, then only prompt or write on genuine conflict.

### 0. Preconditions

1. Confirm the working directory is a git repository (`git rev-parse --is-inside-work-tree`). If not, abort with a remediation message: run `git init` first.
2. Confirm `git config user.name` returns a non-empty value. This is the canonical authorship attribution for every artefact bootstrap produces (no "Claude", no AI tool name).
3. Confirm `node` is on the PATH (`node --version` returns 18 or higher). The pn-skills hooks are Node ESM scripts and run on every platform that has Node. If absent, abort with: install Node 18+ and re-run.

### 1. Detect framework

Walk the repo root for a single signal:

- `composer.json` containing `laravel/framework` -> `laravel`.
- `composer.json` containing `typo3/cms-core` -> `typo3`.
- `wp-config.php` at repo root or `composer.json` referencing `johnpbloch/wordpress-core` -> `wordpress`.
- `package.json` only, no `composer.json` -> `node`.
- Nothing matches -> `unknown`.

Record into `.pn/settings.json` as `project.framework`.

### 2. Detect PR platform

Run `git remote get-url origin` (or first remote). Map the URL host:

- `bitbucket.org` -> `bitbucket`.
- `github.com` -> `github`.
- `dev.azure.com` or `*.visualstudio.com` -> `azure-devops`.

If no remote, or the host is unrecognised, prompt the user **once** for the platform. Persist the answer; subsequent runs do not re-prompt unless the user requests a change.

### 3. Verify Atlassian MCP reachability

Before writing any Jira-coupled config, perform one round-trip Atlassian MCP call (any read-only call; `getAccessibleAtlassianResources` is the minimal probe). The PN team uses the company-wide Atlassian add-on from claude.ai, so the MCP server is provisioned at the user-account level; bootstrap does not install a per-project `.mcp.json` entry. If the probe fails:

1. Abort the bootstrap before writing `.pn/settings.json`.
2. Surface the remediation: enable the **Atlassian** add-on under `claude.ai -> Settings -> Connectors` for the user's account and complete the OAuth flow. A per-project `.mcp.json` is not required and bootstrap does not write one.

### 4. Resolve Jira project key and cloud id

Prompt the user for the Jira project key in the form `ABC` (or read it from an existing `.pn/settings.json`). Then call `getAccessibleAtlassianResources` and select the cloud id that exposes that project. Record both into `.pn/settings.json` under `project.jira_project_key` and `jira.cloud_id`.

### 5. Record the six global PN custom fields

The PN custom fields are provisioned company-wide on the Proud Nerds Jira instance and carry stable IDs across every project. Hard-code them into `.pn/settings.json` under `jira.custom_fields` without any discovery round-trip:

| Key                    | Name                  | ID                  | Type                                                                                                          |
|------------------------|-----------------------|---------------------|---------------------------------------------------------------------------------------------------------------|
| `pn_phase`             | `PN Phase`            | `customfield_12294` | single-select; allowed: `new`, `refine`, `estimate`, `approval`, `todo`, `progress`, `review`, `handover`, `deploy`, `release-ready`, `released` |
| `pn_actor`             | `PN Actor`            | `customfield_12295` | single-select; allowed: `AI`, `Human`, `Joint`                                                                |
| `acceptance_criteria`  | `Acceptance Criteria` | `customfield_12288` | multi-line text                                                                                               |
| `expected_scope`       | `Expected Scope`      | `customfield_12289` | multi-line text                                                                                               |
| `validation_passed`    | `Validation Passed`   | `customfield_12293` | single-select; allowed: `Yes`, `No` (empty = not yet evaluated)                                               |
| `handover_passed`      | `Handover Passed`     | `customfield_12292` | single-select; allowed: `Yes`, `No` (empty = not yet evaluated)                                               |

No discovery, no prompts, no Jira round-trip for IDs. The values above are the source of truth. If a future Jira reorg invalidates them, update this table and ship a new pn-skills release; do not introduce per-project discovery.

On re-run, follow the merge rules in "Idempotency invariants" below.

### 6. Validate the shared PN light workflow

The canonical workflow is six statuses: `To Do`, `In Progress`, `In Review`, `Waiting for customer`, `Waiting for third party`, `Done`.

The claude.ai Atlassian MCP does not expose `/rest/api/3/workflow`, and bootstrap does not perform Jira round-trips beyond `getAccessibleAtlassianResources`. Record `workflow.divergent = "unknown"` and leave `workflow.statuses_observed` empty. Consumer skills accrue evidence at runtime as they encounter statuses; the value is updated best-effort from observed status names and never flips to `false` from a single data point.

Never abort on this step.

### 7. Write `.pn/settings.json`

Render `templates/pn.json.template` with the values resolved above. Pretty-print with two-space indent.

On re-run: read the existing `.pn/settings.json`, merge non-destructively, and prompt **only** on values the user has explicitly attempted to change (e.g., flipping `pr.platform` from `github` to `bitbucket`). Otherwise keep existing values.

Default values (only applied when the key is absent):

- `language.output = "en"`, `language.jira = "en"`.
- `hooks.enabled = true`, `hooks.mode = "warn"` (later flipped to `block` per skill or per repo policy).
- `code_knowledge.path = ".pn/index/"`, `code_knowledge.format = "sqlite"`.
- `tests.runner` derived from framework (`pest` for Laravel/WordPress with PHP, `vitest` or `jest` for node; otherwise empty and recorded as a one-time admin task to fill in).
- `release.version_location = "release-issue"`.

### 8. Seed `CLAUDE.md`

Append (or write fresh) the contents of `templates/claude-md.seed.md` to the repo root `CLAUDE.md`. Preserve any pre-existing content above the inserted block. The block is fenced by clearly marked begin/end comments so re-runs replace only the bootstrap-managed region.

### 9. Skip `.mcp.json` (claude.ai Atlassian add-on)

Bootstrap does not write `.mcp.json`. The PN team uses the **claude.ai Atlassian add-on** which provisions the MCP server at the user-account level; a per-project `.mcp.json` would duplicate and override it. If `.mcp.json` already exists in the repo from a previous bootstrap, leave it untouched (the user can remove it manually); never overwrite an unrelated `.mcp.json` that the project uses for non-Atlassian MCP servers.

### 10. Hooks are owned by the plugin install

The `pn-skills` plugin ships its own `hooks/hooks.json` referencing `${CLAUDE_PLUGIN_ROOT}/hooks/pn/*.mjs`. Claude Code wires those hooks for every project as soon as the plugin is installed via the marketplace; bootstrap does not touch `.claude/settings.json` or `.claude/settings.local.json`. The expected installation flow is documented in `INSTALLATION.md`; if the user reports that hooks are not firing, point them at the plugin install steps, not at per-project hook wiring.

### 11. Install `.pn/.gitignore`

Copy `templates/pn-dotgitignore.template` to `.pn/.gitignore`. This commits `.pn/settings.json` as shared project config while ignoring generated artefacts (`index/`, `*.sqlite`, cache). Do not add a `.pn/` blanket rule to the repo-root `.gitignore`; that would hide the shared config from teammates. Idempotent: skip if `.pn/.gitignore` already exists with the expected contents.

### 12. Seed the code-knowledge layer

If `sqlite3` is on the PATH:

1. Create `.pn/index/`.
2. Initialise the SQLite database at `.pn/index/index.sqlite` by piping `templates/code-knowledge-schema.sql` into `sqlite3`.
3. Walk the repo tree (respecting `.gitignore`) and insert one row per source file into `files` (path, lang inferred from extension, sha256, size_bytes, mtime). Leave `summaries`, `imports`, and `exports` empty; `index-on-write` and `update-docs` populate them later.
4. Write a `schema_meta` row with `schema_version = 1` and `last_full_seed_at = now()`.

If `sqlite3` is not on the PATH: skip the seed but surface a one-line remediation in the final summary (`brew install sqlite` on macOS; `dnf install sqlite` / `apt install sqlite3` on Linux; choco/winget equivalent on Windows). Do not record a flag in `.pn/settings.json`. `index-on-write` probes for the database (`.pn/index/index.sqlite` present and contains a `schema_meta` row) on every write event and seeds on demand. The layer is self-healing once `sqlite3` is installed.

### 13. Scaffold `docs/pn/` skeleton

Create the directory tree from `templates/docs-pn-skeleton.txt`. Each directory gets a `.gitkeep` so the structure ships even when empty. Idempotent: skip directories that already exist.

### 14. Write `docs/pn/desktop-onboarding.md`

Render `templates/desktop-onboarding.md.template` into `docs/pn/desktop-onboarding.md`. The output is Dutch, per the convention that PO-facing artefacts are in Dutch (per `handover-release-notes`). On re-run, regenerate only when the template version is newer than the existing file's recorded template version.

### 15. Print summary

Print a one-line success summary listing the resolved customfield ids, the platform, the PR platform, and the code-knowledge layer location.

## "Is the project bootstrapped?" predicate

`.pn/settings.json` carries no `status` flag. Consumer skills derive bootstrap-completeness from resolved values:

- `.pn/settings.json` exists at the repo root.
- `jira.cloud_id` is non-empty and not a placeholder.
- `project.jira_project_key` is non-empty and not a placeholder.
- All six `jira.custom_fields.*.id` values are non-empty and match the canonical company-wide IDs listed in step 5 (no `customfield_XXXXX` placeholder, no stray legacy IDs).

If all of the above hold, the project is bootstrapped. If not, consumer skills abort with: "Project not fully bootstrapped; run `/pn-qa:bootstrap-project`."

The code-knowledge layer is treated separately: skills that need it probe `.pn/index/index.sqlite` directly (file present and `schema_meta` row exists). If absent, the consumer skill either triggers a re-seed (when `sqlite3` is available) or degrades gracefully. No `seeded` flag is persisted.

## Idempotency invariants

- Re-running on a complete bootstrap exits cleanly with "already bootstrapped; refreshing Jira customfield ids" and updates only `jira.custom_fields`.
- Custom-field merge rules on re-run: the canonical company-wide IDs (step 5) are written verbatim. Any pre-existing value that already matches is a no-op; any stray legacy or placeholder value is overwritten without prompting. The IDs are fixed company-wide, so there is nothing to negotiate.
- Hook entries are deduplicated by `(event, matcher, command)`.
- `.pn/.gitignore` is written only if absent.
- `docs/pn/` directories are created only if absent.
- `CLAUDE.md` is merged, never overwritten wholesale; existing user content outside the fenced pn-skills block is preserved.

## Failure modes and degradation

- Atlassian MCP unreachable: abort before any write. The user fixes the MCP entry and re-runs.
- Workflow validation: recorded as `unknown` and updated at runtime by consumer skills; never aborts.
- `sqlite3` missing: skip the seed but surface the install hint in the summary. `index-on-write` and consumer skills probe for `.pn/index/index.sqlite` on demand and seed once `sqlite3` is installed.

## Hard rules

- No emdashes in any generated artefact.
- Authorship in artefacts is `git config user.name`; never "Claude", "ANVIL", or any tool name.
- Bootstrap writes only inside the working tree (and the Jira project named in `.pn/settings.json`). No global Claude config mutation. No writes outside the repo.
- Hook wiring is owned by the plugin install (`hooks/hooks.json` inside the `pn-skills` plugin). Bootstrap does not write to `.claude/settings.json` or `.claude/settings.local.json`.
