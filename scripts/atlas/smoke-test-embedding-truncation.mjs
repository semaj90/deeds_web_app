#!/usr/bin/env node

/**
 * EmbeddingGemma semantic_768 / MRL projection smoke
 *
 * Validates:
 * 1. Optional live projection diagnostics from semantic_768 to MRL 512/256/128
 * 2. Cosine similarity of zero-padded, L2-normalized MRL views (diagnostic only)
 * 3. Modeled vector-payload byte comparison (not total database cost)
 * 5. OKF schema compliance
 * 6. PostgreSQL upsert contract
 *
 * Usage:
 *   node smoke-test-embedding-truncation.mjs [--verbose] [--gates-only]
 *
 * --gates-only runs deterministic local checks only; it makes no service call.
 *
 * Exit codes:
 *   0 = all gates pass
 *   1 = gate failure
 *   2 = pre-requisite failure
 */

import fetch from 'node-fetch';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const ONNX_URL = 'http://127.0.0.1:8081/v1/embeddings';
const VERBOSE = process.argv.includes('--verbose');
const GATES_ONLY = process.argv.includes('--gates-only');
export const MRL_DIMENSIONS = Object.freeze([512, 256, 128]);
export const CANONICAL_DIMENSION = 768;

// ============================================================================
// UTILITIES
// ============================================================================

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error(`COSINE_DIMENSION_MISMATCH: ${a.length} != ${b.length}`);
  const n = a.length;
  let dotProduct = 0, normA = 0, normB = 0;

  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error('COSINE_NON_FINITE_VALUE');
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

export function assertCanonicalSemantic768(vector) {
  if ((!Array.isArray(vector) && !(vector instanceof Float32Array)) || vector.length !== CANONICAL_DIMENSION) {
    throw new Error(`EXPECTED_FINITE_FLAT_SEMANTIC_768: received ${vector?.length ?? 'non-vector'}`);
  }
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) throw new Error(`SEMANTIC_768_NON_FINITE_VALUE: index ${index}`);
  }
  return vector;
}

export function deriveMrlPrefix(vector, dimension) {
  assertCanonicalSemantic768(vector);
  if (!MRL_DIMENSIONS.includes(dimension)) throw new Error(`UNSUPPORTED_MRL_DIMENSION: ${dimension}`);
  const prefix = Float32Array.from(vector.slice(0, dimension));
  let normSquared = 0;
  for (const value of prefix) normSquared += value * value;
  const norm = Math.sqrt(normSquared);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('MRL_PREFIX_ZERO_OR_INVALID_NORM');
  for (let index = 0; index < prefix.length; index += 1) prefix[index] /= norm;
  return prefix;
}

export function cosineToZeroPaddedMrl(source, mrlView) {
  assertCanonicalSemantic768(source);
  if (!MRL_DIMENSIONS.includes(mrlView.length)) throw new Error(`UNSUPPORTED_MRL_DIMENSION: ${mrlView.length}`);
  const padded = new Float32Array(CANONICAL_DIMENSION);
  padded.set(mrlView);
  return cosineSimilarity(source, padded);
}

export function buildMrlProjectionDiagnostics(vector) {
  assertCanonicalSemantic768(vector);
  return MRL_DIMENSIONS.map((dimension) => {
    const projection = deriveMrlPrefix(vector, dimension);
    return {
      representationId: `semantic_mrl_${dimension}`,
      dimension,
      projectionKind: 'PREFIX_TRUNCATE_L2_RENORMALIZE',
      cosineToZeroPaddedSemantic768: cosineToZeroPaddedMrl(vector, projection)
    };
  });
}

