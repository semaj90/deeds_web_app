#!/usr/bin/env node
/**
 * smoke-graphify.mjs
 *
 * 5-pillar Graphify/Karpathy stack health check. Each pillar can be present
 * or absent; absence is reported but doesn't fail the smoke unless --strict.
 *
 * Pillars:
 *   1. Fast AST graph     — docs/graph/codebase-graph.json + codebase-map.md
 *   2. Redis fast cache   — code:index:manifest + code:index:tag:* keys
 *   3. KAG wiki notes     — wiki:note:dir:* keys
 *   4. Qdrant semantic    — codebase_chunks_768 collection has points
 *   5. ACE fallback path  — context-assembler.ts FAST_AST_SCORE_CAP ≤ 0.07
 *
 * Usage:
 *   node scripts/tests/smoke-graphify.mjs
 *   node scripts/tests/smoke-graphify.mjs --strict       # absent pillar = fail
 *   node scripts/tests/smoke-graphify.mjs --no-redis     # skip Redis pillars
 *   node scripts/tests/smoke-graphify.mjs --no-qdrant    # skip Qdrant pillar
 */

import { readFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const STRICT     = process.argv.includes('--strict');
const NO_REDIS   = process.argv.includes('--no-redis');
const NO_QDRANT  = process.argv.includes('--no-qdrant');

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

let present = 0, absent = 0, failed = 0;

const ok    = (label, detail = '') => { console.log(`  ${c.green('✓')} ${label}${detail ? c.dim('  ' + detail) : ''}`); present++; };
const miss  = (label, hint = '')   => { console.log(`  ${c.yellow('○')} ${label}${hint ? c.dim('  ' + hint) : ''}`); absent++; };
const bad   = (label, detail = '') => { console.log(`  ${c.red('✗')} ${label}${detail ? '  ' + c.red(detail) : ''}`); failed++; };

// Raw RESP-1 Redis (single bulk only — for KEYS we just probe via DBSIZE-style)
function redisCmd(args) {
  return new Promise((resolve) => {
    const sock = createConnection({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });
    let buf = Buffer.alloc(0);
    sock.setTimeout(3000);
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
    sock.on('error',   () => resolve(null));
    sock.on('data',    d => { buf = Buffer.concat([buf, d]); });
    sock.on('end', () => {
      const s = buf.toString('utf8');
      const lines = s.split('\r\n');
      const first = lines[0] ?? '';
      if (first.startsWith('+')) return resolve(first.slice(1));
      if (first.startsWith(':')) return resolve(parseInt(first.slice(1), 10));
      if (first.startsWith('$')) {
        const len = parseInt(first.slice(1), 10);
        return resolve(len === -1 ? null : lines[1] ?? null);
      }
      if (first.startsWith('*')) {
        // multibulk: return count for KEYS-style probes
        return resolve(parseInt(first.slice(1), 10));
      }
      resolve(s.trim() || null);
    });
    const cmd = `*${args.length}\r\n` + args.map(a => {
      const v = String(a);
      return `$${Buffer.byteLength(v)}\r\n${v}\r\n`;
    }).join('');
    sock.write(cmd);
    sock.end();
  });
}

console.log(c.bold('\n=== Graphify/Karpathy stack smoke (5 pillars) ===\n'));

// ── Pillar 1: Fast AST graph ────────────────────────────────────────────────

const graphJson = path.join(ROOT, 'docs/graph/codebase-graph.json');
const graphMd   = path.join(ROOT, 'docs/graph/codebase-map.md');
if (!existsSync(graphJson)) {
  bad('Pillar 1 — Fast AST graph JSON', `${graphJson} missing — run npm run index:codebase:fast`);
} else {
  let g;
  try { g = JSON.parse(readFileSync(graphJson, 'utf8')); } catch { g = null; }
  if (!g?.files?.length) {
    bad('Pillar 1 — Fast AST graph JSON', 'parsed but files[] empty');
  } else {
    ok(`Pillar 1 — Fast AST graph`, `${g.files.length.toLocaleString()} files, mode=${g.mode ?? '?'}`);
  }
}
if (existsSync(graphMd)) {
  ok('  └─ codebase-map.md', `${(readFileSync(graphMd, 'utf8').split('\n').length).toLocaleString()} lines`);
} else {
  miss('  └─ codebase-map.md', '— run npm run index:codebase:fast:plan');
}

// ── Pillar 2: Redis fast cache ──────────────────────────────────────────────

if (NO_REDIS) {
  miss('Pillar 2 — Redis fast cache', '--no-redis');
  miss('Pillar 3 — KAG wiki notes',   '--no-redis');
} else {
  const manifest = await redisCmd(['GET', 'code:index:manifest']);
  if (!manifest) {
    bad('Pillar 2 — Redis fast cache', 'code:index:manifest missing — run npm run index:codebase:fast');
  } else {
    let m; try { m = JSON.parse(manifest); } catch { m = null; }
    if (m?.mode === 'fast-ast') {
      ok('Pillar 2 — Redis fast cache', `mode=fast-ast, fileCount=${m.fileCount ?? '?'}`);
    } else {
      bad('Pillar 2 — Redis fast cache', `mode=${m?.mode ?? 'unknown'}, expected fast-ast`);
    }
  }
  // Probe tag key count
  const tagCount = await redisCmd(['EVAL', "return #redis.call('keys', 'code:index:tag:*')", '0']);
  if (typeof tagCount === 'number' && tagCount > 0) {
    ok('  └─ code:index:tag:*', `${tagCount} tag key(s)`);
  } else {
    miss('  └─ code:index:tag:*', 'no tag keys (run indexer)');
  }

  // ── Pillar 3: KAG wiki notes ──────────────────────────────────────────────
  const wikiCount = await redisCmd(['EVAL', "return #redis.call('keys', 'wiki:note:dir:*')", '0']);
  if (typeof wikiCount === 'number' && wikiCount > 0) {
    ok('Pillar 3 — KAG wiki notes', `${wikiCount} wiki:note:dir:* key(s)`);
  } else {
    miss('Pillar 3 — KAG wiki notes', 'none — run POST /api/codebase-index/summarize-dirs or audit:dirs:map');
  }
}

// ── Pillar 4: Qdrant semantic ───────────────────────────────────────────────

if (NO_QDRANT) {
  miss('Pillar 4 — Qdrant semantic index', '--no-qdrant');
} else {
  try {
    const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
    const r = await fetch(`${QDRANT}/collections/codebase_chunks_768`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const points = j.result?.points_count ?? 0;
    const status = j.result?.status ?? 'unknown';
    if (points > 0) {
      ok('Pillar 4 — Qdrant semantic index', `codebase_chunks_768: ${points.toLocaleString()} points, status=${status}`);
    } else {
      bad('Pillar 4 — Qdrant semantic index', 'collection exists but 0 points — run npm run codebase:index');
    }
  } catch (e) {
    miss('Pillar 4 — Qdrant semantic index', `Qdrant unreachable: ${e.message}`);
  }
}

// ── Pillar 5: ACE fallback contract (static) ────────────────────────────────

const assembler = path.join(ROOT, 'src/lib/server/ace/context-assembler.ts');
if (!existsSync(assembler)) {
  bad('Pillar 5 — ACE fallback contract', 'context-assembler.ts not found');
} else {
  const src = readFileSync(assembler, 'utf8');
  const m = src.match(/FAST_AST_SCORE_CAP\s*=\s*([\d.]+)/);
  if (!m) {
    bad('Pillar 5 — ACE fallback contract', 'FAST_AST_SCORE_CAP not found');
  } else {
    const cap = parseFloat(m[1]);
    if (cap > 0.08) {
      bad('Pillar 5 — ACE fallback contract', `FAST_AST_SCORE_CAP=${cap} exceeds 0.08`);
    } else {
      ok('Pillar 5 — ACE fallback contract', `FAST_AST_SCORE_CAP=${cap}`);
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

const total = present + absent + failed;
console.log(
  `\n${c.bold('Pillars:')} ${c.green(`${present} present`)}` +
  (absent ? `, ${c.yellow(`${absent} absent`)}` : '') +
  (failed ? `, ${c.red(`${failed} failed`)}` : '') +
  `  (${total} checks)\n`
);

if (failed > 0) {
  console.log(c.red('Critical pillar failure. See messages above.\n'));
  process.exit(1);
}
if (STRICT && absent > 0) {
  console.log(c.yellow(`--strict: ${absent} pillar(s) absent.\n`));
  process.exit(2);
}
console.log(c.green('Stack ready for Graphify/Karpathy workflows.\n'));
