-- pn-skills code-knowledge layer
-- Storage: SQLite (decision: docs/anvil/adrs/0001-code-knowledge-layer-storage.md)
-- Location: .pn/index/index.sqlite (gitignored, project-local)
-- Consumers: block-raw-search, enforce-summary-freshness, index-on-write,
--            pn_progress-implement, pn_update-docs, pn_arch-audit-modules.
-- Writers:   bootstrap (seeds), index-on-write (incremental), pn_update-docs (refresh).
-- Readers:   everyone else.
-- Mode:      WAL for concurrent readers.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

-- Schema metadata (single-row key/value store).
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- One row per indexed source file.
CREATE TABLE IF NOT EXISTS files (
    id         INTEGER PRIMARY KEY,
    path       TEXT NOT NULL UNIQUE,
    lang       TEXT,
    sha256     TEXT,
    size_bytes INTEGER,
    mtime      INTEGER,
    indexed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_files_lang   ON files(lang);

-- Per-module LLM-generated summary, with freshness tracking.
CREATE TABLE IF NOT EXISTS summaries (
    id             INTEGER PRIMARY KEY,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    module_path    TEXT NOT NULL,
    summary_md     TEXT NOT NULL,
    source_mtime   INTEGER NOT NULL,
    summary_mtime  INTEGER NOT NULL,
    model          TEXT,
    stale          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_summaries_file_id ON summaries(file_id);
CREATE INDEX IF NOT EXISTS idx_summaries_stale   ON summaries(stale);
CREATE INDEX IF NOT EXISTS idx_summaries_module  ON summaries(module_path);

-- Import edges: file_id imports target. kind classifies the import statement.
CREATE TABLE IF NOT EXISTS imports (
    id      INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    target  TEXT NOT NULL,
    kind    TEXT NOT NULL CHECK (kind IN ('use','require','include','import','from','other'))
);

CREATE INDEX IF NOT EXISTS idx_imports_file_id ON imports(file_id);
CREATE INDEX IF NOT EXISTS idx_imports_target  ON imports(target);

-- Export edges: symbols a file exposes.
CREATE TABLE IF NOT EXISTS exports (
    id      INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    symbol  TEXT NOT NULL,
    kind    TEXT NOT NULL CHECK (kind IN ('class','function','const','default','type','other'))
);

CREATE INDEX IF NOT EXISTS idx_exports_file_id ON exports(file_id);
CREATE INDEX IF NOT EXISTS idx_exports_symbol  ON exports(symbol);

-- Append-only audit trail of layer writes.
CREATE TABLE IF NOT EXISTS journal (
    id           INTEGER PRIMARY KEY,
    ts           INTEGER NOT NULL,
    event        TEXT NOT NULL,
    file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
    payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal(ts);

-- Full-text search over summaries (FTS5; contentless mirror of summaries).
CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(
    summary_md,
    module_path,
    content='summaries',
    content_rowid='id'
);

-- Triggers to keep FTS5 in sync with summaries.
CREATE TRIGGER IF NOT EXISTS summaries_ai AFTER INSERT ON summaries BEGIN
    INSERT INTO summaries_fts(rowid, summary_md, module_path)
    VALUES (new.id, new.summary_md, new.module_path);
END;

CREATE TRIGGER IF NOT EXISTS summaries_ad AFTER DELETE ON summaries BEGIN
    INSERT INTO summaries_fts(summaries_fts, rowid, summary_md, module_path)
    VALUES ('delete', old.id, old.summary_md, old.module_path);
END;

CREATE TRIGGER IF NOT EXISTS summaries_au AFTER UPDATE ON summaries BEGIN
    INSERT INTO summaries_fts(summaries_fts, rowid, summary_md, module_path)
    VALUES ('delete', old.id, old.summary_md, old.module_path);
    INSERT INTO summaries_fts(rowid, summary_md, module_path)
    VALUES (new.id, new.summary_md, new.module_path);
END;

-- Seed schema_meta with the current schema version.
INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('created_by', 'pn_bootstrap-project');