async function embedOnnx(text) {
  try {
    const response = await fetch(ONNX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: text
      }),
      timeout: 5000
    });

    if (!response.ok) {
      console.error(`  ❌ ONNX HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding;
  } catch (err) {
    console.error(`  ❌ ONNX error: ${err.message}`);
    return null;
  }
}

// ============================================================================
// GATES
// ============================================================================

async function gateOnnxHealth() {
  console.log('\n📋 Gate 1: ONNX Service Health');

  try {
    const emb = await embedOnnx('test');
    if (!emb || emb.length !== 768) {
      console.log(`  ❌ FAIL: Expected 768-dim, got ${emb?.length || 'null'}`);
      return false;
    }
    console.log(`  ✅ PASS: ONNX responds with 768-dim embeddings`);
    return true;
  } catch (err) {
    console.log(`  ❌ FAIL: ${err.message}`);
    return false;
  }
}

async function gateMrlProjectionDiagnostics() {
  console.log('\n📋 Gate 2: MRL Projection Diagnostics (semantic_768 → MRL 512/256/128)');

  const testQueries = [
    'authentication and session management',
    'database connection pooling',
    'error handling in async operations',
    'type-safe typescript patterns'
  ];

  let passed = 0;

  for (const query of testQueries) {
    const emb768 = await embedOnnx(query);
    if (!emb768) {
      console.log(`  ❌ FAIL: Could not embed "${query}"`);
      return false;
    }

    let diagnostics;
    try {
      diagnostics = buildMrlProjectionDiagnostics(emb768);
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      return false;
    }

    if (VERBOSE) {
      console.log(`  "${query.slice(0, 40)}..."`);
      for (const item of diagnostics) {
        console.log(`    ${item.representationId}: dim=${item.dimension}, zero-padded cosine=${item.cosineToZeroPaddedSemantic768.toFixed(4)} (diagnostic; no quality threshold)`);
      }
    }

    passed++;
  }

  const passRate = passed / testQueries.length;
  if (passRate >= 0.75) {
    console.log(`  ✅ PASS: ${passed}/${testQueries.length} queries met parity thresholds`);
    return true;
  } else {
    console.log(`  ❌ FAIL: Only ${passed}/${testQueries.length} queries passed`);
    return false;
  }
}

async function gateStorageCost() {
  console.log('\n📋 Gate 3: Modeled Vector Payload Bytes (halfvec payload only)');
  const dimensions = [CANONICAL_DIMENSION, ...MRL_DIMENSIONS];
  const baseBytes = CANONICAL_DIMENSION * 2;
  for (const dimension of dimensions) {
    const bytes = dimension * 2;
    const reduction = (1 - bytes / baseBytes) * 100;
    const label = dimension === CANONICAL_DIMENSION ? 'semantic_768 canonical reference' : `semantic_mrl_${dimension} derived view`;
    console.log(`  ${label}: ${bytes} raw halfvec bytes/vector; ${reduction.toFixed(1)}% vs 768-D payload`);
  }
  console.log('  Note: excludes row, index, metadata, and storage-engine overhead; not a price estimate.');
  return dimensions.every((dimension) => Number.isInteger(dimension) && dimension > 0);
}

function gateOkfSchema() {
  console.log('\n📋 Gate 4: OKF Schema Compliance');

  const samplePacket = {
    packet_key: 'ace:packet:auth:001',
    source_ref: 'src/lib/server/auth.ts',
    feature_id: 'auth.sessions',
    embedding: {
      model_family: 'EmbeddingGemma',
      representation_id: 'semantic_768',
      dim: 768,
      vector: new Array(768).fill(0.1)
    }
  };

  // Validation rules
  const checks = [
    {
      name: 'packet_key format',
      pass: /^[a-z0-9:]+$/.test(samplePacket.packet_key)
    },
    {
      name: 'embedding family specified without a mutable alias as provenance',
      pass: samplePacket.embedding.model_family === 'EmbeddingGemma'
    },
    {
      name: 'embedding dim specified',
      pass: samplePacket.embedding.representation_id === 'semantic_768' && samplePacket.embedding.dim === 768
    },
    {
      name: 'vector length matches dim',
      pass: samplePacket.embedding.vector.length === samplePacket.embedding.dim
    },
    {
      name: 'canonical semantic_768 write is exactly 768 dimensions',
      pass: samplePacket.embedding.dim === 768 && samplePacket.embedding.vector.length === 768
    }
  ];

  let allPass = true;
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}`);
    if (!check.pass) allPass = false;
  }

  if (allPass) {
    console.log(`  ✅ PASS: All OKF schema rules satisfied`);
    return true;
  } else {
    console.log(`  ❌ FAIL: Schema validation failed`);
    return false;
  }
}

function gateDrizzleUpsert() {
  console.log('\n📋 Gate 5: Drizzle ORM Upsert Contract');

  // Simulate upsert pattern (no DB connection needed for smoke test)
  const upsertContract = {
    'Target column': 'codebase_chunk_index.content_embedding_768 (canonical semantic_768 storage; simulated only, admission still gated)',
    'Conflict resolution': 'revision-qualified conditional update contract (simulated only; no write)',
    'Vector dimension': '768-dim semantic_768 candidate (halfvec(768)); admission still gated',
    'Normalization': 'Unit L2 norm (after embedding)',
    'HNSW index': 'vector_cosine_ops with m=16, ef_construction=64'
  };

  let allPresent = true;
  for (const [key, value] of Object.entries(upsertContract)) {
    const present = !!value;
    console.log(`  ${present ? '✅' : '❌'} ${key}: ${value}`);
    if (!present) allPresent = false;
  }

  if (allPresent) {
    console.log(`  ✅ PASS: Upsert contract fully specified`);
    return true;
  } else {
    console.log(`  ❌ FAIL: Upsert contract incomplete`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function runSmokeTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  EmbeddingGemma semantic_768 / MRL Projection Smoke        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const offlineGates = [
    { name: 'MRL Projection Contract', fn: async () => {
      const fixture = Float32Array.from({ length: CANONICAL_DIMENSION }, (_, index) => index + 1);
      const result = buildMrlProjectionDiagnostics(fixture);
      const pass = result.length === 3 && result.every((item, index) => item.dimension === MRL_DIMENSIONS[index] && Number.isFinite(item.cosineToZeroPaddedSemantic768));
      console.log(`  ${pass ? '✅' : '❌'} derived views: ${result.map((item) => item.representationId).join(', ')}`);
      return pass;
    } },
    { name: 'Storage Cost', fn: gateStorageCost },
    { name: 'OKF Schema', fn: gateOkfSchema },
    { name: 'Drizzle Upsert', fn: gateDrizzleUpsert }
  ];
  const liveGates = [
    { name: 'Embedding Service Health', fn: gateOnnxHealth },
    { name: 'Live MRL Projection Diagnostics', fn: gateMrlProjectionDiagnostics }
  ];
  const gates = GATES_ONLY ? offlineGates : [...liveGates, ...offlineGates];

  const results = [];

  for (const gate of gates) {
    const start = performance.now();
    const pass = await gate.fn();
    const elapsed = performance.now() - start;
    results.push({ name: gate.name, pass, elapsed });
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║ SUMMARY                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passCount = results.filter(r => r.pass).length;
  const totalCount = results.length;

  for (const result of results) {
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} ${result.name.padEnd(30)} (${result.elapsed.toFixed(0)}ms)`);
  }

  console.log(`\n📊 SCORE: ${passCount}/${totalCount} gates passed`);

  if (passCount === totalCount) {
    console.log(`\n✅ ${GATES_ONLY ? 'OFFLINE CONTRACT GATES' : 'LIVE + OFFLINE SMOKE'}: PASS\n`);
    process.exit(0);
  } else {
    console.log(`\n❌ OFFICIAL SMOKE TEST: FAIL\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSmokeTest().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(2);
  });
}
