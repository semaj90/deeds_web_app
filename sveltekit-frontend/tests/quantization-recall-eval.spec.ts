// @vitest-environment node

/**
 * P2.5 — per-vector minmax-uint8 quantization recall evaluation.
 *
 * Three layers of evidence:
 *   Layer 1 — JSON artifact (ATLAS_EVAL_ARTIFACTS=1 or ATLAS_EVAL_PERSIST=1)
 *   Layer 2 — PostgreSQL rows    (ATLAS_EVAL_PERSIST=1)
 *   Layer 3 — Concise CI summary (always printed)
 *
 * Default (no env flags): hermetic — no disk writes, no DB, one console block.
 *
 * Quantizer under test: per-vector minmax-uint8 (quantize.ts)
 *   NOT Qdrant signed INT8 scalar quantization.
 *   See quantization-recall-eval.ts for contract details.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import {
  runQuantizationRecallEval,
  writeEvalArtifact,
  printEvalSummary,
  persistEvalToDb,
  EVAL_GATES,
} from '../src/lib/server/vector/quantization-recall-eval.js';

// ---------------------------------------------------------------------------
// Run once for the whole suite
// ---------------------------------------------------------------------------

const REPORT = runQuantizationRecallEval({
  vectorCount: 1000,
  queryCount: 100,
  dimension: 64,
  seed: 42,
  k: 10,
});

// Resolve artifact path once (may or may not exist on disk)
const WRITE_ARTIFACT =
  process.env.ATLAS_EVAL_ARTIFACTS === '1' || process.env.ATLAS_EVAL_PERSIST === '1';
const PERSIST_DB = process.env.ATLAS_EVAL_PERSIST === '1';

let artifactRelPath: string | undefined;

afterAll(async () => {
  // Layer 1: JSON artifact
  if (WRITE_ARTIFACT) {
    const root = join(process.cwd());
    artifactRelPath = writeEvalArtifact(REPORT, root);
  }

  // Layer 3: console summary (always)
  printEvalSummary(REPORT, artifactRelPath);

  // Layer 2: DB persistence
  if (PERSIST_DB && artifactRelPath) {
    try {
      await persistEvalToDb(REPORT, artifactRelPath);
    } catch (err) {
      // Non-fatal — evaluation still passes without a live DB
      console.warn('[P2.5] DB persist skipped:', (err as Error).message);
    }
  }
});

// ---------------------------------------------------------------------------
// Schema & metadata assertions
// ---------------------------------------------------------------------------

describe('P2.5 report schema', () => {
  it('carries schemaVersion atlas-quantization-recall-v1', () => {
    expect(REPORT.schemaVersion).toBe('atlas-quantization-recall-v1');
  });

  it('identifies quantizer as per-vector-minmax-uint8', () => {
    expect(REPORT.quantizer.implementation).toBe('per-vector-minmax-uint8');
  });

  it('identifies storage type as uint8', () => {
    expect(REPORT.quantizer.storageType).toBe('uint8');
  });

  it('identifies comparison type as dequantized-float32', () => {
    expect(REPORT.quantizer.comparisonType).toBe('dequantized-float32');
  });

  it('carries corpus hash and query hash', () => {
    expect(REPORT.corpus.corpusHash).toHaveLength(16);
    expect(REPORT.corpus.querySetHash).toHaveLength(16);
  });

  it('perQuery length matches queryCount', () => {
    expect(REPORT.perQuery).toHaveLength(REPORT.corpus.queryCount);
  });

  it('each perQuery row has all required fields', () => {
    for (const pq of REPORT.perQuery) {
      expect(typeof pq.queryId).toBe('string');
      expect(pq.float32Top10).toHaveLength(10);
      expect(pq.quantizedTop10).toHaveLength(10);
      expect(typeof pq.latencyFloat32Ms).toBe('number');
      expect(typeof pq.latencyQuantizedMs).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Primary acceptance gate: recall@10 ≥ 0.98
// ---------------------------------------------------------------------------

describe('P2.5 primary gate — recall@10', () => {
  it(`mean recall@10 >= ${EVAL_GATES.recallAt10}`, () => {
    expect(REPORT.aggregate.recallAt10).toBeGreaterThanOrEqual(EVAL_GATES.recallAt10);
  });
});

// ---------------------------------------------------------------------------
// Tail guard: no more than 2% of queries may have recall@10 < 0.80
// A high average can conceal catastrophic individual failures.
// ---------------------------------------------------------------------------

describe('P2.5 tail guard', () => {
  it(`tail fail fraction < ${EVAL_GATES.tailGuardMaxFailFraction} (recall<${EVAL_GATES.tailGuardMinRecall})`, () => {
    expect(REPORT.aggregate.tailFailFraction).toBeLessThanOrEqual(
      EVAL_GATES.tailGuardMaxFailFraction,
    );
  });
});

// ---------------------------------------------------------------------------
// Top-1 agreement gate
// ---------------------------------------------------------------------------

describe('P2.5 top-1 agreement', () => {
  it(`exact top-1 agreement >= ${EVAL_GATES.exactTop1Agreement}`, () => {
    expect(REPORT.aggregate.exactTop1Agreement).toBeGreaterThanOrEqual(
      EVAL_GATES.exactTop1Agreement,
    );
  });
});

// ---------------------------------------------------------------------------
// Cosine error gates
// ---------------------------------------------------------------------------

describe('P2.5 cosine error', () => {
  it(`mean cosine error <= ${EVAL_GATES.meanCosineError}`, () => {
    expect(REPORT.aggregate.meanCosineError).toBeLessThanOrEqual(EVAL_GATES.meanCosineError);
  });

  it(`p95 cosine error <= ${EVAL_GATES.p95CosineError}`, () => {
    expect(REPORT.aggregate.p95CosineError).toBeLessThanOrEqual(EVAL_GATES.p95CosineError);
  });
});

// ---------------------------------------------------------------------------
// Latency structural checks (not gated — latency varies by machine)
// ---------------------------------------------------------------------------

describe('P2.5 latency structure', () => {
  it('float32 search latency values are positive numbers', () => {
    const l = REPORT.latency.float32SearchMs;
    expect(l.p50).toBeGreaterThan(0);
    expect(l.p95).toBeGreaterThanOrEqual(l.p50);
    expect(l.p99).toBeGreaterThanOrEqual(l.p95);
  });

  it('quantized search latency values are positive numbers', () => {
    const l = REPORT.latency.quantizedSearchMs;
    expect(l.p50).toBeGreaterThan(0);
    expect(l.p95).toBeGreaterThanOrEqual(l.p50);
    expect(l.p99).toBeGreaterThanOrEqual(l.p95);
  });
});

// ---------------------------------------------------------------------------
// Gate object coherence
// ---------------------------------------------------------------------------

describe('P2.5 gate object', () => {
  it('gate.status matches aggregate.pass', () => {
    expect(REPORT.gate.status).toBe(REPORT.aggregate.pass ? 'PASS' : 'FAIL');
  });

  it('gate.reasons is empty when pass=true', () => {
    if (REPORT.aggregate.pass) {
      expect(REPORT.gate.reasons).toHaveLength(0);
    }
  });
});
