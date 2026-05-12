# Changelog

All notable changes to pn-skills are documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [0.4.2] - 2026-05-12

### Changed
- **`bootstrap-project` hard-codes the six PN custom field IDs.** The PN custom fields are provisioned company-wide on the Proud Nerds Jira instance with stable IDs (`PN Phase = customfield_12294`, `PN Actor = customfield_12295`, `Acceptance Criteria = customfield_12288`, `Expected Scope = customfield_12289`, `Validation Passed = customfield_12293`, `Handover Passed = customfield_12292`). Bootstrap writes these directly into `.pn/settings.json` and the `settings.json.template` ships them, so there is no per-project discovery round-trip and no risk of placeholder fall-through. Earlier releases (including 0.4.0) attempted discovery via `getJiraIssueTypeMetaWithFields` (Create-screen only; PN fields live on the View/Edit scheme), which forced manual ID entry on every fresh bootstrap.
- **Workflow validation downgraded to `"unknown"` at bootstrap time.** The claude.ai Atlassian MCP does not expose `/rest/api/3/workflow`, so a single round-trip cannot prove divergence either way. `workflow.divergent` now ships as `"unknown"` and consumer skills accrue evidence from observed status names at runtime.

### Fixed
- **`sqlite3` missing now surfaces an install hint** in the bootstrap summary (`brew install sqlite` / `dnf install sqlite` / `apt install sqlite3`) instead of skipping silently.

## [0.4.1] - 2026-05-12

### Fixed
- **`bootstrap-project` custom-field discovery no longer falls back to placeholder IDs on real Jira instances.** Previous releases used `getJiraIssueTypeMetaWithFields` (Create-screen only; PN fields live on the View/Edit scheme) and relied on the `names`/`schema` expansions in `getJiraIssue` (stripped by the claude.ai Atlassian MCP), which forced the user to manually populate the six `customfield_*` IDs. Discovery is now a three-tier autonomous flow: (1) direct `GET /rest/api/3/field` when a Jira API token is available (env, `~/.atlassian/credentials`, or `.pn/settings.local.json`); (2) sentinel probe-and-restore via MCP using distinct values per same-typed field pair, snapshot-then-restore on a non-`Release` issue, with screen-error fall-through; (3) a single structured prompt as last resort. Same-typed pair handling (Validation/Handover, AC/Expected Scope) is now correct.
- **Workflow validation no longer claims `divergent: false` from a single MCP data point.** The MCP does not expose `/rest/api/3/workflow`. Token path performs the real comparison; MCP-only path records `workflow.divergent = "unknown"` and accrues evidence at runtime.
- **`sqlite3` missing now surfaces a remediation hint** in the bootstrap summary (`brew install sqlite` / `dnf install sqlite` / `apt install sqlite3`) instead of skipping silently.
- **Idempotent re-run merge rules made explicit for custom-field IDs.** Placeholder (`customfield_XXXXX`) is always replaced; matching resolved IDs are preserved without prompting; differing IDs trigger a single diff prompt guarding against accidental Jira-instance re-pointing.

## [0.4.0] - 2026-05-12

### Changed
- **Skill directory and frontmatter names converted from `snake_case` to `kebab-case`.** All 19 skills under `src/skills/` now use hyphens (`bootstrap-project`, `refine-grill-requirements`, `progress-implement`, etc.) to match the plugin naming convention (`pn-workflow`, `pn-po`, ...). The 0.3.0 release notes documented the kebab-case names as the user-facing identifiers, but the on-disk directories and SKILL.md `name:` fields had remained `snake_case`; this release aligns both. Plugin `compose.skills` arrays, cross-references in SKILL.md bodies, hooks, bootstrap templates, and docs updated accordingly. Invocation is unchanged for callers who already used the documented kebab-case form (e.g., `/pn-workflow:bootstrap-project`).

## [0.3.0] - 2026-05-12

### Added
- **Role-specific plugins alongside `pn-workflow`.** The marketplace now ships four additional plugins so teams can install only the slice they need: `pn-po` (refinement + estimation), `pn-dev` (TDD implementation + architecture + docs), `pn-qa` (review + security audit), `pn-release` (handover + release readiness). Each role plugin is **self-sufficient**: it includes `bootstrap-project`, `status`, and the shared `index-on-write` + `session-journal` hooks on top of its role-specific skills/hooks. `pn-workflow` still bundles the full suite (19 skills + 7 hooks).
- **`{{plugin}}` build-time templating.** Skill cross-references in source SKILL.md files are written as `/{{plugin}}:<skill>`; the build script substitutes the actual plugin name when copying skills into each plugin under `dist/`. Result: `/pn-po:status` correctly suggests `/pn-po:refine-grill-requirements`, and `/pn-dev:status` suggests `/pn-dev:progress-implement`, without maintaining per-plugin skill copies.

### Changed
- **Skills renamed: `pn_` prefix dropped from all 19 skill directories and frontmatter `name:` fields.** Claude Code namespaces plugin skills as `<plugin>:<skill>`, so the `pn_` prefix produced redundant identifiers (`pn-workflow:pn_new-capture-idea`). Skills are now `new-capture-idea`, `refine-grill-requirements`, `progress-implement`, etc.; invocation becomes `/pn-workflow:new-capture-idea` (or `/pn-po:new-capture-idea` under the role split). The phase prefix (`refine_`, `estimate_`, `handover_`) is retained because it maps to the Jira `PN Phase` custom field. The Jira custom-field keys `pn_phase`, `pn_phase_after`, `pn_phase_before`, `pn_phase_field_id` are unchanged.
- **Source restructured to shared pools.** Skills moved from `src/plugins/pn-workflow/skills/` to `src/skills/`; hooks moved to `src/hooks/pn/` with the canonical wiring at `src/hooks/hooks.json`. Each plugin's `plugin.json` now carries a `compose: { skills, hooks }` block (string `"*"` or an array of names) that the build script resolves against the pools, copying only the referenced entries into `dist/marketplace/plugins/<plugin>/` and filtering `hooks.json` to the included hooks.
- **Plugin renamed: `pn-skills` -> `pn-workflow`.** The new name accurately describes what the plugin does: orchestrate the PO/DEV/QA lifecycle workflow across Jira and the git repo. The marketplace name (`pn-plugins`) is unchanged. Install becomes `/plugin install pn-workflow@pn-plugins`.
- Plugin source directory moved: `src/plugins/pn-skills/` -> `src/plugins/pn-workflow/`. Source-repo name is unchanged.

