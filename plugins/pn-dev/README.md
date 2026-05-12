# Proud Nerds plugin marketplace

A Claude Code plugin marketplace for the Proud Nerds PO/DEV/QA lifecycle: 19 skills + 7 hooks that orchestrate the full flow from idea capture through release, with Jira as the system-of-record for status and the git repo as the system-of-record for versioned artefacts (PRDs, plans, ADRs, release notes).

- Source: [pn-wordpress/proud-nerds-company-wide-skillset](https://bitbucket.org/pn-wordpress/proud-nerds-company-wide-skillset) (private; this is where skills/hooks are authored).
- Marketplace: [Proud-Nerds-BV/pn-marketplace](https://github.com/Proud-Nerds-BV/pn-marketplace) (public; this is what Claude Code installs from).

## Install

Inside Claude Code:

```text
/plugin marketplace add Proud-Nerds-BV/pn-marketplace
/plugin install pn-workflow@pn-plugins
```

Replace `pn-workflow` with any role plugin below.

## Plugins

Every plugin is self-sufficient: each one bundles `bootstrap-project` + `status` and the two cross-cutting hooks (`index-on-write`, `session-journal`). Pick the slice that matches your role, or install `pn-workflow` for the complete toolkit.

| Plugin | Skills | Hooks | When to install |
|---|---|---|---|
| [`pn-workflow`](./src/plugins/pn-workflow/plugin.json) | 19 (full set) | 7 (full set) | You want the whole PN lifecycle in one install. |
| [`pn-po`](./src/plugins/pn-po/plugin.json) | 10 | 3 | Product Owner / refinement / estimation work. |
| [`pn-dev`](./src/plugins/pn-dev/plugin.json) | 5 | 4 | Developer TDD loop on a feature/bugfix branch. |
| [`pn-qa`](./src/plugins/pn-qa/plugin.json) | 5 | 4 | PR review, code evaluation, security audit. |
| [`pn-release`](./src/plugins/pn-release/plugin.json) | 5 | 2 | Release coordinator handing a tag off to the PO. |

You can install multiple role plugins side by side; each command is namespaced (`/pn-po:status`, `/pn-dev:status`, ...) so there are no collisions. Avoid installing `pn-workflow` *and* a role plugin in the same Claude Code instance unless you specifically want both namespaces available.

### `pn-workflow` — full suite

The umbrella plugin. Ships every skill and every hook in the marketplace.

**Skills (19):** `bootstrap-project`, `status`, `new-capture-idea`, `refine-capture-context`, `refine-draft-epic`, `refine-grill-requirements`, `estimate-write-prd`, `estimate-check-ticket`, `todo-plan-phases`, `progress-implement`, `arch-audit-modules`, `update-docs`, `ubiquitous-language`, `review-pr`, `review-evaluate-code`, `security-audit`, `handover-gate`, `handover-release-notes`, `release-readiness-gate`.

**Hooks (7):** `block-raw-search`, `enforce-summary-freshness`, `adr-watch`, `index-on-write`, `tdd-enforce`, `language-lock`, `session-journal`.

### `pn-po` — Product Owner

Discovery, refinement, estimation, planning.

**Role skills:** `new-capture-idea`, `refine-capture-context`, `refine-draft-epic`, `refine-grill-requirements`, `estimate-write-prd`, `estimate-check-ticket`, `todo-plan-phases`, `ubiquitous-language`.
**Role hooks:** `language-lock` (enforces the language setting in `.pn/settings.json`).

### `pn-dev` — developer

TDD implementation, architecture review, docs maintenance.

**Role skills:** `progress-implement`, `arch-audit-modules`, `update-docs`.
**Role hooks:** `tdd-enforce` (writes-before-tests blocker), `adr-watch` (prompt for ADRs on architectural edits).

### `pn-qa` — review and audit

PR review, code evaluation, security audit.

**Role skills:** `review-pr`, `review-evaluate-code`, `security-audit`.
**Role hooks:** `block-raw-search` (force structured searches), `enforce-summary-freshness` (require up-to-date file summaries before edits).

### `pn-release` — release coordination

Handover gates and release notes.

**Role skills:** `handover-gate`, `handover-release-notes` (Dutch), `release-readiness-gate`.

## Conventions

- Skills are invoked plugin-namespaced: `/pn-workflow:status`, `/pn-po:refine-grill-requirements`, `/pn-dev:progress-implement`.
- Skill names follow `<phase>_<verb>_<noun>` where the phase prefix maps to the Jira `PN Phase` custom field.
- Two soft gates protect the lifecycle: `handover-gate` (per ticket) and `release-readiness-gate` (per release). Both are client-side and never bypass user override.
- Jira is leading for anything that transitions; git-repo is leading for anything versioned. On conflict, Jira wins.
- Code and skill internals in English; user-facing release notes in Dutch (per `handover-release-notes`).

## Prerequisites

- **Claude Code** with `/plugin` support.
- **Node.js 18+** on PATH (hooks are cross-platform `.mjs`).
- **claude.ai Atlassian add-on** authenticated (the toolkit talks to Jira through the user-level connector; no per-project `.mcp.json` is required).
- **`sqlite3` binary** (optional, for the code-knowledge index at `.pn/index/index.sqlite`).
- **`git`** with `user.name` and `user.email` configured.

## Per-project bootstrap

After installing any plugin, in each consuming project run (substituting your plugin namespace):

```text
/pn-workflow:bootstrap-project
```

This writes `.pn/settings.json` (shared, committed), seeds `CLAUDE.md` with PN conventions, discovers the Jira custom-field IDs, scaffolds `docs/pn/`, and seeds the code-knowledge index. Idempotent on re-run.

## Release flow

This marketplace is built and published automatically by [bitbucket-pipelines.yml](./bitbucket-pipelines.yml). On every merge to `main` in the source repo, CI:

1. Reads the version from the topmost `## [x.y.z]` heading in [CHANGELOG.md](./CHANGELOG.md).
2. Builds `dist/marketplace/` against that version.
3. Force-pushes the result to [Proud-Nerds-BV/pn-marketplace](https://github.com/Proud-Nerds-BV/pn-marketplace).

To cut a release: open a PR that bumps the changelog heading (e.g. add a new `## [0.4.0] - 2026-05-13` block) and merge it. No further manual steps.

## More

- [INSTALLATION.md](./INSTALLATION.md) — detailed install, publish, update, troubleshooting.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
- [CLAUDE.md](./CLAUDE.md) — repo conventions and authoring rules.
