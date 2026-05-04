#!/usr/bin/env node
/**
 * run-test-stubs-progress.mjs
 *
 * Runs `vitest run --no-file-parallelism tests/routes/auto` and renders a live
 * progress bar with ETA on a single terminal line. Parses vitest's per-file
 * "✓ tests/routes/auto/...test.ts (...)" lines as completion signals.
 *
 * Output line format:
 *   [████████░░░░░░░░░░░░] 73/533 13.7%  elapsed 03:12  ETA 19:48  last: api/foo
 *
 * On completion, prints the final vitest summary block.
 *
 * Usage:
 *   node scripts/run-test-stubs-progress.mjs               # full 533 serial
 *   node scripts/run-test-stubs-progress.mjs --filter ace  # subset by path substring
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STUB_DIR = path.join(ROOT, 'tests/routes/auto');

const argv = process.argv.slice(2);
const FILTER = argv.find((a, i) => argv[i - 1] === '--filter') ?? null;

// ── Discover total count for progress denominator ────────────────────────────
function walkTests(dir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTests(full));
    else if (e.isFile() && e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const allTests = walkTests(STUB_DIR);
const targets = FILTER ? allTests.filter(t => t.includes(FILTER)) : allTests;
const total = targets.length;

if (total === 0) {
  console.error(`No test files under ${STUB_DIR}${FILTER ? ` matching "${FILTER}"` : ''}`);
  process.exit(1);
}

console.log(`▶ Running ${total} test stubs (serial, --no-file-parallelism)${FILTER ? ` filter=${FILTER}` : ''}`);
console.log(`  ${STUB_DIR}\n`);

// ── Spawn vitest ─────────────────────────────────────────────────────────────
const args = ['vitest', 'run', '--no-file-parallelism', '--reporter=basic'];
if (FILTER) {
  args.push(STUB_DIR);  // Let vitest config glob handle inclusion; we filter by detecting matching filenames
} else {
  args.push(STUB_DIR);
}

const child = spawn('npx', args, {
  cwd: ROOT,
  shell: true,
  env: { ...process.env, FORCE_COLOR: '0' },  // strip ANSI so our regex catches the lines cleanly
});

// ── Progress state ───────────────────────────────────────────────────────────
const startMs = Date.now();
let completed = 0;
let passed = 0;
let failed = 0;
let lastFile = '';
let summaryStart = false;
const summaryLines = [];

// vitest --reporter=basic with FORCE_COLOR=0 emits one of:
//   ✓ tests/routes/auto/path/x.test.ts (4 tests | 3 skipped) 1234ms
//   ✗ tests/routes/auto/path/x.test.ts (...)
//   ❯ tests/routes/auto/path/x.test.ts (...)
const RE_FILE_DONE = /^\s*[✓✗❯×]\s+(tests\/routes\/auto\/\S+\.test\.ts)\s+\(/;

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function bar(frac, width = 24) {
  const filled = Math.round(frac * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

let lastPaintMs = 0;
function paint(force = false) {
  const now = Date.now();
  if (!force && now - lastPaintMs < 200) return;  // throttle ≥200ms
  lastPaintMs = now;

  const frac = completed / total;
  const elapsedSec = (now - startMs) / 1000;
  const etaSec = completed > 0 ? (elapsedSec / completed) * (total - completed) : 0;
  const pct = (frac * 100).toFixed(1).padStart(5);
  const lastShort = lastFile ? lastFile.replace(/^tests\/routes\/auto\//, '').replace(/\.test\.ts$/, '') : '';
  const truncated = lastShort.length > 38 ? '…' + lastShort.slice(-37) : lastShort.padEnd(38);
  const passSeg = passed > 0 ? ` \x1b[32m${passed}✓\x1b[0m` : '';
  const failSeg = failed > 0 ? ` \x1b[31m${failed}✗\x1b[0m` : '';

  process.stdout.write(
    `\r[${bar(frac)}] ${String(completed).padStart(3)}/${total} ${pct}%  elapsed ${fmt(elapsedSec)}  ETA ${fmt(etaSec)}${passSeg}${failSeg}  ${truncated}`
  );
}

// ── Stream parser ────────────────────────────────────────────────────────────
let stdoutBuf = '';
function consumeLines(chunk) {
  stdoutBuf += chunk.toString();
  let nl;
  while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
    const line = stdoutBuf.slice(0, nl).replace(/\r$/, '');
    stdoutBuf = stdoutBuf.slice(nl + 1);

    // Detect summary block start (vitest prints "Test Files" near the end)
    if (line.includes('Test Files') || line.includes('Tests ') || line.includes('Duration')) {
      summaryStart = true;
    }
    if (summaryStart) {
      summaryLines.push(line);
      continue;
    }

    const m = line.match(RE_FILE_DONE);
    if (m) {
      completed++;
      lastFile = m[1].replace(/\\/g, '/');
      const status = line.trim()[0];
      if (status === '✓') passed++;
      else if (status === '✗' || status === '×' || status === '❯') failed++;
      paint();
    }
  }
}

child.stdout.on('data', consumeLines);
child.stderr.on('data', consumeLines);

// Force a paint every second so ETA updates even when output is silent
const ticker = setInterval(() => paint(), 1000);

child.on('close', (code) => {
  clearInterval(ticker);
  paint(true);
  process.stdout.write('\n\n');
  if (summaryLines.length > 0) {
    console.log(summaryLines.filter(l => l.trim()).join('\n'));
  }
  console.log(`\n▶ Final: ${completed}/${total} files completed (${passed}✓ ${failed}✗) — elapsed ${fmt((Date.now() - startMs) / 1000)}`);
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  clearInterval(ticker);
  console.error('\n✗ vitest failed to start:', err.message);
  process.exit(1);
});
