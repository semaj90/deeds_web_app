#!/usr/bin/env node
/**
 * SYMBOL-REGISTRY-REPAIR-PREVIEW-01 — read-only preview/manifest generator.
 *
 * For every atlas_symbol_registry row carrying an unqualified
 * created_from_source_revision (the 'workspace:0' placeholder, or a Git
 * commit oid), resolves the current on-disk file and hashes its exact
 * current bytes (sha256). Never writes to Postgres. Produces a frozen,
 * checksummed manifest that apply-symbol-registry-revision-repair-v1.mjs
 * re-verifies before applying anything.
 *
 * Per SYMBOL-REGISTRY-REPAIR-PLAN-01 (openspec/changes/parent-atlas-code-intel-e2e/tasks.md):
 * atlas_source_refs cannot supply a trustworthy whole-file hash for any of
 * these target files (it is fragment-scoped, and none of the 1,185 targets
 * have a symbol_kind='file' row) — so the correct, honest derivation is to
 * hash each file's current bytes directly, never copy an existing
 * atlas_source_refs value and never infer/reuse a repo commit oid.
 *
 * Concurrency: file hashing is parallelized across a bounded worker_threads
 * pool (default os.cpus().length workers) — 1,185 independent file reads.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT, FRONTEND_ROOT } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = 'atlas.symbol-registry-revision-repair-preview.v1';
const outPath = path.resolve(REPO_ROOT, 'docs/reports/symbol-registry-revision-repair-manifest-v1.json');
const WORKER_SCRIPT = path.join(__dirname, 'lib', 'hash-file-worker.mjs');

// The exactly 5 files renamed in commit d06bc93f08 ("Session 56: Fix 38
// svelte-check errors + archive dead code to deeds_labs"), confirmed via
// `git log --diff-filter=D` + direct filesystem check at both the old and
// new path (SYMBOL-REGISTRY-REPAIR-PLAN-01, 2026-09-27). Closed, hardcoded
// set — intentionally not a generic regex that could misfire on an
// unrelated file that happens to share a path segment.
const KNOWN_RENAMES = new Map([
  ['src/lib/services/error-analysis/CacheService.ts', 'src/lib/server/services/error-analysis/CacheService.ts'],
  ['src/lib/services/error-analysis/DecisionEngine.ts', 'src/lib/server/services/error-analysis/DecisionEngine.ts'],
  ['src/lib/services/error-analysis/MetricsCollector.ts', 'src/lib/server/services/error-analysis/MetricsCollector.ts'],
  ['src/lib/services/knowledge-search/RedisCacheService.ts', 'src/lib/server/services/knowledge-search/RedisCacheService.ts'],
  ['src/lib/services/couchdb-client.ts', 'src/lib/server/services/couchdb-client.ts'],
]);

function candidatePaths(sourceRef) {
  const corrected = KNOWN_RENAMES.get(sourceRef) ?? sourceRef;
  return [path.join(REPO_ROOT, corrected), path.join(FRONTEND_ROOT, corrected)];
}

async function resolveExistingPath(sourceRef) {
  for (const candidate of candidatePaths(sourceRef)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* try next candidate */ }
  }
  return null;
}

function runWorkerPool(filePaths, concurrency) {
  return new Promise((resolve, reject) => {
    const results = new Array(filePaths.length);
    let nextIndex = 0;
    let completed = 0;
    let failed = null;
    const workers = [];

    function dispatch(worker) {
      if (failed || nextIndex >= filePaths.length) return;
      const index = nextIndex++;
      worker.postMessage({ index, filePath: filePaths[index] });
    }

    if (filePaths.length === 0) { resolve([]); return; }

    for (let i = 0; i < concurrency; i++) {
      const worker = new Worker(WORKER_SCRIPT);
      workers.push(worker);
      worker.on('message', (msg) => {
        results[msg.index] = msg;
        completed++;
        if (completed === filePaths.length) {
          workers.forEach((w) => w.terminate());
          resolve(results);
        } else {
          dispatch(worker);
        }
      });
      worker.on('error', (err) => {
        failed = err;
        workers.forEach((w) => w.terminate());
        reject(err);
      });
      dispatch(worker);
    }
  });
}

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  const client = await pool.connect();
  let rows;
  try {
    const result = await client.query(`
      SELECT stable_symbol_id, canonical_key, created_from_source_ref, created_from_source_revision, status
      FROM atlas_symbol_registry
      WHERE created_from_source_revision = 'workspace:0' OR created_from_source_revision ~ '^[a-f0-9]{40}$'
      ORDER BY stable_symbol_id
    `);
    rows = result.rows;
  } finally {
    client.release();
    await pool.end();
  }

  const distinctRefs = [...new Set(rows.map((r) => r.created_from_source_ref))];
  const resolvedByRef = new Map();
  for (const ref of distinctRefs) resolvedByRef.set(ref, await resolveExistingPath(ref));

  const missing = distinctRefs.filter((ref) => !resolvedByRef.get(ref));
  if (missing.length > 0) {
    console.error(`[PREVIEW] ${missing.length} source refs could not be resolved to an existing file — refusing to proceed:`);
    missing.forEach((m) => console.error(`  - ${m}`));
    process.exit(1);
  }

  const filePaths = distinctRefs.map((ref) => resolvedByRef.get(ref));
  const concurrency = Math.max(1, Math.min(os.cpus().length, filePaths.length));
  console.log(`[PREVIEW] hashing ${filePaths.length} distinct files across ${concurrency} worker threads...`);
  const hashResults = await runWorkerPool(filePaths, concurrency);

  const hashByRef = new Map();
  for (let i = 0; i < distinctRefs.length; i++) {
    if (hashResults[i]?.error) throw new Error(`HASH_FAILED:${distinctRefs[i]}:${hashResults[i].error}`);
    hashByRef.set(distinctRefs[i], `sha256:${hashResults[i].hash}`);
  }

  const manifestRows = rows.map((row) => ({
    stableSymbolId: row.stable_symbol_id,
    canonicalKey: row.canonical_key,
    sourceRef: row.created_from_source_ref,
    resolvedPath: path.relative(REPO_ROOT, resolvedByRef.get(row.created_from_source_ref)).replaceAll('\\', '/'),
    renamed: KNOWN_RENAMES.has(row.created_from_source_ref),
    oldRevision: row.created_from_source_revision,
    newRevision: hashByRef.get(row.created_from_source_ref),
    status: row.status,
  }));

  const manifestCore = {
    schema: SCHEMA,
    targetRowCount: manifestRows.length,
    distinctFileCount: distinctRefs.length,
    rows: manifestRows,
  };
  const manifestChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex')}`;
  const manifest = { ...manifestCore, generatedAt: new Date().toISOString(), manifestChecksum };

  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[PREVIEW] manifest written: ${outPath}`);
  console.log(`[PREVIEW] targetRowCount=${manifest.targetRowCount} distinctFiles=${manifest.distinctFileCount} manifestChecksum=${manifestChecksum}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
