#!/usr/bin/env node
// block-raw-search.mjs
// Purpose: forces structured queries against the code-knowledge layer by warning
//          or blocking raw filesystem search (grep/rg/ag/ack/find) targeting
//          configured source directories.
// Event:   PreToolUse (matcher: Grep|Bash)
// Exit:    0 allow/warn, 2 block.

import { bootstrap, readPayload, sourceDirs, inSource, indexDir, blockOrWarn } from './_common.mjs';

const HOOK = 'block-raw-search';
const RAW_CMDS = new Set(['grep', 'rg', 'ag', 'ack', 'find']);

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root, config } = ctx;

  if (sourceDirs(config).length === 0) process.exit(0);

  const payload = readPayload();
  const tool = payload?.tool_name;
  if (!tool) process.exit(0);

  let rawCmd = '';
  let targets = [];

  if (tool === 'Grep') {
    rawCmd = 'Grep';
    const p = payload?.tool_input?.path;
    targets = [p && p.length ? p : '.'];
  } else if (tool === 'Bash') {
    const cmd = (payload?.tool_input?.command ?? '').trim();
    if (!cmd) process.exit(0);
    const head = cmd.split(/\s+/, 1)[0];
    if (!RAW_CMDS.has(head)) process.exit(0);
    rawCmd = head;
    // Naive token split; flags get filtered downstream.
    targets = cmd.split(/\s+/).slice(1);
  } else {
    process.exit(0);
  }

  const hit = targets.some((t) => t && !t.startsWith('-') && inSource(t, root, config));
  if (!hit) process.exit(0);

  blockOrWarn(
    HOOK,
    config,
    `Raw search (${rawCmd}) over source paths detected. Use the code-knowledge layer at ${root}/${indexDir(config)} (sqlite3 ... 'SELECT ...') or a pn_* query skill instead.`,
  );
} catch {
  /* never block on internal error */
}
process.exit(0);
