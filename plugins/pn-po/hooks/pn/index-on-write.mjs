#!/usr/bin/env node
// index-on-write.mjs
// Purpose: marks the edited source file as `needs_reindex=1` in the
//          code-knowledge layer so the next idle skill run refreshes it.
// Event:   PostToolUse (matcher: Edit|Write)
// Exit:    0 always.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  bootstrap,
  readPayload,
  inSource,
  indexDir,
  relPath,
  hasSqlite,
  sqliteExec,
  mtimeSeconds,
} from './_common.mjs';

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root, config } = ctx;

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') process.exit(0);

  const target = payload?.tool_input?.file_path;
  if (!target) process.exit(0);
  if (!inSource(target, root, config)) process.exit(0);

  const dbPath = join(root, indexDir(config).replace(/[\\/]+$/, ''), 'index.sqlite');
  if (!existsSync(dbPath)) process.exit(0);
  if (!hasSqlite()) process.exit(0);

  const rel = relPath(target, root);
  const abs = join(root, rel);
  if (!existsSync(abs)) process.exit(0);

  const mtime = mtimeSeconds(abs);
  const now = Math.floor(Date.now() / 1000);
  const relEsc = rel.replace(/'/g, "''");

  const sql = `BEGIN;
UPDATE files SET mtime = ${mtime}, indexed_at = indexed_at WHERE path = '${relEsc}';
INSERT OR IGNORE INTO files(path, mtime, indexed_at) VALUES ('${relEsc}', ${mtime}, ${now});
UPDATE summaries SET stale = 1 WHERE file_id = (SELECT id FROM files WHERE path = '${relEsc}');
INSERT INTO journal(ts, event, file_id, payload_json)
    VALUES (${now}, 'index-on-write.queued', (SELECT id FROM files WHERE path = '${relEsc}'), '{"reason":"post-edit"}');
COMMIT;`;

  sqliteExec(dbPath, sql);
} catch {
  /* never block */
}
process.exit(0);
