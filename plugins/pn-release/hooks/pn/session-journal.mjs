#!/usr/bin/env node
// session-journal.mjs
// Purpose: appends a one-line summary of the tool event to
//          .pn/journal/<YYYY-MM-DD>.md. Append-only; creates the file
//          with frontmatter on first write of the day. Per-machine session
//          telemetry; gitignored alongside other session logs in .pn/.
// Event:   Stop (preferred) or PostToolUse fallback.
// Exit:    0 always.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrap, readPayload, gitBranch, gitUserName } from './_common.mjs';

try {
  const ctx = bootstrap();
  if (!ctx) process.exit(0);
  const { root } = ctx;

  const payload = readPayload();
  const tool = payload?.tool_name ?? '?';
  const event = payload?.hook_event_name ?? '?';
  const target = payload?.tool_input?.file_path ?? '-';

  const branch = gitBranch(root) || '?';
  const author = gitUserName() || process.env.USER || process.env.USERNAME || 'unknown';

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tz = -now.getTimezoneOffset();
  const tzSign = tz >= 0 ? '+' : '-';
  const tzAbs = Math.abs(tz);
  const tzStr = `${tzSign}${pad(Math.floor(tzAbs / 60))}${pad(tzAbs % 60)}`;
  const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tzStr}`;

  const journalDir = join(root, '.pn', 'journal');
  const journalFile = join(journalDir, `${date}.md`);
  mkdirSync(journalDir, { recursive: true });

  if (!existsSync(journalFile)) {
    const header =
      `---\n` +
      `date: ${date}\n` +
      `author: ${author}\n` +
      `kind: session-journal\n` +
      `---\n\n` +
      `# Session journal ${date}\n\n`;
    writeFileSync(journalFile, header);
  }

  appendFileSync(
    journalFile,
    `- ${ts} | event=${event} | tool=${tool} | target=${target} | branch=${branch}\n`,
  );
} catch {
  /* never block */
}
process.exit(0);
