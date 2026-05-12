# Installation

This guide installs Proud Nerds plugins (from the `pn-plugins` marketplace) into Claude Code via a local or remote plugin marketplace.

## Which plugins to install

The marketplace ships five plugins. Each is self-sufficient: every role plugin includes `bootstrap-project` and `status` plus the shared `index-on-write` and `session-journal` hooks, so it works as a standalone install.

- **Full suite**: `pn-workflow` — all 19 skills and all 7 hooks.
- **Role plugins** (each adds role-specific skills/hooks on top of the shared core):
  - `pn-po` — discovery/refinement/estimation + Dutch-language lock hook.
  - `pn-dev` — TDD implementation, architecture audit, docs update; TDD + ADR-watch hooks.
  - `pn-qa` — PR review, code evaluation, security audit; raw-search block + summary-freshness hooks.
  - `pn-release` — handover gate, Dutch release notes, release readiness gate.

Skill cross-references inside each plugin are namespaced to the plugin they ship in (the build replaces `{{plugin}}` at copy time), so `/pn-po:status` correctly suggests `/pn-po:refine-grill-requirements` and `/pn-dev:status` correctly suggests `/pn-dev:progress-implement`.

You can install multiple role plugins side by side; each one's bootstrap/status command lives under its own namespace and they will not collide. Avoid installing `pn-workflow` *and* a role plugin in the same Claude Code instance unless you actually want two copies of bootstrap/status in different namespaces.

## Prerequisites

- **Node.js 18+** on the PATH. Required by the build script and by every hook at runtime.
  ```sh
  node --version   # must be 18 or higher
  ```
- **Claude Code** with plugin support (`/plugin` command available).
- **claude.ai Atlassian add-on** enabled for your account. The pn-skills toolkit talks to Jira through the company-wide claude.ai Atlassian connector; no per-project `.mcp.json` is required.
- **`sqlite3` binary** (optional). Enables the code-knowledge layer at `.pn/index/index.sqlite`. If missing, hooks and consumer skills degrade gracefully and re-seed once `sqlite3` is installed.
- **`git`** with `user.name` and `user.email` configured. Authorship in every generated artefact uses `git config user.name`.

## Option 1: Install from a local checkout (recommended for development)

Clone the repo, build the plugin into `dist/marketplace/`, then point Claude Code at that directory.

```sh
git clone git@bitbucket.org:pn-wordpress/proud-nerds-company-wide-skillset.git pn-skills
cd pn-skills
npm run build
```

The build prints the exact install commands. Paste them inside Claude Code:

```text
/plugin marketplace add /absolute/path/to/pn-skills/dist/marketplace
/plugin install pn-workflow@pn-plugins
```

Shortcut that builds and prints the commands in one step:

```sh
npm run install:local
```

## Option 2: Install from the published marketplace (recommended for end users)

Once the marketplace is published to a **public** GitHub repo (e.g. `Proud-Nerds-BV/pn-marketplace`), every team member installs it with two commands inside Claude Code, with **no authentication required**:

```text
/plugin marketplace add Proud-Nerds-BV/pn-marketplace
/plugin install pn-workflow@pn-plugins
```

No GitHub account, no SSH key, no personal access token. Claude Code clones the public repo anonymously over HTTPS. This is the right distribution mode for POs, designers, QA, and anyone else on the team who needs the skills without dealing with credentials.

The marketplace manifest lives at `.claude-plugin/marketplace.json` in the repo root; Claude Code discovers it automatically.

### Why public is safe here

The plugin repo contains only:
- Skill definitions (`SKILL.md` markdown).
- Hook scripts (cross-platform Node `.mjs`).
- Bootstrap templates and documentation.

It contains **no credentials, no Jira content, no client data**. The Jira connection is made at runtime through the **claude.ai Atlassian add-on of the end user**; tokens live on the user's account, not in the plugin. Per-project configuration (`.pn/settings.json` with `customfield_*` ids) lives in each **client** repo, not in the plugin repo.

### What NOT to commit to the plugin repo

To keep public distribution safe, never push the following to `Proud-Nerds-BV/pn-marketplace`:
- `.pn/settings.json` from any consuming project (contains the Jira `cloud_id` and resolved `customfield_*` ids; project-specific).
- Any `.mcp.json` with real OAuth tokens or API keys.
- `docs/pn/ideas/`, `docs/pn/prd/`, `docs/pn/findings/`, `docs/pn/releases/` from real projects (client content).
- Session logs, journal files, code-knowledge databases (`.pn/journal/`, `.pn/*.log`, `.pn/index/`).
- `.env` files of any kind.

The `build-plugin.mjs` script only reads from whitelisted source paths (`src/skills/`, `src/hooks/`, and each `src/plugins/<plugin>/plugin.json`) plus a few top-level docs, then writes to `dist/marketplace/`, so accidental leakage is unlikely. Still: review the diff of `dist/marketplace/` before every publish if in doubt.

### Private repo alternative

If you have a reason to keep the plugin repo private (e.g. unreleased work), GitHub private repos still work: invite team members as collaborators (or via a GitHub team) and they install with the same two `/plugin` commands. Each user does need a configured SSH key or a GitHub login that Claude Code can use; that friction is the main reason public is preferred here.

