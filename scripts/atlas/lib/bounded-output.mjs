/**
 * Bounded output helper — keeps VS Code chat / terminal buffers usable when
 * audit scripts dump multi-MB markdown plans.
 *
 * Usage:
 *   import { writeBoundedOutput } from './lib/bounded-output.mjs';
 *
 *   writeBoundedOutput({
 *     label: 'deep-directory-audit',
 *     text:  giantPlanMarkdown,
 *     root:  ROOT,
 *     maxChars: 12_000,            // optional override
 *   });
 *
 * Behavior:
 *   - Always writes the full text to logs/task-output/{label}-{ts}.log
 *   - If text ≤ maxChars: prints full text to stdout
 *   - If text  > maxChars: prints first maxChars + truncation notice + file path
 *
 * Set MAX_STDOUT_CHARS env to change the global default.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path                          from 'node:path';

export const DEFAULT_MAX_STDOUT_CHARS = Number(process.env.MAX_STDOUT_CHARS ?? 12_000);

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function ensureLogDir(root = process.cwd()) {
  const dir = path.join(root, 'logs', 'task-output');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write text to a logfile and bounded stdout.
 *
 * @param {object}   opts
 * @param {string}   opts.label       — short slug for the logfile name
 * @param {string}   opts.text        — content to write
 * @param {string}   [opts.root]      — repo root (default: cwd)
 * @param {number}   [opts.maxChars]  — stdout cap (default: 12000 or MAX_STDOUT_CHARS env)
 * @param {boolean}  [opts.silent]    — never print to stdout, just write file + path
 * @returns {string}                  — absolute path to the written logfile
 */
export function writeBoundedOutput({
  label,
  text,
  root     = process.cwd(),
  maxChars = DEFAULT_MAX_STDOUT_CHARS,
  silent   = false,
}) {
  const dir  = ensureLogDir(root);
  const file = path.join(dir, `${label}-${timestampSlug()}.log`);
  writeFileSync(file, text, 'utf8');

  if (silent) {
    console.log(`📝 Output → ${file} (${text.length.toLocaleString()} chars)`);
    return file;
  }

  if (text.length <= maxChars) {
    console.log(text);
  } else {
    console.log(text.slice(0, maxChars));
    console.log(`\n… truncated ${(text.length - maxChars).toLocaleString()} chars.`);
    console.log(`📝 Full output → ${file}`);
  }
  return file;
}

/**
 * Print a short summary, write the full body to logfile.
 * Use when the caller wants a one-line confirmation visible in the VS Code
 * terminal but still preserve the full output for inspection.
 */
export function writeSummary({
  label,
  summaryLines,        // string[]
  fullText,
  root = process.cwd(),
}) {
  const dir  = ensureLogDir(root);
  const file = path.join(dir, `${label}-${timestampSlug()}.log`);
  writeFileSync(file, fullText, 'utf8');
  for (const line of summaryLines) console.log(line);
  console.log(`📝 Full output → ${file}`);
  return file;
}
