# Bootstrap templates

Source-of-truth templates rendered by `pn_bootstrap-project` into consuming projects.

## Files

| Template | Renders to | Purpose |
|---|---|---|
| `settings.json.template` | `<repo>/.pn/settings.json` | Per-project pn-skills configuration (shared, committed). |
| `claude-md.seed.md` | Block appended to `<repo>/CLAUDE.md` | PN conventions seed; managed by fenced begin/end markers. |
| `pn-dotgitignore.template` | `<repo>/.pn/.gitignore` | Ignores generated artefacts inside `.pn/` while keeping `settings.json` tracked. |
| `desktop-onboarding.md.template` | `<repo>/docs/pn/desktop-onboarding.md` | Dutch onboarding checklist for the PO. |
| `docs-pn-skeleton.txt` | Directories under `<repo>/docs/pn/` | Manifest of subdirectories to create with `.gitkeep`. |
| `code-knowledge-schema.sql` | `<repo>/.pn/index/index.sqlite` (initial schema) | SQLite DDL for the code-knowledge layer. |

## Code-knowledge layer contract

The code-knowledge layer is the in-skillset code index used by consumer skills at runtime. PRD-008 and ADR-0001 govern it.

### Storage

- Format: SQLite (`index.sqlite`).
- Location: `.pn/index/` (gitignored).
- Mode: WAL (concurrent readers, one writer at a time).
- Schema version: `schema_meta.schema_version` row, currently `1`.

### Writers (exhaustive)

- `pn_bootstrap-project` (seed).
- `.claude/hooks/pn/index-on-write.mjs` (incremental refresh after Edit/Write).
- `pn_update-docs` (full refresh on demand).

No other skill or hook writes to the layer. Read-only contract is verifiable by inspecting the layer's mtime trail against this list.

### Queries

Consumer skills (`pn_progress-implement`, `pn_update-docs`, `pn_arch-audit-modules`, `pn_review-evaluate-code`) issue **structured SQL queries** through the consuming skill's bash tool. Examples:

- Resolve module for a file path -> `SELECT summary_md FROM summaries s JOIN files f ON f.id = s.file_id WHERE f.path = ?`.
- Full-text search over summaries -> `SELECT module_path, snippet(summaries_fts, ...) FROM summaries_fts WHERE summaries_fts MATCH ?`.
- Importers of a target -> `SELECT f.path FROM imports i JOIN files f ON f.id = i.file_id WHERE i.target = ?`.

Queries are deterministic on unchanged input (PRD-008 #14).

### Cold-start behaviour

If the layer is missing or empty:

- PreToolUse hooks degrade to warn-mode and do not block (PRD-008 #17).
- Consumer skills proceed in best-effort mode (re-reading source as needed) and trigger a re-seed via `pn_update-docs`.

### Branch-switch survival

`index-on-write` reconciles per file on the next Edit/Write event. `enforce-summary-freshness` flags stale rows on the next read. No manual repair is needed (PRD-008 #15).

### Footprint

Guidance: under 50 MB for a 100k-LOC repo (PRD-008 #19). Exceeding this is logged in the session journal; it does not block tool use.

## Rendering rules

- Replace placeholders of the form `<NAME>` with detected values.
- Pretty-print JSON with two-space indent.
- No emdashes in any rendered output.
- Preserve user content above and below managed regions in `CLAUDE.md` (use the fenced `BEGIN/END pn-skills bootstrap block` markers).
