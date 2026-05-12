<!-- BEGIN pn-skills bootstrap block (managed by pn_bootstrap-project; do not edit by hand) -->

## pn-skills conventions

This project uses the Proud Nerds skill-set (`pn-skills`). The skills assume the following baseline; do not deviate without updating `.pn/settings.json` first.

### Two-store rule

- **Jira** is leading for anything that transitions (status, gates, custom fields, acceptance criteria).
- **git-repo** is leading for anything versioned (PRDs, plans, ADRs, context-packs, story notes, findings, release notes).
- On conflict between Jira and Markdown, Jira wins.

### Language

- Code, hook output, and skill internals are in English.
- User-facing release notes and PO onboarding are Dutch (per `pn_handover-release-notes`).
- `.pn/settings.json` controls `language.output` and `language.jira` independently.

### Hard rules

- No emdashes (the character itself). Use semicolons instead when a separator is needed.
- No inline styles, no inline JavaScript, no inline PHP execution.
- Authorship in every artefact is the human (`git config user.name`); never "Claude", "ANVIL", or any AI/tool name.

### Branching and commit format

This project uses git-flow. Branch names are the source of truth for change scope.

Commit format:

```
FEATURE | [FEATURE-NAME-FROM-BRANCH] | [Short description, max 80 chars]
HOTFIX  | [HOTFIX-NAME-FROM-BRANCH]  | [Short description, max 80 chars]
RELEASE | [RELEASE-NAME-FROM-BRANCH] | [Short description, max 80 chars]
BUGFIX  | [BUGFIX-NAME-FROM-BRANCH]  | [Short description, max 80 chars]
DEVELOP | [Short description, max 80 chars]
PROD    | [Short description, max 80 chars]
```

Detect the current branch with `git branch --show-current` before composing the message.

### Skills entry points

- `/pn_bootstrap-project` (this skill) installs or refreshes the toolkit.
- `/pn_status` is read-only; it summarises current branch, linked Jira issue, recent commits.
- `/pn_new-capture-idea` captures a raw idea before any Jira touch.
- `/pn_progress-implement` drives TDD on an in-progress story.
- `/pn_handover-gate` and `/pn_release-readiness-gate` are the two soft gates.

Other `pn_*` skills route off the `PN Phase` custom field on the active Jira issue.

### Code-knowledge layer

A local SQLite index at `.pn/index/index.sqlite` (gitignored). Hooks keep it warm; consumer skills query it read-only. If it goes cold, skills degrade to best-effort and trigger a re-seed.

<!-- END pn-skills bootstrap block -->
