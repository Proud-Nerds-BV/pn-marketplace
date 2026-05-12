#!/usr/bin/env node
// language-lock.mjs
// Purpose: warns when an Edit/Write introduces probable domain terms not present
//          in the repo-root UBIQUITOUS_LANGUAGE.md.
// Event:   PostToolUse (matcher: Edit|Write)
// Exit:    0 always (best-effort, never blocks).

import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { bootstrap, readPayload, warn } from './_common.mjs';

const HOOK = 'language-lock';
const STOPWORDS = new Set([
  'The','This','That','These','Those','When','Then','With','From','Into','Some','Such',
  'Also','Note','Use','Used','Using','For','And','But','Not','Are','Was','Were','Has',
  'Have','Had','Get','Set','New','Old','All','Any','One','Two','See',
]);

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root } = ctx;

  const ulPath = join(root, 'UBIQUITOUS_LANGUAGE.md');
  if (!existsSync(ulPath)) process.exit(0);

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') process.exit(0);

  const target = payload?.tool_input?.file_path;
  if (!target) process.exit(0);
  const abs = isAbsolute(target) ? target : join(root, target);
  if (!existsSync(abs)) process.exit(0);

  const content = readFileSync(abs, 'utf8');
  const candidates = [...new Set(content.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [])].slice(0, 50);
  if (candidates.length === 0) process.exit(0);

  const ul = readFileSync(ulPath, 'utf8');
  const drift = candidates.filter((t) => !STOPWORDS.has(t) && !ul.includes(t));
  if (drift.length === 0) process.exit(0);

  warn(
    HOOK,
    `Possible UL drift in ${basename(target)}: terms not in UBIQUITOUS_LANGUAGE.md: ${drift.slice(0, 5).join(' ')}. Consider updating the UL or aligning naming.`,
  );
} catch {
  /* never block */
}
process.exit(0);
