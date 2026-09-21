#!/usr/bin/env node
/**
 * Read-only census of cache-key construction and access sites.
 *
 * This is navigation/governance evidence only. It does not connect to Valkey,
 * alter cache keys, or infer canonical identity from a prefix.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'docs/reports/bitfrost-cache-writer-census-v1.json');
const PREFIXES = [
  'bifrost:', 'bitfrost:', 'centroid:', 'taxonomy:clusters:',
  'atlas:centroid:', 'ace:', 'gpu:',
];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py']);
const IGNORED = /(^|[\\/])(node_modules|\.git|\.svelte-kit|dist|build|coverage)([\\/]|$)/;

function files() {
  const output = execFileSync('rg', ['--files', 'scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean)
    .filter((file) => !IGNORED.test(file) && EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();
}

function nearestFunction(lines, index) {
  for (let i = index; i >= Math.max(0, index - 20); i -= 1) {
    const match = lines[i].match(/(?:function\s+|async\s+function\s+|(?:export\s+)?(?:async\s+)?)([A-Za-z_$][\w$]*)\s*\(/);
    if (match) return match[1];
    const method = lines[i].match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/);
    if (method) return method[1];
  }
  return null;
}

function classify(file, lines, index, prefix) {
  const start = Math.max(0, index - 8);
  const end = Math.min(lines.length, index + 9);
  const context = lines.slice(start, end).join('\n');
  const writes = /\.(set|setex|hset|hmset|sadd|zadd|xadd|del|unlink)\s*\(|\b(?:SET|SETEX|HSET|SADD|ZADD)\b/i.test(context);
  const reads = /\.(get|mget|hget|hgetall|smembers|sismember|keys|scan|exists|ttl)\s*\(|\b(?:GET|MGET|HGET|SMEMBERS|SCAN|EXISTS)\b/i.test(context);
  const ttlMatches = context.match(/(?:EX|PX|TTL|expire|setex)\s*[^\n,)]*/gi) ?? [];
  const payloadMatches = context.match(/JSON\.stringify\([^\n]+|Float32Array|Buffer\.from\([^\n]+/g) ?? [];
  const canonicalBuilderImported = /(?:cache-keys|bifrostKey|bifrostPacketKey|semanticCacheKeys)/i.test(lines.slice(0, 80).join('\n'));
  const runtime = file.startsWith('sveltekit-frontend/src/');
  const script = file.includes('/scripts/') || file.startsWith('scripts/');
  const historical = /(?:test|smoke|demo|legacy|archive|draft)/i.test(file);
  return {
    file,
    line: index + 1,
    function: nearestFunction(lines, index),
    prefix,
    operation: writes && reads ? 'READ_WRITE_CONTEXT' : writes ? 'WRITE' : reads ? 'READ' : 'REFERENCE',
    payloadShape: payloadMatches.slice(0, 3),
    ttlEvidence: ttlMatches.slice(0, 3),
    canonicalBuilderImported,
    lane: runtime ? 'RUNTIME' : script ? 'SCRIPT' : 'OTHER',
    historicalOrFixture: historical,
    activeCandidate: runtime && !historical,
  };
}

const occurrences = [];
const scannedFiles = files();
for (const file of scannedFiles) {
  const absolute = path.join(ROOT, file);
  let source;
  try { source = fs.readFileSync(absolute, 'utf8'); } catch { continue; }
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const prefix of PREFIXES) {
      if (line.includes(prefix)) occurrences.push(classify(file.replaceAll('\\', '/'), lines, index, prefix));
    }
  });
}

const unique = new Map();
for (const item of occurrences) {
  const key = JSON.stringify([item.file, item.line, item.prefix, item.operation]);
  if (!unique.has(key)) unique.set(key, item);
}
const entries = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.prefix.localeCompare(b.prefix));
const writers = entries.filter((entry) => entry.operation.includes('WRITE'));
const readers = entries.filter((entry) => entry.operation.includes('READ'));
const byPrefix = Object.fromEntries(PREFIXES.map((prefix) => [prefix, {
  occurrences: entries.filter((entry) => entry.prefix === prefix).length,
  writers: writers.filter((entry) => entry.prefix === prefix).length,
  readers: readers.filter((entry) => entry.prefix === prefix).length,
}]));
const canonicalBuilder = 'sveltekit-frontend/src/lib/server/cache-keys.ts';
const report = {
  schema: 'atlas.bitfrost-cache-writer-census.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STATIC_SOURCE_CENSUS',
  scope: { roots: ['scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts'], filesScanned: scannedFiles.length },
  canonicalBuilder,
  policy: {
    canonicalAuthority: false,
    prefixesAreNotIdentityOwners: true,
    liveRuntimeRequiresRuntimeReceipt: true,
    noCacheOrDatabaseWrites: true,
  },
  summary: {
    occurrences: entries.length,
    writers: writers.length,
    readers: readers.length,
    runtimeWriters: writers.filter((entry) => entry.lane === 'RUNTIME').length,
    scriptWriters: writers.filter((entry) => entry.lane === 'SCRIPT').length,
    writersUsingCanonicalBuilder: writers.filter((entry) => entry.canonicalBuilderImported).length,
    writersWithoutCanonicalBuilder: writers.filter((entry) => !entry.canonicalBuilderImported).length,
  },
  byPrefix,
  writerCensus: writers,
  readerCensus: readers,
  nextGate: 'REVIEW_RUNTIME_WRITERS_WITHOUT_CANONICAL_BUILDER',
  semanticChecksum: null,
  writesPerformed: false,
};
report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, generatedAt: null, semanticChecksum: null }), 'utf8').digest('hex')}`;
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
const temp = `${REPORT}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temp, REPORT);
console.log(JSON.stringify({ reportPath: REPORT, summary: report.summary, nextGate: report.nextGate, writesPerformed: false }, null, 2));
