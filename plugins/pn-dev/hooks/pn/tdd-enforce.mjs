#!/usr/bin/env node
// tdd-enforce.mjs
// Purpose: warns when a source file is edited without a matching test file
//          edited in the same session.
// Event:   PostToolUse (matcher: Edit|Write)
// Exit:    0 always.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bootstrap, readPayload, relPath, testPatterns, testsDir, matchesAny, warn } from './_common.mjs';

const HOOK = 'tdd-enforce';

function isUnderTestsDir(rel, td) {
  if (!td) return false;
  const clean = td.replace(/[\\/]+$/, '');
  return rel === clean || rel.startsWith(clean + '/') || rel.startsWith(clean + '\\');
}

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root, config } = ctx;

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') process.exit(0);

  const target = payload?.tool_input?.file_path;
  if (!target) process.exit(0);

  const patterns = testPatterns(config);
  if (patterns.length === 0) process.exit(0);

  const td = testsDir(config);
  const rel = relPath(target, root);
  const base = basename(rel);

  const sessionDir = join(root, '.pn');
  const sessionLog = join(sessionDir, 'session-edits.log');
  const warnedLog = join(sessionDir, 'tdd-warned.log');
  mkdirSync(sessionDir, { recursive: true });
  appendFileSync(sessionLog, rel + '\n');

  // If the edit itself is a test, done.
  if (matchesAny(base, patterns)) process.exit(0);
  if (isUnderTestsDir(rel, td)) process.exit(0);

  // Any test edit this session?
  let hasTestEdit = false;
  if (existsSync(sessionLog)) {
    const lines = readFileSync(sessionLog, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (matchesAny(basename(line), patterns) || isUnderTestsDir(line, td)) {
        hasTestEdit = true;
        break;
      }
    }
  }
  if (hasTestEdit) process.exit(0);

  // Dedup warnings.
  if (existsSync(warnedLog)) {
    const warned = readFileSync(warnedLog, 'utf8').split(/\r?\n/);
    if (warned.includes(rel)) process.exit(0);
  }
  appendFileSync(warnedLog, rel + '\n');

  warn(HOOK, `TDD: no test edit accompanies source change '${rel}'. Write or update a failing test first.`);
} catch {
  /* never block */
}
process.exit(0);
