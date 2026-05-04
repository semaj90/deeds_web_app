/**
 * bounded-output.mjs — shared helper for capping stdout/stderr in audit/Gemma4 tasks.
 *
 * VS Code's chat/task UI serializes terminal output. Multi-MB outputs (deep audits,
 * full directory plans, cold Gemma4 responses) cause "RangeError: Invalid string length"
 * when the chat session is saved. This helper:
 *
 *   1. Caps inline stdout to MAX_STDOUT_CHARS (default 12000 chars / ~200 lines)
 *   2. Optionally tees the full output to a log file
 *   3. Prints a "truncated N chars — see <path>" footer when bounded
 *
 * Usage:
 *
 *   import { printBounded, teeToFile, summarize } from './bounded-output.mjs';
 *
 *   // Cap inline output
 *   printBounded(hugeMarkdown);
 *
 *   // Write full output to log + print summary
 *   await teeToFile('logs/dir-audit-latest.log', fullOutput);
 *   console.log(summarize(fullOutput, { lines: 30, file: 'logs/dir-audit-latest.log' }));
 *
 * Env overrides:
 *   BOUNDED_OUTPUT_MAX_CHARS=24000 npm run audit:dirs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve }         from 'node:path';

export const MAX_STDOUT_CHARS = parseInt(
  process.env.BOUNDED_OUTPUT_MAX_CHARS || '12000',
  10
);

/**
 * Print text, capped at MAX_STDOUT_CHARS. Returns true if truncated.
 */
export function printBounded(text, opts = {}) {
  const { file = null, label = 'output' } = opts;
  const s = String(text ?? '');
  if (s.length <= MAX_STDOUT_CHARS) {
    process.stdout.write(s);
    if (!s.endsWith('\n')) process.stdout.write('\n');
    return false;
  }
  process.stdout.write(s.slice(0, MAX_STDOUT_CHARS));
  const truncated = s.length - MAX_STDOUT_CHARS;
  const tail = file
    ? `\n\n... truncated ${truncated.toLocaleString()} chars from ${label}. Full content: ${file}\n`
    : `\n\n... truncated ${truncated.toLocaleString()} chars from ${label}. Set BOUNDED_OUTPUT_MAX_CHARS=${s.length} to see all.\n`;
  process.stdout.write(tail);
  return true;
}

/**
 * Write full content to a log file (creates dirs as needed). Synchronous so callers
 * can chain `console.log(summarize(..., { file: path }))` immediately.
 */
export function teeToFile(filePath, content) {
  const abs = resolve(filePath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, String(content ?? ''), 'utf8');
  return abs;
}

/**
 * Build a short summary block: first/last N lines + line/char count + log path.
 */
export function summarize(text, opts = {}) {
  const { lines = 30, file = null, label = 'output' } = opts;
  const s = String(text ?? '');
  const all = s.split('\n');
  const total = all.length;
  const chars = s.length;

  if (total <= lines * 2) {
    return [
      `--- ${label} (${total} lines, ${chars.toLocaleString()} chars) ---`,
      s,
      file ? `Full log: ${file}` : '',
    ].filter(Boolean).join('\n');
  }

  const head = all.slice(0, lines).join('\n');
  const tail = all.slice(-lines).join('\n');
  return [
    `--- ${label} (${total} lines, ${chars.toLocaleString()} chars) ---`,
    head,
    `... [omitted ${total - lines * 2} middle lines] ...`,
    tail,
    file ? `\nFull log: ${file}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Convenience: write full content to logFile, print bounded summary, return path.
 */
export function writeAndSummarize(logFile, content, opts = {}) {
  const abs = teeToFile(logFile, content);
  console.log(summarize(content, { ...opts, file: abs }));
  return abs;
}
