/**
 * Surgical .env editing: rewrite only the keys we own, leaving every other
 * line — including comments, blank lines and ordering — byte-identical.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Values made only of these characters are safe to write unquoted.
const BARE_SAFE = /^[A-Za-z0-9_./:@=+-]*$/;

/**
 * Quote a value so dotenv reads it back byte-identical.
 *
 * Single quotes are the only fully literal form: dotenv strips the surrounding
 * quotes and performs no unescaping at all. Double quotes are unusable here
 * because dotenv expands `\n`/`\r` but leaves `\"` and `\\` in place, so an
 * escaped value would round-trip corrupted.
 */
function formatValue(value, key) {
  const str = String(value);
  if (str === '' || BARE_SAFE.test(str)) return str;
  if (!str.includes("'")) return `'${str}'`;
  throw new Error(
    `Cannot safely write ${key ?? 'value'} to the env file: it contains a single quote, ` +
      'which dotenv cannot represent losslessly. Set this value by hand.',
  );
}

/** Matches `KEY=`, `export KEY=` and commented-out `# KEY=` forms. */
function keyPattern(key) {
  return new RegExp(`^(\\s*)(#\\s*)?(export\\s+)?${key}\\s*=`);
}

/**
 * Returns the set of keys that already appear (uncommented) in the file.
 * Used to decide whether to touch an optional key like DATABASE_URL.
 */
export function activeKeys(contents) {
  const keys = new Set();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

/**
 * Upsert `updates` into env-file `contents`.
 *
 * An existing uncommented assignment is replaced in place. If a key exists only
 * as a comment it is left alone and the real value is appended, so the original
 * commented-out reference survives as documentation. Unknown keys are appended
 * in a clearly marked block.
 */
export function upsertEnvVars(contents, updates) {
  const lines = contents.split(/\r?\n/);
  const applied = new Set();

  for (const [key, value] of Object.entries(updates)) {
    const pattern = keyPattern(key);
    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i]);
      if (!match || match[2]) continue; // no match, or it's commented out
      lines[i] =
        `${match[1]}${match[3] ?? ''}${key}=${formatValue(value, key)}`;
      applied.add(key);
      break;
    }
  }

  const missing = Object.entries(updates).filter(([key]) => !applied.has(key));
  if (missing.length > 0) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '')
      lines.pop();
    lines.push(
      '',
      '# --- Render dev database (managed by scripts/render-db) ---',
    );
    for (const [key, value] of missing)
      lines.push(`${key}=${formatValue(value, key)}`);
  }

  const result = lines.join('\n');
  return result.endsWith('\n') ? result : `${result}\n`;
}

/** Copy the env file aside before mutating it. Returns the backup path, or null if there was nothing to back up. */
export function backupEnvFile(path, stamp) {
  if (!existsSync(path)) return null;
  const backupPath = `${path}.backup-${stamp}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

export function writeEnvUpdates(path, updates, { stamp }) {
  const existed = existsSync(path);
  const backupPath = existed ? backupEnvFile(path, stamp) : null;
  const contents = existed ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, upsertEnvVars(contents, updates), 'utf8');
  return { backupPath, created: !existed };
}

export function readEnvFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