## Publishing the marketplace (for maintainers)

The build output at `dist/marketplace/` is self-contained: its root is a valid marketplace. Host it by pushing that directory as the root of a **public** GitHub repo (recommended) and pointing Claude Code at it.

The default publish target is hard-coded to `git@github.com:Proud-Nerds-BV/pn-marketplace.git`. From a clean checkout:

```sh
npm run publish:marketplace
```

Override the target (one-off) by passing `--remote`:

```sh
npm run publish:marketplace -- --remote git@github.com:owner/repo.git
```

Or persist an override via the environment:

```sh
export PN_MARKETPLACE_REMOTE=git@github.com:owner/repo.git
npm run publish:marketplace
```

What this does:
- Runs `npm run build` to refresh `dist/marketplace/`.
- Treats `dist/marketplace/` as its own git working tree (initialised on first run).
- Stages everything, commits with a message including the plugin version, and force-pushes to the configured remote.
- Force-push is intentional: the marketplace branch is generated output, not a collaboration branch. Never point this at a remote that hosts source code.

Flags (passed through after `npm run publish:marketplace -- ...`):
- `--remote <git-url>` — explicit remote (overrides `PN_MARKETPLACE_REMOTE`).
- `--branch <name>` — defaults to `main`.
- `--message "<msg>"` — override the auto-generated commit message.
- `--dry-run` — print what would happen and exit; also available as `npm run publish:marketplace:dry`.

After publishing, end users install with the two `/plugin` commands shown above.

### Automated publishing from Bitbucket Pipelines

The repo ships [bitbucket-pipelines.yml](./bitbucket-pipelines.yml) which builds and publishes on every merge to `main`. The build script reads the version from the topmost `## [x.y.z]` heading in [CHANGELOG.md](./CHANGELOG.md), so bumping the changelog is the only manual step.

One-time setup in Bitbucket (`Repository settings → Repository variables`):

| Variable | Secured | Value |
|---|---|---|
| `GITHUB_TOKEN` | yes | A fine-grained GitHub personal access token with **Contents: Read and write** on `Proud-Nerds-BV/pn-marketplace`. |

After that:
- Merging to `main` triggers the `Build and publish marketplace to GitHub` step automatically.
- You can also trigger the `publish` or `publish-dry` custom pipelines from the Bitbucket UI ("Run pipeline" → "Custom") when you need to republish without a fresh commit (e.g. after rotating the token).

The token is injected only into the publish step's `--remote` URL inside the ephemeral CI container, so it never lands in the source repo or in `dist/marketplace/.git/config` on a developer machine.

## Per-project bootstrap

The `pn-workflow` plugin's skills and hooks are now available globally in Claude Code, but each project still needs a one-time bootstrap to capture project-specific Jira config and seed the code-knowledge layer.

Inside the target project's working directory, run:

```text
/pn-workflow:bootstrap-project   # or /pn-po:bootstrap-project, /pn-dev:bootstrap-project, etc. depending on which plugin you installed
```

This writes `.pn/settings.json` (shared, committed), `.pn/.gitignore`, scaffolds `docs/pn/`, and verifies Atlassian MCP reachability. Hook wiring is owned by the plugin install (handled when you installed the marketplace above); bootstrap does not touch `.claude/settings.json` or `.mcp.json`.

After bootstrap, commit the new files:

```sh
git add .pn/settings.json .pn/.gitignore docs/pn/
git commit -m "FEATURE | <NAME> | bootstrap pn-skills"
```

Teammates who clone the project after this commit do **not** need to run `/pn-workflow:bootstrap-project   # or /pn-po:bootstrap-project, /pn-dev:bootstrap-project, etc. depending on which plugin you installed` themselves; the shared config is already in place.

## Updating

Pull the latest source and rebuild:

```sh
git pull
npm run build
```

Then inside Claude Code:

```text
/plugin marketplace update pn-plugins
/plugin install pn-workflow@pn-plugins
```

## Uninstalling

Inside Claude Code:

```text
/plugin uninstall pn-workflow@pn-plugins
/plugin marketplace remove pn-plugins
```

Per-project artefacts (`.pn/settings.json`, `docs/pn/`) remain in each project's git history and can be removed manually if no longer needed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/plugin install` fails with "marketplace not found" | Marketplace not added | Run `/plugin marketplace add <path-or-repo>` first |
| Hooks do not fire after install | Node not on PATH or version below 18 | `node --version`; install or upgrade Node |
| Consumer skill aborts with "project not bootstrapped" | `.pn/settings.json` missing or `customfield_*` ids still `customfield_XXXXX` | Run `/pn-workflow:bootstrap-project   # or /pn-po:bootstrap-project, /pn-dev:bootstrap-project, etc. depending on which plugin you installed` in the project |
| `enforce-summary-freshness` and `index-on-write` silently no-op | `sqlite3` binary not on PATH | Install `sqlite3`; hooks self-heal on next write event |
| Atlassian MCP calls fail | claude.ai Atlassian connector not enabled / not authenticated | Enable under `claude.ai -> Settings -> Connectors -> Atlassian` and complete OAuth |
