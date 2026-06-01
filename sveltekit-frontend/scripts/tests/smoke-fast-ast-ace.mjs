#!/usr/bin/env node
/**
 * smoke-fast-ast-ace.mjs
 *
 * Smoke test for the fast AST / Graphify-style Copilot index + ACE fallback lane.
 *
 * Checks:
 *   1. docs/graph/codebase-graph.json exists and has files
 *   2. Redis code:index:manifest exists (skipped if --no-redis)
 *   3. At least one code:index:tag:* key exists (skipped if --no-redis)
 *   4. ACE fast-AST score cap is ≤ 0.07 (static read of context-assembler.ts)
 *   5. Manifest mode === 'fast-ast'
 *   6. Both .vscode/tasks.json files parse as valid JSONC
 *
 * Usage:
 *   node scripts/tests/smoke-fast-ast-ace.mjs
 *   node scripts/tests/smoke-fast-ast-ace.mjs --no-redis   # skip Redis checks
 *   node scripts/tests/smoke-fast-ast-ace.mjs --run-index  # run indexer first
 */

import { readFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const NO_REDIS  = process.argv.includes('--no-redis');
const RUN_INDEX = process.argv.includes('--run-index');

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0, failed = 0, skipped = 0;

function pass(label, detail = '') {
  console.log(`  ${c.green('✓')} ${label}${detail ? c.dim('  ' + detail) : ''}`);
  passed++;
}
function fail(label, detail = '') {
  console.log(`  ${c.red('✗')} ${label}${detail ? '  ' + c.red(detail) : ''}`);
  failed++;
}
function skip(label, reason = '') {
  console.log(`  ${c.yellow('○')} ${label}${reason ? c.dim('  [' + reason + ']') : ''}`);
  skipped++;
}

// ── raw TCP Redis helper ────────────────────────────────────────────────────

function redisCmd(args) {
  return new Promise((resolve) => {
    const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
    const sock = createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let buf = '';
    sock.setTimeout(3000);
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
    sock.on('error', () => resolve(null));
    sock.on('data', d => { buf += d.toString(); });
    sock.on('end', () => {
      const lines = buf.split('\r\n');
      // Simple RESP parse: first line type marker, then value
      const first = lines[0] ?? '';
      if (first.startsWith('+')) { resolve(first.slice(1)); return; }
      if (first.startsWith(':')) { resolve(parseInt(first.slice(1), 10)); return; }
      if (first.startsWith('$')) {
        const len = parseInt(first.slice(1), 10);
        resolve(len === -1 ? null : lines[1] ?? null);
        return;
      }
      if (first.startsWith('*')) {
        const count = parseInt(first.slice(1), 10);
        const items = [];
        for (let i = 0; i < count; i++) {
          const lenLine = lines[1 + i * 2] ?? '';
          const len = parseInt(lenLine.slice(1), 10);
          items.push(len === -1 ? null : lines[2 + i * 2] ?? null);
        }
        resolve(items);
        return;
      }
      resolve(buf.trim() || null);
    });
    // Build RESP command
    const cmd = `*${args.length}\r\n` + args.map(a => `$${String(a).length}\r\n${a}\r\n`).join('');
    sock.write(cmd);
    sock.end();
  });
}

// ── Step 0: optionally run indexer ─────────────────────────────────────────

if (RUN_INDEX) {
  console.log(c.cyan('\n▶ Running fast AST indexer first...'));
  const result = spawnSync(process.execPath, ['scripts/index-codebase-fast.mjs', '--skip-redis'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.status !== 0) {
    console.log(c.red('  Indexer exited non-zero — continuing smoke test anyway'));
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log(c.bold('\n=== Fast AST / ACE Copilot Smoke Test ===\n'));

// 1. codebase-graph.json exists
const GRAPH_JSON = path.join(ROOT, 'docs/graph/codebase-graph.json');
if (!existsSync(GRAPH_JSON)) {
  fail('codebase-graph.json exists', 'not found — run npm run index:codebase:fast');
} else {
  let graph;
  try { graph = JSON.parse(readFileSync(GRAPH_JSON, 'utf8')); } catch { graph = null; }
  if (!graph || !Array.isArray(graph.files) || graph.files.length === 0) {
    fail('codebase-graph.json has files', 'parsed but files[] is empty or missing');
  } else {
    pass('codebase-graph.json exists', `${graph.files.length} files, mode=${graph.mode ?? 'unknown'}`);
  }
}

// 2 & 3. Redis checks
if (NO_REDIS) {
  skip('Redis code:index:manifest exists', '--no-redis');
  skip('code:index:tag:* keys exist', '--no-redis');
  skip('Manifest mode === fast-ast', '--no-redis');
} else {
  const manifest = await redisCmd(['GET', 'code:index:manifest']);
  if (manifest == null) {
    fail('Redis code:index:manifest exists', 'key missing or Redis unreachable — run npm run index:codebase:fast');
    skip('code:index:tag:* keys exist', 'manifest missing');
    skip('Manifest mode === fast-ast', 'manifest missing');
  } else {
    pass('Redis code:index:manifest exists');

    // 3. tag keys
    const tagKeys = await redisCmd(['KEYS', 'code:index:tag:*']);
    if (!Array.isArray(tagKeys) || tagKeys.length === 0) {
      fail('code:index:tag:* keys exist', 'no tag keys found in Redis');
    } else {
      pass('code:index:tag:* keys exist', `${tagKeys.length} tag key(s)`);
    }

    // 5. manifest mode
    let parsed;
    try { parsed = JSON.parse(manifest); } catch { parsed = null; }
    if (!parsed) {
      fail('Manifest mode === fast-ast', 'manifest JSON parse failed');
    } else if (parsed.mode !== 'fast-ast') {
      fail('Manifest mode === fast-ast', `mode was '${parsed.mode}'`);
    } else {
      pass('Manifest mode === fast-ast', `fileCount=${parsed.fileCount ?? '?'}`);
    }
  }
}

// 4. Static: ACE score cap ≤ 0.07
const ASSEMBLER =
  path.join(ROOT, 'src/lib/server/features/ai/ace/context-assembler.ts');
// Legacy path kept as fallback for repos that haven't migrated the barrel yet
const ASSEMBLER_LEGACY = path.join(ROOT, 'src/lib/server/ace/context-assembler.ts');
const assemblerPath = existsSync(ASSEMBLER) ? ASSEMBLER
  : existsSync(ASSEMBLER_LEGACY) ? ASSEMBLER_LEGACY
  : null;
if (!assemblerPath) {
  skip('ACE FAST_AST_SCORE_CAP ≤ 0.07', 'context-assembler.ts not found');
} else {
  const src = readFileSync(assemblerPath, 'utf8');
  const match = src.match(/FAST_AST_SCORE_CAP\s*=\s*([\d.]+)/);
  if (!match) {
    fail('ACE FAST_AST_SCORE_CAP ≤ 0.07', 'constant not found in context-assembler.ts');
  } else {
    const cap = parseFloat(match[1]);
    if (cap > 0.07) {
      fail('ACE FAST_AST_SCORE_CAP ≤ 0.07', `cap is ${cap} — must not exceed 0.07 to stay below Qdrant scores`);
    } else {
      pass('ACE FAST_AST_SCORE_CAP ≤ 0.07', `cap = ${cap}`);
    }
  }
}

// 6. Both .vscode/tasks.json files parse as valid JSONC
try {
  const { parse } = await import('jsonc-parser');
  const tasksJsonPaths = [
    path.resolve(ROOT, '..', '.vscode', 'tasks.json'),       // repo-root
    path.resolve(ROOT, '.vscode', 'tasks.json'),             // sveltekit-frontend
  ];
  let checked = 0, errorsTotal = 0;
  for (const p of tasksJsonPaths) {
    if (!existsSync(p)) continue;
    checked++;
    const errs = [];
    parse(readFileSync(p, 'utf8'), errs, { allowTrailingComma: true, disallowComments: false });
    if (errs.length) {
      errorsTotal += errs.length;
      fail('.vscode/tasks.json JSONC valid', `${path.basename(path.dirname(path.dirname(p)))}/.vscode/tasks.json: ${errs.length} error(s)`);
    }
  }
  if (checked === 0) {
    skip('.vscode/tasks.json JSONC valid', 'no tasks.json files found');
  } else if (errorsTotal === 0) {
    pass('.vscode/tasks.json JSONC valid', `${checked} file(s) checked`);
  }
} catch (e) {
  skip('.vscode/tasks.json JSONC valid', `jsonc-parser not available: ${e.message}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────

const total = passed + failed + skipped;
console.log(
  `\n${c.bold('Results:')} ${c.green(`${passed} passed`)}` +
  (skipped ? `, ${c.yellow(`${skipped} skipped`)}` : '') +
  (failed ? `, ${c.red(`${failed} failed`)}` : '') +
  `  (${total} total)\n`
);

if (failed > 0) {
  console.log(c.yellow('Hint: run  npm run index:codebase:fast  then retry\n'));
  process.exit(1);
}
