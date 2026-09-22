#!/usr/bin/env node
// SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01
//
// SYMBOL-WIRE-01's fan-out deliberately pre-filtered to a known DECLARATION_NODE_TYPES set, so
// its 0% UNKNOWN rate was partly tautological. This script closes that gap for real: it calls
// the LIVE :8095 NLP sidecar's POST /ast/chunk (the real production AtlasStructuralEvidenceChunk
// producer, ast-grep/treesitter-chunker-backed) for every file in the same 300-file corpus,
// classifies EVERY returned chunk through the canonical normalizeStructuralSymbolKind() with NO
// pre-filtering, and reports the true raw UNKNOWN distribution.
//
// Read-only against the sidecar (GET-shaped POST -- pure chunking, no mutation) and read-only on
// disk. Writes only docs/reports/symbol-kind-live-sidecar-coverage-v1.json.
// canonicalAuthority=false, writesPerformed=false.
//
// Run from sveltekit-frontend/: npx tsx scripts/atlas/symbol-kind-live-sidecar-coverage-v1.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceRevisionForFile } from './lib/symbol-wire-observation-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-live-sidecar-coverage-v1.json');
const SIDECAR_URL = process.env.NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 4);
const LIMIT = process.argv.find((a) => a.startsWith('--limit='))
  ? Number(process.argv.find((a) => a.startsWith('--limit=')).split('=')[1])
  : null;

const { normalizeStructuralSymbolKind } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, 'src', 'lib', 'server', 'atlas', 'indexing', 'structural-observation-v1.ts'),
  ).href
);

// Chunk-boundary/container raw kinds this producer emits that are NOT symbol candidates by
// design (per the review: "do not turn these into symbol identities merely to reduce UNKNOWN").
// Tracked separately so the receipt distinguishes "genuinely ambiguous UNKNOWN" from "correctly
// non-symbol structural noise" -- both currently classify as UNKNOWN via the normalizer, this is
// purely a reporting distinction, not a change to normalizeStructuralSymbolKind() itself.
const STRUCTURAL_NOISE_KINDS = new Set([
  'export_statement', 'export', 'import_statement', 'import',
  'program', 'expression_statement', 'statement_block',
  'FRAGMENT', 'DECLARATION', 'CHUNK',
]);

async function healthCheck() {
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, body };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

async function chunkFile(relPath, absPath, sourceRevision) {
  const source = readFileSync(absPath, 'utf8');
  const res = await fetch(`${SIDECAR_URL}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language: 'typescript', filePath: relPath, sourceRevision }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${res.statusText} ${detail.slice(0, 300)}` };
  }
  const data = await res.json();
  if (data.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(data.chunks)) {
    return { ok: false, error: 'invalid atlas.ast.evidence.v1 payload' };
  }
  return { ok: true, chunks: data.chunks, engine: data.engine, engineVersion: data.engine_version };
}

async function asyncPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runNext() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

