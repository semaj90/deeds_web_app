#!/usr/bin/env node
/**
 * Bounded / Resumable NEXT-06 Route AST Dry-Run Sweep (v1)
 *
 * Runs `extract-route-ast-nodes-v2-dry-run-v1.mts` (read-only, no DB writes)
 * across SvelteKit `+server.ts` routes with bounded parallel workers and
 * incremental checkpointing to `docs/reports/next06-route-ast-sweep-v1.json`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiRoot = path.join(repoRoot, 'sveltekit-frontend', 'src', 'routes', 'api');
const outPath = path.join(repoRoot, 'docs', 'reports', 'next06-route-ast-sweep-v1.json');

function collectRoutes(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRoutes(full, out);
    else if (entry.name === '+server.ts') {
      const rel = path.relative(path.join(repoRoot, 'sveltekit-frontend'), full).replace(/\\/g, '/');
      out.push(rel);
    }
  }
  return out;
}

const args = process.argv.slice(2);
const prefixes = [];
let limit = 50;
let concurrency = 8;
const fresh = args.includes('--fresh');

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--prefix' && args[i + 1]) {
    for (const part of args[i + 1].split(',')) {
      const trimmed = part.trim();
      if (trimmed) prefixes.push(trimmed);
    }
    i += 1;
  } else if (args[i] === '--limit' && args[i + 1]) {
    const parsed = Number.parseInt(args[i + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
    i += 1;
  } else if (args[i] === '--concurrency' && args[i + 1]) {
    const parsed = Number.parseInt(args[i + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) concurrency = Math.min(parsed, 16);
    i += 1;
  }
}

const activePrefixes = prefixes.length > 0
  ? prefixes
  : [
      'src/routes/api/codeintel/',
      'src/routes/api/ai/agent',
      'src/routes/api/cases/',
      'src/routes/api/evidence/',
    ];

const allRoutes = collectRoutes(apiRoot).sort();
const targetRoutes = allRoutes
  .filter((r) => activePrefixes.some((p) => r.startsWith(p)))
  .slice(0, limit);

const cachedByRoute = new Map();
if (!fresh && existsSync(outPath)) {
  try {
    const prior = JSON.parse(readFileSync(outPath, 'utf8'));
    if (Array.isArray(prior?.results)) {
      for (const row of prior.results) {
        if (row?.route && row.ok === true && row.receiptReadback === 'MATCH') {
          cachedByRoute.set(row.route, row);
        }
      }
    }
  } catch {
    // ignore corrupt prior checkpoint
  }
}

function runRouteAsync(rel) {
  return new Promise((resolvePromise) => {
    const child = spawn(
      'npx',
      ['tsx', 'scripts/atlas/extract-route-ast-nodes-v2-dry-run-v1.mts', rel],
      { cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let raw = '';
    const timer = setTimeout(() => {
      child.kill();
    }, 30_000);
    child.stdout.on('data', (chunk) => {
      raw += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const start = raw.indexOf('{');
      const end = raw.indexOf('\nfile ');
      let summary = null;
      if (start !== -1 && end !== -1 && end > start) {
        try {
          summary = JSON.parse(raw.slice(start, end));
        } catch {
          summary = null;
        }
      }
      const ok = code === 0 && summary?.receiptReadback === 'MATCH';
      resolvePromise({
        route: rel,
        ok,
        nodeCount: summary?.nodeCount ?? 0,
        byKind: summary?.byKind ?? {},
        validationProblems: summary?.validationProblems ?? (ok ? [] : ['EXTRACTION_FAILED']),
        receiptChecksum: summary?.receiptChecksum ?? null,
        receiptReadback: summary?.receiptReadback ?? null,
      });
    });
  });
}

function writeCheckpoint(resultsMap) {
  const ordered = targetRoutes.map((r) => resultsMap.get(r)).filter(Boolean);
  let matched = 0;
  let totalNodes = 0;
  let routesWithSchema = 0;
  let routesWithAuth = 0;
  for (const row of ordered) {
    if (row.ok) matched += 1;
    totalNodes += Number(row.nodeCount ?? 0);
    if ((row.byKind?.schema ?? 0) > 0) routesWithSchema += 1;
    if ((row.byKind?.auth_guard ?? 0) > 0) routesWithAuth += 1;
  }
  const report = {
    schema: 'atlas.next06-route-ast-sweep.v1',
    canonicalAuthority: false,
    writesPerformed: false,
    totalApiRoutesIndexed: allRoutes.length,
    sweptCount: ordered.length,
    matchedCount: matched,
    totalNodes,
    routesWithSchema,
    routesWithAuth,
    results: ordered,
  };
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

const resultsMap = new Map();
const pending = [];
for (const rel of targetRoutes) {
  if (cachedByRoute.has(rel)) resultsMap.set(rel, cachedByRoute.get(rel));
  else pending.push(rel);
}

let completedNew = 0;
let cursor = 0;

async function worker() {
  while (cursor < pending.length) {
    const idx = cursor;
    cursor += 1;
    const rel = pending[idx];
    const row = await runRouteAsync(rel);
    resultsMap.set(rel, row);
    completedNew += 1;
    if (completedNew % 25 === 0) {
      writeCheckpoint(resultsMap);
    }
  }
}

const workers = Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, () => worker());
await Promise.all(workers);

const finalReport = writeCheckpoint(resultsMap);
console.log(JSON.stringify({
  totalApiRoutesIndexed: finalReport.totalApiRoutesIndexed,
  sweptCount: finalReport.sweptCount,
  matchedCount: finalReport.matchedCount,
  resumedFromCheckpoint: targetRoutes.length - pending.length,
  newlySwept: pending.length,
  totalNodes: finalReport.totalNodes,
  routesWithSchema: finalReport.routesWithSchema,
  routesWithAuth: finalReport.routesWithAuth,
}, null, 2));
