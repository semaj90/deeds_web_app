#!/usr/bin/env node

/**
 * Analyze a large problems log and print the top 10 issues.
 *
 * Prioritizes TypeScript error codes (TS1234). Falls back to grouping by
 * normalized message text for non-TS lines.
 *
 * Usage:
 *   node scripts/analyze-problems.js <path-to-log>
 *
 * Example:
 *   node scripts/analyze-problems.js sveltekit-frontend/logs/tsc-full.log
 */

import fs from 'fs';
import path from 'path';

if (process.argv.length < 3) {
  console.error('Usage: node scripts/analyze-problems.js <log-file>');
  process.exit(1);
}

const logPath = process.argv[2];
if (!fs.existsSync(logPath)) {
  console.error(`Log file not found: ${logPath}`);
  process.exit(1);
}

const text = fs.readFileSync(logPath, 'utf8');

// Maps
const codeCounts = new Map(); // TS code -> count
const codeSamples = new Map(); // TS code -> sample message
const messageCounts = new Map(); // normalized message -> count

// Normalize a message for grouping: trim, remove file/line prefixes
function normalizeMessage(line) {
  let s = line.trim();
  // Drop file:line:col prefixes like: path.ts(12,5): error TS1234: ...
  s = s.replace(/^[^:]+:\s*/, '');
  // Drop vscode-style prefixes like: src/file.ts:12:5 - error TS1111: ...
  s = s.replace(/^[^\-]+-\s*/, '');
  // Collapse extra spaces
  s = s.replace(/\s+/g, ' ');
  // Truncate to a stable signature
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

// Try to parse TS error codes and messages
const lines = text.split(/\r?\n/);
for (const line of lines) {
  if (!line) continue;

  // Common tsc patterns
  // Example: src/app.ts(1,1): error TS2304: Cannot find name 'X'.
  // Example: error TS1234: Some message
  const tsMatch = line.match(/\bTS(\d{3,6})\b[:]?\s*(.*)$/);
  if (tsMatch) {
    const code = `TS${tsMatch[1]}`;
    const msg = tsMatch[2] ? tsMatch[2] : line;
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
    if (!codeSamples.has(code)) codeSamples.set(code, normalizeMessage(msg));
    continue;
  }

  // Generic error/warning fallback
  if (/\b(error|warning)\b/i.test(line)) {
    const key = normalizeMessage(line);
    messageCounts.set(key, (messageCounts.get(key) || 0) + 1);
  }
}

function topEntries(map, n = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const topCodes = topEntries(codeCounts, 10);
console.log('Top 10 TypeScript error codes:');
if (topCodes.length === 0) {
  console.log('(none found)');
} else {
  for (const [code, count] of topCodes) {
    const sample = codeSamples.get(code) || '';
    console.log(`- ${code}: ${count} occurrences | e.g., ${sample}`);
  }
}

const topMsgs = topEntries(messageCounts, 10);
console.log('\nTop 10 other problems:');
if (topMsgs.length === 0) {
  console.log('(none found)');
} else {
  for (const [msg, count] of topMsgs) {
    console.log(`- ${count}x ${msg}`);
  }
}

// Optional: per-file breakdown for selected codes
// Flags:
//   --by-file             include per-file top offenders per code
//   --codes=TS1005,TS1128 analyze these specific codes; defaults to top codes

function parseArgs(argv) {
  const flags = new Set();
  const kv = {};
  for (const a of argv.slice(3)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        kv[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags.add(a.slice(2));
      }
    }
  }
  return { flags, kv };
}

function analyzeTopFilesByCode(text, codes, limitPerCode = 10) {
  const perCodeFileCounts = new Map(); // code -> Map(file->count)
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    // Pattern 1: src/file.ts:12:5 - error TS1234: Message
    let m = line.match(/^(?<file>[^:]+?):(?<line>\d+):(?<col>\d+)\s*-\s*error\s+TS(?<code>\d{3,6})\b/i);
    // Pattern 2: src/file.ts(12,5): error TS1234: Message
    if (!m) m = line.match(/^(?<file>[^()]+?)\((?<line>\d+),(?<col>\d+)\):\s*error\s+TS(?<code>\d{3,6})\b/i);
    if (!m) continue;
    const code = `TS${m.groups.code}`;
    if (!codes.has(code)) continue;
    let file = m.groups.file.trim();
    // Normalize Windows backslashes to forward slashes for grouping
    file = file.replace(/\\/g, '/');
    if (!perCodeFileCounts.has(code)) perCodeFileCounts.set(code, new Map());
    const fileMap = perCodeFileCounts.get(code);
    fileMap.set(file, (fileMap.get(file) || 0) + 1);
  }
  // Convert to sorted arrays
  const out = [];
  for (const [code, fileMap] of perCodeFileCounts) {
    const topFiles = [...fileMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitPerCode);
    out.push([code, topFiles]);
  }
  // Sort codes by total counts desc for display stability
  out.sort((a, b) => {
    const at = a[1].reduce((s, [, c]) => s + c, 0);
    const bt = b[1].reduce((s, [, c]) => s + c, 0);
    return bt - at;
  });
  return out;
}

const { flags, kv } = parseArgs(process.argv);
if (flags.has('by-file')) {
  let selectedCodes = new Set();
  if (kv.codes) {
    kv.codes.split(',').map((s) => s.trim()).filter(Boolean).forEach((c) => selectedCodes.add(c));
  } else {
    // Default to the discovered top codes
    for (const [code] of topCodes) selectedCodes.add(code);
  }
  const topByFile = analyzeTopFilesByCode(text, selectedCodes, 10);
  if (topByFile.length > 0) {
    console.log('\nTop files by code:');
    for (const [code, files] of topByFile) {
      console.log(`\n${code}:`);
      for (const [file, count] of files) {
        console.log(`- ${count}x ${file}`);
      }
    }
  }
}
