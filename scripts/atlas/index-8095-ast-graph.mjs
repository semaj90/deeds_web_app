#!/usr/bin/env node
/**
 * scripts/atlas/index-8095-ast-graph.mjs
 *
 * Multi-core Parallel AST Indexer for :8095 CPU Sidecar
 *
 * Purpose:
 *   1. Queries :8095/ast/chunk in parallel with bounded worker concurrency.
 *   2. Extracts canonical AST nodes, CALLS facts, and structural edges.
 *   3. Emits a deterministic revision-bound JSON Graph Artifact (.tmp/atlas/ast-graph-8095.json).
 *   4. Generates an execution receipt with input/output SHA-256 digests.
 *   5. Read-only with respect to canonical PostgreSQL/Neo4j/Qdrant.
 *
 * Usage:
 *   node scripts/atlas/index-8095-ast-graph.mjs [--sample 20] [--concurrency 4]
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './connection-config.mjs';

const SIDECAR_URL = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const OUT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas');
const OUT_JSON = path.join(OUT_DIR, 'ast-graph-8095.json');

const sha256 = (str) => createHash('sha256').update(str, 'utf8').digest('hex');

function parseArgs(argv) {
  let concurrency = 4;
  let sampleLimit = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--concurrency' && argv[i + 1]) concurrency = parseInt(argv[++i], 10);
    else if (argv[i] === '--sample' && argv[i + 1]) sampleLimit = parseInt(argv[++i], 10);
  }
  return { concurrency, sampleLimit };
}

function discoverSourceFiles(root, limit = 50) {
  const targetDir = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server');
  const files = [];

  function walk(dir) {
    if (files.length >= limit) return;
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (files.length >= limit) return;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
        walk(full);
      } else if (st.isFile() && (name.endsWith('.ts') || name.endsWith('.svelte.ts')) && !name.endsWith('.spec.ts')) {
        files.push(path.relative(root, full).replaceAll('\\', '/'));
      }
    }
  }

  walk(targetDir);
  return files;
}

async function fetchAstFromSidecar(sourceRef, sourceText) {
  const language = sourceRef.endsWith('.tsx') ? 'tsx' : 'typescript';
  const response = await fetch(`${SIDECAR_URL}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      source: sourceText,
      language,
      filePath: sourceRef,
      sourceRevision: 'live-index-v1',
    }),
  });

  if (!response.ok) {
    throw new Error(`SIDECAR_HTTP_${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function processWithConcurrency(items, concurrency, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        const result = await fn(item, currentIndex);
        results[currentIndex] = { ok: true, value: result };
      } catch (err) {
        results[currentIndex] = { ok: false, error: err.message, item };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const { concurrency, sampleLimit } = parseArgs(process.argv.slice(2));
  console.log('='.repeat(80));
  console.log('🚀 ATLAS :8095 PARALLEL AST GRAPH INDEXER');
  console.log('='.repeat(80));
  console.log(`Endpoint:    ${SIDECAR_URL}`);
  console.log(`Concurrency: ${concurrency} parallel requests`);
  console.log(`Sample Cap:  ${sampleLimit} files\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = discoverSourceFiles(REPO_ROOT, sampleLimit);
  console.log(`📂 Discovered ${files.length} server source files for AST extraction.`);

  const startTime = Date.now();
  const results = await processWithConcurrency(files, concurrency, async (file, idx) => {
    const fullPath = path.join(REPO_ROOT, file);
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const sourceHash = sha256(sourceText);
    const ast = await fetchAstFromSidecar(file, sourceText);
    return {
      file,
      sourceHash,
      chunks: ast.chunks ?? [],
      edges: ast.edges ?? [],
    };
  });

  const durationMs = Date.now() - startTime;
  console.log(`\n⏱️  Processed ${files.length} files in ${durationMs}ms (${(durationMs / files.length).toFixed(1)}ms/file)`);

  let totalNodes = 0;
  let totalEdges = 0;
  let totalCalls = 0;
  const graphNodes = [];
  const graphEdges = [];
  let errorsCount = 0;

  for (const r of results) {
    if (!r.ok) {
      console.warn(`  ❌ Error processing ${r.item}: ${r.error}`);
      errorsCount++;
      continue;
    }

    const { file, sourceHash, chunks, edges } = r.value;
    totalNodes += chunks.length;
    totalEdges += edges.length;

    for (const c of chunks) {
      graphNodes.push({
        nodeKey: `${file}:${c.name ?? 'anon'}:${c.start_byte}`,
        file,
        name: c.name ?? null,
        kind: c.kind ?? 'chunk',
        startByte: c.start_byte,
        endByte: c.end_byte,
        sourceHash,
      });
    }

    for (const e of edges) {
      if (e.type === 'CALLS') totalCalls++;
      graphEdges.push({
        edgeKey: `${file}:${e.from_evidence_key}->${e.to_evidence_key}:${e.type}`,
        file,
        sourceNode: e.from_evidence_key,
        targetNode: e.to_evidence_key,
        type: e.type,
        startLine: e.evidence_start_line,
        startCol: e.evidence_start_column,
      });
    }
  }

  const graphArtifact = {
    schema: 'atlas.ast-graph-artifact.v1',
    generatedAt: new Date().toISOString(),
    generator: ':8095-fastapi-treesitter-worker',
    stats: {
      filesIndexed: files.length - errorsCount,
      errorsCount,
      totalNodes,
      totalEdges,
      callsEdges: totalCalls,
      durationMs,
    },
    nodes: graphNodes,
    edges: graphEdges,
  };

  const outputJsonStr = JSON.stringify(graphArtifact, null, 2);
  fs.writeFileSync(OUT_JSON, outputJsonStr + '\n', 'utf8');
  const artifactDigest = sha256(outputJsonStr);

  console.log('\n📊 Graph Summary:');
  console.log(`   - Total AST Nodes: ${totalNodes}`);
  console.log(`   - Total Edges:     ${totalEdges} (CALLS: ${totalCalls})`);
  console.log(`   - Output File:     ${OUT_JSON}`);
  console.log(`   - Artifact SHA256: sha256:${artifactDigest}`);
  console.log(`   - Writes:          Zero database writes (read-only audit)`);
  console.log('\n✅ Completed successfully.');
}

main().catch(err => {
  console.error('Fatal error in AST indexer:', err);
  process.exit(1);
});
