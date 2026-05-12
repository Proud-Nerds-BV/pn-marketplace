#!/usr/bin/env node
// enforce-summary-freshness.mjs
// Purpose: warns or blocks when the source file under edit is newer than its
//          recorded summary in the code-knowledge layer.
// Event:   PreToolUse (matcher: Read|Edit|Write)
// Exit:    0 allow/warn, 2 block.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  bootstrap,
  readPayload,
  inSource,
  indexDir,
  relPath,
  hasSqlite,
  sqliteQuery,
  blockOrWarn,
  mtimeSeconds,
} from './_common.mjs';

const HOOK = 'enforce-summary-freshness';

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root, config } = ctx;

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (!['Read', 'Edit', 'Write'].includes(tool)) process.exit(0);

  const target = payload?.tool_input?.file_path;
  if (!target) process.exit(0);
  if (!inSource(target, root, config)) process.exit(0);

  const dbPath = join(root, indexDir(config).replace(/[\\/]+$/, ''), 'index.sqlite');
  if (!existsSync(dbPath)) process.exit(0);
  if (!hasSqlite()) process.exit(0);

  const rel = relPath(target, root);
  const relEsc = rel.replace(/'/g, "''");
  const out = sqliteQuery(
    dbPath,
    `SELECT MAX(s.summary_mtime) FROM summaries s JOIN files f ON f.id = s.file_id WHERE f.path = '${relEsc}';`,
    { readonly: true },
  );
  if (!out) process.exit(0);
  const summaryMtime = parseInt(out, 10);
  if (!Number.isFinite(summaryMtime) || summaryMtime === 0) process.exit(0);

  const absPath = join(root, rel);
  if (!existsSync(absPath)) process.exit(0);
  const srcMtime = mtimeSeconds(absPath);

  if (srcMtime > summaryMtime) {
    blockOrWarn(
      HOOK,
      config,
      `Source ${rel} is newer than its summary; refresh by re-running the indexer (pn_update-docs).`,
    );
  }
} catch {
  /* never block on internal error */
}
process.exit(0);
