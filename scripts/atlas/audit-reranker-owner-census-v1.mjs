#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const retrievalRoot = path.join(repoRoot, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'reranker-owner-census-v1.json');

const productionNames = [
  'attention-reranker.ts',
  'boosted-reranker.ts',
  'cuda-rnn-reranker.ts',
  'cross-encoder-reranker.ts',
  'gpu-reranker.ts',
  'cluster-aware-reranker.ts',
  'noun-reranker.ts',
  'post-process-reranker.ts',
  'langextract-reranker.ts',
  'reranker-blend.ts',
  'semantic-vector-reranker.ts',
  'triton-reranker.ts',
  'runtime-reranker.ts',
  'canonical-rerank-executor.ts'
];

const ignoredSegments = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.git${path.sep}`,
  `${path.sep}scripts${path.sep}api-cleanup${path.sep}reports${path.sep}`,
  `${path.sep}build${path.sep}`,
  `${path.sep}.svelte-kit${path.sep}`
];

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (ignoredSegments.some((segment) => absolute.includes(segment))) continue;
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (/\.(ts|mts|cts|js|mjs)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll('\\', '/');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const sourceRoots = [
  path.join(repoRoot, 'sveltekit-frontend', 'src'),
  path.join(repoRoot, 'packages', 'parent-atlas', 'src'),
  path.join(repoRoot, 'scripts', 'atlas'),
  path.join(repoRoot, 'services')
];

function boundedMatches(pattern) {
  try {
    const output = execFileSync('rg', [
      '-l',
      '--hidden',
      '--glob', '!node_modules/**',
      '--glob', '!**/.svelte-kit/**',
      '--glob', '!**/build/**',
      '--glob', '*.{ts,mts,cts,js,mjs}',
      pattern,
      ...sourceRoots
    ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split(/\r?\n/).filter(Boolean).map((file) => path.resolve(repoRoot, file));
  } catch {
    return [];
  }
}

const entries = [];
for (const name of productionNames) {
  const absolute = path.join(retrievalRoot, name);
  const source = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
  const base = name.replace(/\.(ts|mts|cts|js|mjs)$/, '');
  const callers = [];
  const candidates = new Set([
    ...boundedMatches(base),
    ...boundedMatches(name.replace('.', '\\.'))
  ]);
  for (const candidate of candidates) {
    if (candidate === absolute || candidate.endsWith('audit-reranker-owner-census-v1.mjs') || !fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, 'utf8');
    const normalized = relative(candidate);
    const mentions = new RegExp(`(?:${base}|${name.replace('.', '\\.')})`, 'i').test(text);
    if (mentions) callers.push({ path: normalized, test: /(?:spec|test)\./i.test(path.basename(candidate)) });
  }
  const runtimeCallers = callers.filter((caller) => !caller.test);
  const testCallers = callers.filter((caller) => caller.test);
  let classification = 'ORPHANED';
  if (name === 'canonical-rerank-executor.ts') classification = 'CANONICAL_OWNER';
  else if (runtimeCallers.length > 0) classification = 'LIVE_SECONDARY';
  else if (testCallers.length > 0) classification = 'TEST_ONLY';
  else if (source) classification = 'ORPHANED';
  entries.push({
    file: relative(absolute),
    exists: Boolean(source),
    classification,
    sourceChecksum: source ? `sha256:${sha256(source)}` : null,
    runtimeCallerCount: runtimeCallers.length,
    testCallerCount: testCallers.length,
    runtimeCallers: runtimeCallers.slice(0, 50).map((caller) => caller.path),
    testCallers: testCallers.slice(0, 50).map((caller) => caller.path)
  });
}

const report = {
  schema: 'atlas.reranker-owner-census.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
  owner: 'sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts',
  entries,
  counts: Object.fromEntries(
    [...new Set(entries.map((entry) => entry.classification))].map((classification) => [
      classification,
      entries.filter((entry) => entry.classification === classification).length
    ])
  ),
  nextGate: 'RERANKER_OWNER_CENSUS_REVIEW'
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath: relative(reportPath) }, null, 2));