async function main() {
  const health = await healthCheck();
  if (!health.ok) {
    const receipt = {
      schema: 'atlas.symbol-kind-live-sidecar-coverage.v1',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED_SIDECAR_UNAVAILABLE',
      sidecarUrl: SIDECAR_URL,
      healthCheck: health,
      canonicalAuthority: false,
      writesPerformed: false,
    };
    writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.error(`Sidecar unavailable at ${SIDECAR_URL} -- wrote BLOCKED receipt.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Sidecar live: ${JSON.stringify(health.body).slice(0, 200)}`);

  if (!existsSync(CORPUS_PATH)) {
    console.error(`Corpus manifest not found: ${CORPUS_PATH}`);
    process.exitCode = 1;
    return;
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const files = LIMIT ? corpus.files.slice(0, LIMIT) : corpus.files;

  console.log(`Chunking ${files.length} files via live sidecar (concurrency=${CONCURRENCY})...`);

  const perFile = await asyncPool(
    files,
    async (relPath) => {
      const absPath = path.join(REPO_ROOT, relPath);
      const sourceRevision = sourceRevisionForFile(absPath);
      const result = await chunkFile(relPath, absPath, sourceRevision).catch((err) => ({ ok: false, error: String(err?.message ?? err) }));
      return { relPath, sourceRevision, ...result };
    },
    CONCURRENCY,
  );

  let filesOk = 0;
  let filesFailed = 0;
  let totalChunks = 0;
  let knownKind = 0;
  let unknownKind = 0;
  let unknownStructuralNoise = 0;
  let unknownGenuine = 0;
  const unknownByRawKind = {};
  const unknownByRawNodeType = {};
  const knownByKind = {};
  const unknownFilesSample = [];

  for (const r of perFile) {
    if (!r.ok) {
      filesFailed += 1;
      continue;
    }
    filesOk += 1;
    for (const chunk of r.chunks) {
      totalChunks += 1;
      const resolved = normalizeStructuralSymbolKind(chunk.kind, chunk.node_type);
      const isNoise = STRUCTURAL_NOISE_KINDS.has(chunk.kind) || STRUCTURAL_NOISE_KINDS.has(chunk.node_type);
      if (resolved === 'UNKNOWN') {
        unknownKind += 1;
        if (isNoise) unknownStructuralNoise += 1;
        else unknownGenuine += 1;
        unknownByRawKind[chunk.kind] = (unknownByRawKind[chunk.kind] ?? 0) + 1;
        unknownByRawNodeType[chunk.node_type] = (unknownByRawNodeType[chunk.node_type] ?? 0) + 1;
        if (!isNoise && unknownFilesSample.length < 20) {
          unknownFilesSample.push({ relPath: r.relPath, kind: chunk.kind, node_type: chunk.node_type, name: chunk.name });
        }
      } else {
        knownKind += 1;
        knownByKind[resolved] = (knownByKind[resolved] ?? 0) + 1;
      }
    }
  }

  const receipt = {
    schema: 'atlas.symbol-kind-live-sidecar-coverage.v1',
    generatedAt: new Date().toISOString(),
    status: 'COMPLETE',
    sidecarUrl: SIDECAR_URL,
    sidecarHealth: health.body,
    corpusManifestUsed: { workspaceRevision: corpus.workspaceRevision, corpusSize: files.length },
    filesRequested: files.length,
    filesOk,
    filesFailed,
    totalChunks,
    knownKind,
    unknownKind,
    unknownRate: totalChunks > 0 ? unknownKind / totalChunks : null,
    unknownStructuralNoise,
    unknownGenuine,
    unknownGenuineRate: totalChunks > 0 ? unknownGenuine / totalChunks : null,
    knownByKind,
    unknownByRawKind: Object.entries(unknownByRawKind).sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ kind: k, count: c })),
    unknownByRawNodeType: Object.entries(unknownByRawNodeType).sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ node_type: k, count: c })),
    unknownGenuineSamples: unknownFilesSample,
    canonicalAuthority: false,
    writesPerformed: false,
    notes: [
      'This is the REAL raw UNKNOWN measurement -- unlike SYMBOL-WIRE-01, chunks are NOT ' +
        'pre-filtered to a known-good node-type allowlist. unknownStructuralNoise counts chunk-' +
        'boundary/container kinds (export_statement, import_statement, program, etc.) that ' +
        'deliberately stay UNKNOWN by design (per the review: do not turn these into symbol ' +
        'identities merely to reduce UNKNOWN). unknownGenuine is everything else -- the number ' +
        'worth investigating if the normalizer needs to learn a new mapping.',
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Files ok: ${filesOk}  failed: ${filesFailed}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Known: ${knownKind}  Unknown: ${unknownKind} (rate=${receipt.unknownRate?.toFixed(4)})`);
  console.log(`  of which structural noise (expected): ${unknownStructuralNoise}`);
  console.log(`  of which genuine/investigate-worthy: ${unknownGenuine} (rate=${receipt.unknownGenuineRate?.toFixed(4)})`);
  console.log(`Known by kind: ${JSON.stringify(knownByKind)}`);
  console.log(`Top unknown raw kinds: ${JSON.stringify(receipt.unknownByRawKind.slice(0, 10))}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
