#!/usr/bin/env node
// adr-watch.mjs
// Purpose: warns when an Edit/Write touches a file not in the active plan's
//          declared file-set, suggesting an ADR for the scope drift.
// Event:   PreToolUse (matcher: Edit|Write)
// Exit:    0 always (warn-only heuristic).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bootstrap, readPayload, relPath, gitBranch, warn } from './_common.mjs';

const HOOK = 'adr-watch';

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root } = ctx;

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') process.exit(0);

  const target = payload?.tool_input?.file_path;
  if (!target) process.exit(0);

  const plansDir = join(root, 'docs', 'anvil', 'plans');
  if (!existsSync(plansDir)) process.exit(0);
  const planFile = readdirSync(plansDir)
    .filter((f) => f.endsWith('-In-Progress.md'))
    .map((f) => join(plansDir, f))
    .find(existsSync);
  if (!planFile) process.exit(0);

  const rel = relPath(target, root);
  const planContent = readFileSync(planFile, 'utf8');
  if (planContent.includes(rel) || planContent.includes(basename(rel))) process.exit(0);

  const branch = gitBranch(root) || '?';
  warn(
    HOOK,
    `Scope drift: '${rel}' is not referenced by active plan ${basename(planFile)} (branch=${branch}). Consider an ADR documenting why this change is necessary.`,
  );
} catch {
  /* never block */
}
process.exit(0);
