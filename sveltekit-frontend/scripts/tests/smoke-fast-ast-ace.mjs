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

// ── .env loader (so REDIS_PASSWORD is available when run outside npm scripts) ─
for (const envCandidate of [
  path.resolve(ROOT, '.env'),
  path.resolve(ROOT, '..', '.env'),
]) {
  if (existsSync(envCandidate)) {
    for (const line of readFileSync(envCandidate, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

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

// ── Redis helper — docker-exec preferred, raw TCP fallback ─────────────────
// Parses a complete RESP response starting at lines[offset], returns [value, nextOffset]
function parseResp(lines, offset) {
  const first = lines[offset] ?? '';
  if (first.startsWith('+')) return [first.slice(1), offset + 1];
  if (first.startsWith('-')) return [null, offset + 1];
  if (first.startsWith(':')) return [parseInt(first.slice(1), 10), offset + 1];
  if (first.startsWith('$')) {
    const len = parseInt(first.slice(1), 10);
    return [len === -1 ? null : (lines[offset + 1] ?? null), offset + 2];
  }
  if (first.startsWith('*')) {
    const count = parseInt(first.slice(1), 10);
    const items = [];
    let cur = offset + 1;
    for (let i = 0; i < count; i++) {
      const [v, next] = parseResp(lines, cur);
      items.push(v);
      cur = next;
    }
    return [items, cur];
  }
  return [null, offset + 1];
}

// Docker-exec helper — most reliable on Windows where TCP auth can race
function redisDockerExec(args) {
  return new Promise((resolve) => {
    const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
    const passArgs = REDIS_PASSWORD ? ['-a', REDIS_PASSWORD, '--no-auth-warning'] : [];
    const result = spawnSync('docker', ['exec', 'legal-ai-redis', 'redis-cli', ...passArgs, ...args.map(String)], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status !== 0 || result.error) { resolve(null); return; }
    const out = (result.stdout || '').trimEnd();
    // Handle KEYS output (one key per line)
    if (args[0] === 'KEYS') {
      const keys = out.split('\n').filter(Boolean);
      resolve(keys.length ? keys : null);
      return;
    }
    // GET: return string or null
    resolve(out === '' || out === '(nil)' ? null : out);
  });
}

function redisCmd(args) {
  // Try docker-exec first (bulletproof on Windows/WSL); fall back to TCP
  return redisDockerExec(args).catch(() => redisCmdTcp(args));
}

function redisCmdTcp(args) {
  return new Promise((resolve) => {
    const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
    const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
    const sock = createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let buf = '';
    let responsesExpected = REDIS_PASSWORD ? 2 : 1;
    let resolved = false;

    function tryParse() {
      const lines = buf.split('\r\n');
      let offset = 0;
      let count = 0;
      let lastVal = null;
      try {
        while (count < responsesExpected && offset < lines.length && lines[offset] !== '') {
          const [val, next] = parseResp(lines, offset);
          lastVal = val;
          offset = next;
          count++;
        }
      } catch { return; }
      if (count === responsesExpected && !resolved) {
        resolved = true;
        sock.destroy();
        resolve(lastVal);
      }
    }

    sock.setTimeout(4000);
    sock.on('timeout', () => { sock.destroy(); if (!resolved) { resolved = true; resolve(null); } });
    sock.on('error', () => { if (!resolved) { resolved = true; resolve(null); } });
    sock.on('data', (d) => { buf += d.toString(); tryParse(); });
    // Also try on close in case data arrived but parsing missed count check
    sock.on('close', () => { tryParse(); if (!resolved) { resolved = true; resolve(null); } });

    let cmd = '';
    if (REDIS_PASSWORD) {
      cmd += `*2\r\n$4\r\nAUTH\r\n$${REDIS_PASSWORD.length}\r\n${REDIS_PASSWORD}\r\n`;
    }
    cmd += `*${args.length}\r\n` + args.map(a => `$${String(a).length}\r\n${a}\r\n`).join('');
    sock.write(cmd);
    // Signal EOF so server sends response; do NOT call sock.end() before data arrives
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

// ── Topology probe: detect which "cave" (runtime) we're in ─────────────────
const IS_WSL = (() => {
  try { return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch { return false; }
})();
const REDIS_HOST_ACTUAL = process.env.REDIS_HOST || '127.0.0.1';
const topoHint = IS_WSL
  ? `WSL→Docker: use host.docker.internal or $(cat /etc/resolv.conf | grep nameserver | awk '{print $2}') instead of 127.0.0.1`
  : `Windows: 127.0.0.1 → Docker Valkey (correct)`;

// 2 & 3. Redis checks
if (NO_REDIS) {
  skip('Redis code:index:manifest exists', '--no-redis');
  skip('code:index:tag:* keys exist', '--no-redis');
  skip('Manifest mode === fast-ast', '--no-redis');
} else {
  // First probe: is Redis reachable at all?
  const pingResult = await redisCmd(['PING']);
  if (pingResult !== 'PONG') {
    const runtime = IS_WSL ? 'WSL' : 'Windows/native';
    fail('Redis code:index:manifest exists',
      `Redis unreachable at ${REDIS_HOST_ACTUAL}:${process.env.REDIS_PORT ?? 6379} (runtime: ${runtime}). ` +
      `Topology hint: ${topoHint}. ` +
      `Fix: run npm run index:codebase:fast with REDIS_PASSWORD set`);
    skip('code:index:tag:* keys exist', 'Redis offline');
    skip('Manifest mode === fast-ast', 'Redis offline');
  } else {
  const manifest = await redisCmd(['GET', 'code:index:manifest']);
  if (manifest == null) {
    fail('Redis code:index:manifest exists',
      'key missing (expired or never written) — run: npm run index:codebase:fast');
    skip('code:index:tag:* keys exist', 'manifest missing');
    skip('Manifest mode === fast-ast', 'manifest missing');
  } else {
    pass('Redis code:index:manifest exists');

    // 3. tag keys
    const tagKeys = await redisCmd(['KEYS', 'code:index:tag:*']);
    if (!Array.isArray(tagKeys) || tagKeys.length === 0) {
      fail('code:index:tag:* keys exist', 'no tag keys (expired or indexer ran without REDIS_PASSWORD) — rerun: npm run index:codebase:fast');
    } else {
      pass('code:index:tag:* keys exist', `${tagKeys.length} tag key(s)`);
    }

    // 5. manifest mode
    let parsed;
    try { parsed = JSON.parse(manifest); } catch { parsed = null; }
    if (!parsed) {
      fail('Manifest mode === fast-ast', `manifest is not valid JSON (type=${typeof manifest}, len=${String(manifest).length}) — DEL code:index:manifest and reindex`);
    } else if (parsed.mode !== 'fast-ast') {
      fail('Manifest mode === fast-ast', `mode was '${parsed.mode}'`);
    } else {
      pass('Manifest mode === fast-ast', `fileCount=${parsed.fileCount ?? '?'}`);
    }
  }
  } // end ping-ok else
} // end NO_REDIS else

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
