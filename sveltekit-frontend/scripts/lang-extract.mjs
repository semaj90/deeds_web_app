#!/usr/bin/env node
/**
 * lang-extract.mjs
 *
 * Turns LLM output / inference logs / stdio dumps into structured keywords,
 * API names, and required packages.
 *
 * Usage:
 *   node scripts/lang-extract.mjs [--json] [file]
 *   npm run karpathy:gpu 2>&1 | node scripts/lang-extract.mjs
 *   node scripts/lang-extract.mjs logs/task-output/karpathy-latest.log
 *   node scripts/lang-extract.mjs --json logs/task-output/karpathy-latest.log
 */

import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const filePath = args.find(a => !a.startsWith('--'));

// ── Read input ────────────────────────────────────────────────────────────────

async function readInput() {
  if (filePath) {
    return readFileSync(filePath, 'utf8');
  }
  if (process.stdin.isTTY) {
    console.error('Usage: node scripts/lang-extract.mjs [--json] [file]');
    console.error('       or pipe stdin: cat logfile | node scripts/lang-extract.mjs');
    process.exit(1);
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// ── Stopwords ─────────────────────────────────────────────────────────────────

const STOP = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could',
  'should', 'when', 'where', 'what', 'which', 'then', 'than', 'some', 'only',
  'also', 'into', 'more', 'much', 'over', 'each', 'does', 'done', 'just',
  'null', 'true', 'false', 'void', 'type', 'data', 'result', 'value', 'name',
  'node', 'line', 'file', 'path', 'code', 'time', 'time', 'return', 'export',
  'import', 'function', 'async', 'await', 'const', 'class', 'error', 'warn',
]);

// ── Extraction ────────────────────────────────────────────────────────────────

function extractKeywords(text) {
  const freq = new Map();
  for (const raw of text.matchAll(/\b([a-zA-Z][a-zA-Z_]{3,})\b/g)) {
    const w = raw[1].toLowerCase().replace(/_/g, '');
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([word, count]) => ({ word, count }));
}

function extractApiNames(text) {
  const apis = new Set();
  // Object.method patterns — e.g. redis.get, qdrant.search, router.route
  for (const m of text.matchAll(/\b([a-zA-Z][a-zA-Z0-9]+)\.([a-zA-Z][a-zA-Z0-9_]+)\s*\(/g)) {
    const obj = m[1], method = m[2];
    if (obj.length < 3 || method.length < 3) continue;
    if (/^(console|process|Math|JSON|Date|Array|Object|Promise|String|Number|Buffer)$/.test(obj)) continue;
    apis.add(`${obj}.${method}`);
  }
  // MCP tool names — word.word pattern after "tool:" or in "name": fields
  for (const m of text.matchAll(/(?:tool[: "]+|"name"\s*:\s*")([a-z][a-z0-9]+\.[a-z_]+)/g)) {
    apis.add(m[1]);
  }
  return [...apis].sort().slice(0, 30);
}

function extractPackages(text) {
  const pkgs = new Set();
  // ESM imports
  for (const m of text.matchAll(/from\s+['"]([^./'][^'"]*)['"]/g)) {
    pkgs.add(m[1].split('/')[0].replace(/^@/, match => match));
  }
  // CJS require
  for (const m of text.matchAll(/require\s*\(\s*['"]([^./'][^'"]*)['"]/g)) {
    pkgs.add(m[1].split('/')[0]);
  }
  // npm install lines
  for (const m of text.matchAll(/npm\s+install\s+((?:@?[\w/-]+\s*)+)/g)) {
    for (const pkg of m[1].trim().split(/\s+/)) {
      if (pkg && !pkg.startsWith('-')) pkgs.add(pkg);
    }
  }
  return [...pkgs].sort().slice(0, 40);
}

function extractErrorCodes(text) {
  const codes = new Set();
  for (const m of text.matchAll(/\b(TS[0-9]{4}|E[A-Z]{3,}|ERR_[A-Z_]+)\b/g)) {
    codes.add(m[1]);
  }
  return [...codes].sort();
}

function extractRedisKeys(text) {
  const keys = new Set();
  for (const m of text.matchAll(/['"`]((?:ace:|gpu:|wiki:|code:|couchdb:)[a-z:_{}*]+)/g)) {
    keys.add(m[1]);
  }
  return [...keys].sort().slice(0, 20);
}

// ── Runner ────────────────────────────────────────────────────────────────────

const text = await readInput();

const result = {
  keywords:   extractKeywords(text),
  api_names:  extractApiNames(text),
  packages:   extractPackages(text),
  error_codes: extractErrorCodes(text),
  redis_keys: extractRedisKeys(text),
  stats: {
    chars:    text.length,
    lines:    text.split('\n').length,
    source:   filePath ?? 'stdin',
  },
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const { keywords, api_names, packages, error_codes, redis_keys, stats } = result;

  console.log(`\n── LangExtract ─────────────────────────────────────────────────────────────`);
  console.log(`   source: ${stats.source}  (${stats.lines} lines, ${stats.chars} chars)\n`);

  console.log('📌 Top keywords:');
  for (const { word, count } of keywords.slice(0, 15)) {
    const bar = '█'.repeat(Math.round(count / (keywords[0]?.count ?? 1) * 20));
    console.log(`   ${bar.padEnd(20)} ${count.toString().padStart(4)}  ${word}`);
  }

  if (api_names.length) {
    console.log(`\n🔌 API / method names (${api_names.length}):`);
    console.log('   ' + api_names.join('  '));
  }

  if (packages.length) {
    console.log(`\n📦 npm packages detected (${packages.length}):`);
    console.log('   ' + packages.join('  '));
  }

  if (error_codes.length) {
    console.log(`\n⚠️  Error codes: ${error_codes.join(', ')}`);
  }

  if (redis_keys.length) {
    console.log(`\n🔑 Redis key patterns:`);
    console.log('   ' + redis_keys.join('  '));
  }

  console.log('');
}
