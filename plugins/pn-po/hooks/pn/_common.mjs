// pn-workflow hooks - shared helpers (Node.js, cross-platform).
// Purpose: read .pn/settings.json, parse hook stdin JSON, locate repo root, helpers.
// Platform: any (Node 18+). Optional dependency: sqlite3 binary on PATH for index access.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Walk up from cwd looking for .pn/settings.json. Returns absolute repo root or null.
 */
export function findRoot(start = process.cwd()) {
  let d = start;
  while (d && d !== dirname(d)) {
    if (existsSync(join(d, '.pn', 'settings.json'))) return d;
    d = dirname(d);
  }
  return null;
}

/**
 * Load .pn/settings.json from the given root. Returns parsed object or null on error.
 */
export function loadConfig(root) {
  if (!root) return null;
  const p = join(root, '.pn', 'settings.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Read JSON hook payload from stdin synchronously. Returns parsed object or {} on empty/invalid.
 */
export function readPayload() {
  if (process.stdin.isTTY) return {};
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function hookMode(config) {
  return config?.hooks?.mode ?? 'warn';
}

export function hooksEnabled(config) {
  return config?.hooks?.enabled !== false;
}

/**
 * Configured source directories. Supports `stack.source_directories` (array) or
 * `stack.source_directory` (string).
 */
export function sourceDirs(config) {
  const arr = config?.stack?.source_directories;
  if (Array.isArray(arr)) return arr.filter(Boolean);
  const one = config?.stack?.source_directory;
  return one ? [one] : [];
}

export function testPatterns(config) {
  return Array.isArray(config?.tests?.patterns) ? config.tests.patterns : [];
}

export function testsDir(config) {
  return config?.tests?.directory ?? '';
}

export function indexDir(config) {
  return config?.code_knowledge?.path ?? '.pn/index/';
}

/**
 * Is the given path under one of the configured source dirs?
 */
export function inSource(target, root, config) {
  if (!target) return false;
  const absTarget = isAbsolute(target) ? target : join(root, target);
  for (const d of sourceDirs(config)) {
    const absDir = (isAbsolute(d) ? d : join(root, d)).replace(/[\\/]+$/, '');
    if (absTarget === absDir) return true;
    if (absTarget.startsWith(absDir + sep) || absTarget.startsWith(absDir + '/')) return true;
  }
  return false;
}

/**
 * Repo-relative path for a target.
 */
export function relPath(target, root) {
  if (!target) return '';
  if (!isAbsolute(target)) return target;
  const prefix = root.replace(/[\\/]+$/, '') + sep;
  const altPrefix = root.replace(/[\\/]+$/, '') + '/';
  if (target.startsWith(prefix)) return target.slice(prefix.length);
  if (target.startsWith(altPrefix)) return target.slice(altPrefix.length);
  return target;
}

export function warn(hookName, msg) {
  process.stderr.write(`pn-hook[${hookName}] warn: ${msg}\n`);
}

/**
 * Block with exit 2 in 'block' mode; warn-and-exit-0 otherwise.
 */
export function blockOrWarn(hookName, config, msg) {
  if (hookMode(config) === 'block') {
    process.stderr.write(`pn-hook[${hookName}] BLOCK: ${msg}\n`);
    process.exit(2);
  }
  warn(hookName, msg);
  process.exit(0);
}

/**
 * Run sqlite3 binary with given SQL. Returns stdout string or null on failure / missing binary.
 */
export function sqliteQuery(dbPath, sql, opts = {}) {
  const args = opts.readonly ? ['-readonly', dbPath, sql] : [dbPath, sql];
  const r = spawnSync('sqlite3', args, { encoding: 'utf8', input: opts.input });
  if (r.error || r.status !== 0) return null;
  return (r.stdout ?? '').trim();
}

export function sqliteExec(dbPath, sql) {
  const r = spawnSync('sqlite3', [dbPath], { encoding: 'utf8', input: sql });
  return !(r.error || r.status !== 0);
}

export function hasSqlite() {
  const r = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

export function gitBranch(root) {
  const r = spawnSync('git', ['-C', root, 'branch', '--show-current'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return '';
  return (r.stdout ?? '').trim();
}

export function gitUserName() {
  const r = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return '';
  return (r.stdout ?? '').trim();
}

/**
 * Convert basename-glob pattern (e.g. *Test.php, *.spec.ts) to a RegExp anchored to the full string.
 */
export function globToRegExp(pattern) {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + re + '$');
}

export function matchesAny(name, patterns) {
  return patterns.some((p) => globToRegExp(p).test(name));
}

/**
 * Standard skill bootstrap: returns { root, config } or null if the hook should exit 0 silently.
 */
export function bootstrap() {
  const root = findRoot();
  if (!root) return null;
  const config = loadConfig(root);
  if (!config) return null;
  if (!hooksEnabled(config)) return null;
  return { root, config };
}

/**
 * Safe file mtime in seconds, or 0 if unavailable.
 */
export function mtimeSeconds(absPath) {
  try {
    return Math.floor(statSync(absPath).mtimeMs / 1000);
  } catch {
    return 0;
  }
}

export { basename };