## [0.2.0] - 2026-05-11

### Changed
- **Hooks rewritten to Node.js (ESM).** The seven hooks under `.claude/hooks/pn/` are now single cross-platform `.mjs` files invoked as `node .claude/hooks/pn/<name>.mjs`. Replaces the previous bash + PowerShell pair per hook. Removes the per-machine bootstrap requirement for hook installation; cloning the repo is sufficient on Linux/macOS/Windows.
- **`.claude/settings.json` is now team-wide and committed.** Hook entries live in `.claude/settings.json` (shared) instead of `.claude/settings.local.json` (per-machine). Bootstrap no longer mutates `.claude/settings.local.json`.
- **`.pn/settings.json` is shared project config.** Removed the per-machine `status.complete` / `status.completed_at` flags and the `code_knowledge.seeded` flag. Consumer skills derive bootstrap-completeness from resolved values (`jira.cloud_id` non-empty AND all six `customfield_*.id` values not `customfield_XXXXX`). The code-knowledge layer is self-healing: `index-on-write` and consumer skills probe `.pn/index/index.sqlite` directly and seed on demand once `sqlite3` is available.
- **Session journal moved to `.pn/journal/`.** Per-developer telemetry no longer lands under `docs/pn/journal/` (which produced merge conflicts on shared dates); it now lives alongside other session logs in `.pn/` and is gitignored.
- **`.pn/.gitignore` shipped by bootstrap.** Replaces the previous repo-root `.gitignore: .pn/` blanket rule. Tracks `.pn/settings.json`; ignores generated artefacts (`index/`, `journal/`, `*.sqlite*`, `*.log`, `.cache/`).
- Consumer-skill guards updated across all 14 skills: previous `Confirm status.complete = true` checks now read `Confirm jira.cloud_id is set and required customfield_* ids are populated (no customfield_XXXXX placeholders)`.

### Removed
- All `.sh` and `.ps1` hook variants under `src/hooks/pn/` (replaced by `.mjs`).
- `settings.local.json.hook-entries.bash.json` and `settings.local.json.hook-entries.pwsh.json` bootstrap templates.
- `mcp.json.template` and the bootstrap step that writes `.mcp.json`. The PN team uses the company-wide claude.ai Atlassian add-on, which provisions the MCP server at the user-account level; a per-project entry would duplicate or override it.

### Added
- `src/hooks/pn/_common.mjs` shared helpers (Node stdlib only; shells out to `sqlite3` binary when available).
- `templates/claude-settings.json.template` for regenerating the team-wide hook wiring.
- `templates/pn-dotgitignore.template` rendered to `.pn/.gitignore` during bootstrap.

### Prerequisites
- Node.js 18 or higher on PATH (now required by bootstrap and hooks).
- `sqlite3` binary remains optional; absence triggers graceful degradation, not failure.

## [0.1.0] - 2026-05-11

### Added
- Initial canonical Proud Nerds skill-set delivered via PLAN-001 (8 phases).
- 19 `pn_*` skills covering the full PO/DEV/QA handoff flow:
  - Bootstrap: `pn_bootstrap-project`.
  - Pre-trajectory (6): `pn_new-capture-idea`, `pn_refine-grill-requirements`, `pn_refine-capture-context`, `pn_refine-draft-epic`, `pn_estimate-write-prd`, `pn_estimate-check-ticket`.
  - Architecture and planning (1): `pn_todo-plan-phases`.
  - Dev cycle (3): `pn_progress-implement`, `pn_review-pr`, `pn_review-evaluate-code`.
  - Handover (2): `pn_handover-release-notes`, `pn_handover-gate` (soft Gate 1).
  - Release (1): `pn_release-readiness-gate` (soft Gate 2).
  - Continuous (5): `pn_status`, `pn_security-audit`, `pn_update-docs`, `pn_arch-audit-modules`, `pn_ubiquitous-language`.
- Seven cross-platform hooks (`.sh` + `.ps1`) with shared helpers: `block-raw-search`, `enforce-summary-freshness`, `adr-watch`, `index-on-write`, `tdd-enforce`, `language-lock`, `session-journal`. All fail-safe; warn-mode default.
- Code-knowledge layer: SQLite at `.pn/index/index.sqlite` with FTS5; schema defined in `pn_bootstrap-project/templates/code-knowledge-schema.sql`; documented in ADR-0001.
- Light Jira workflow + `PN Phase` shadow custom field model; both gates soft (client-side), never modifying per-project Jira workflows.
- Bootstrap templates: `.pn.json`, `CLAUDE.md` seed, `.mcp.json`, platform-correct hook entries, desktop-onboarding doc, `docs/pn/` skeleton.
- ADR-0001: code-knowledge layer storage format and on-disk path.

### Conventions
- All skill content in English; release notes in Dutch when `.pn.json` `language.jira = nl`.
- Author attribution on every artefact uses `git config user.name`; no AI/tool attribution anywhere.
