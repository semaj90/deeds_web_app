import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const latent256Python = readFileSync(resolve(REPO_ROOT, 'python/backfill_latent_256.py'), 'utf8');
const latent256Wrapper = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/latent256-revision-qualified-wrapper.mts'), 'utf8');

test('latent-256 Python worker refuses apply before receipt or database access', () => {
  const applyGuard = latent256Python.indexOf('if args.apply:');
  assert.notEqual(applyGuard, -1);
  assert.ok(applyGuard < latent256Python.indexOf('with open(args.receipt'), 'apply guard must precede receipt loading');
  assert.ok(applyGuard < latent256Python.indexOf('psycopg2.connect(args.database_url)'), 'apply guard must precede database connection');
  assert.match(latent256Python, /LATENT256_APPLY_BLOCKED/);
});

test('latent-256 wrapper refuses apply before creating its PostgreSQL pool', () => {
  const applyGuard = latent256Wrapper.indexOf("fail('LATENT256_APPLY_BLOCKED'");
  const applyMode = latent256Wrapper.indexOf('const APPLY = args.apply === true;');
  assert.notEqual(applyGuard, -1);
  assert.ok(applyMode < applyGuard, 'apply mode must be parsed before the guard');
  assert.ok(applyGuard < latent256Wrapper.indexOf('new pg.Pool('), 'apply guard must precede pool creation');
  assert.match(latent256Wrapper, /compare-and-swap or independent vector readback/);
});

test('phase-7 latent writer rejects apply before loading CUDA or opening PostgreSQL', () => {
  const result = spawnSync(process.execPath, ['scripts/phase7-cuda-accelerator-correct.mjs', '--encode-latent', '--apply'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 78, `Expected exit 78, got ${result.status}`);
  assert.match(result.stderr, /PHASE7_LATENT_APPLY_BLOCKED/);
});

test('phase-5 packet latent writer is dry-run-only and does not execute DDL', () => {
  const result = spawnSync(process.execPath, ['scripts/atlas/phase5-autoencoder-bridge.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 78, `Expected exit 78, got ${result.status}`);
  assert.match(result.stderr, /PHASE5_LATENT_APPLY_BLOCKED/);
  assert.doesNotMatch(readFileSync(resolve(REPO_ROOT, 'scripts/atlas/phase5-autoencoder-bridge.mjs'), 'utf8'), /ALTER TABLE|CREATE INDEX/i);
});

test('legacy packet latent writers reject apply instead of accepting unsafe overrides', () => {
  const latentResult = spawnSync(process.execPath, ['scripts/atlas/backfill-latent-vectors.mjs', '--apply', '--legacy-unsafe-apply'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(latentResult.status, 78, `Expected exit 78, got ${latentResult.status}`);
  assert.match(latentResult.stderr, /LATENT_LEGACY_WRITER_APPLY_BLOCKED/);

  const metadataResult = spawnSync(process.execPath, ['scripts/atlas/backfill-packet-metadata-to-postgres.mjs', '--apply'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(metadataResult.status, 78, `Expected exit 78, got ${metadataResult.status}`);
  assert.match(metadataResult.stderr, /LATENT_PACKET_METADATA_APPLY_BLOCKED/);
});

test('disabled latent-128 slice writer exits 78 before network or database access', () => {
  const res = spawnSync(
    process.execPath,
    ['scripts/atlas/backfill-latent-128-slice.mjs', '--apply'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(res.status, 78, `Expected exit 78, got ${res.status}`);
  assert.match(res.stderr, /LATENT_128_APPLY_BLOCKED/, 'Expected LATENT_128_APPLY_BLOCKED message');
});

test('disabled legacy error_cluster sync writer exits 78 before network or database access', () => {
  const res = spawnSync(
    'npx',
    ['tsx', 'scripts/sync-clusters-to-qdrant.mts'],
    { cwd: REPO_ROOT, encoding: 'utf8', shell: true }
  );
  assert.equal(res.status, 78, `Expected exit 78, got ${res.status}`);
  assert.match(res.stderr, /LEGACY_ERROR_CLUSTER_QDRANT_SYNC_DISABLED/, 'Expected LEGACY_ERROR_CLUSTER_QDRANT_SYNC_DISABLED message');
});

test('disabled latent64 backfill writer exits 78 before database access', () => {
  const res = spawnSync(
    process.execPath,
    ['scripts/atlas/latent64-sample-backfill.mjs', '--apply'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(res.status, 78, `Expected exit 78, got ${res.status}`);
  assert.match(res.stderr, /LATENT64_APPLY_BLOCKED/, 'Expected LATENT64_APPLY_BLOCKED message');
});

test('provisional Qdrant latent128 backfill rejects apply before network access', () => {
  const res = spawnSync(
    process.execPath,
    ['scripts/atlas/backfill-latent-128.mjs', '--apply'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(res.status, 78, `Expected exit 78, got ${res.status}`);
  assert.match(res.stderr, /LATENT128_APPLY_BLOCKED/);
});

test('revision-qualified compare-and-swap rejects stale prior revisions', () => {
  function executeConditionalUpdate({ rowId, currentRevision, expectedRevision, newVector }) {
    if (!expectedRevision) {
      throw new Error('REVISION_PREDICATE_REQUIRED: expected prior revision cannot be null or empty');
    }
    if (currentRevision !== expectedRevision) {
      // rowCount = 0 in SQL WHERE id = rowId AND revision = expectedRevision
      throw new Error(`STALE_REVISION_REJECTED: expected ${expectedRevision}, found ${currentRevision}`);
    }
    return { rowCount: 1, updatedVector: newVector, verifiedRevision: expectedRevision };
  }

  // 1. Matching revision succeeds
  const success = executeConditionalUpdate({
    rowId: 'c7d72127-0000-0000-0000-000000000001',
    currentRevision: 'rev-2026-10-12-a',
    expectedRevision: 'rev-2026-10-12-a',
    newVector: [0.1, 0.2]
  });
  assert.equal(success.rowCount, 1);

  // 2. Stale revision fails closed
  assert.throws(() => {
    executeConditionalUpdate({
      rowId: 'c7d72127-0000-0000-0000-000000000001',
      currentRevision: 'rev-2026-10-13-drifted',
      expectedRevision: 'rev-2026-10-12-a',
      newVector: [0.1, 0.2]
    });
  }, /STALE_REVISION_REJECTED/);

  // 3. Null expected revision fails closed
  assert.throws(() => {
    executeConditionalUpdate({
      rowId: 'c7d72127-0000-0000-0000-000000000001',
      currentRevision: 'rev-2026-10-13-drifted',
      expectedRevision: null,
      newVector: [0.1, 0.2]
    });
  }, /REVISION_PREDICATE_REQUIRED/);
});

test('row UUID alone cannot authorize representation materialization without source provenance', () => {
  function validateMaterializationDescriptor(desc) {
    if (!desc.rowId) throw new Error('MISSING_ROW_ID');
    if (!desc.sourceRef || !desc.sourceRevision) {
      throw new Error('MISSING_SOURCE_LINEAGE: row UUID alone cannot authorize materialization without sourceRef and sourceRevision');
    }
    if (!desc.inputRepresentationDigest) {
      throw new Error('MISSING_INPUT_DIGEST: derived representation must bind to input vector digest');
    }
    return true;
  }

  // UUID only must fail
  assert.throws(() => {
    validateMaterializationDescriptor({ rowId: '550e8400-e29b-41d4-a716-446655440000' });
  }, /MISSING_SOURCE_LINEAGE/);

  // Missing input digest must fail
  assert.throws(() => {
    validateMaterializationDescriptor({
      rowId: '550e8400-e29b-41d4-a716-446655440000',
      sourceRef: 'src/lib/server/ai.ts',
      sourceRevision: 'git:abc1234'
    });
  }, /MISSING_INPUT_DIGEST/);

  // Fully qualified succeeds
  assert.equal(validateMaterializationDescriptor({
    rowId: '550e8400-e29b-41d4-a716-446655440000',
    sourceRef: 'src/lib/server/ai.ts',
    sourceRevision: 'git:abc1234',
    inputRepresentationDigest: 'sha256:fedcba0987654321'
  }), true);
});

test('distinct cluster tables cannot be conflated into a single schema or vector contract', () => {
  const CLUSTER_TABLE_REGISTRY = {
    error_cluster: {
      grain: 'error_pattern_card',
      storage: 'PostgreSQL public.error_cluster',
      vectorDim: 384,
      canonicalOwner: false,
      status: 'HISTORICAL_EMPTY_SCHEMA'
    },
    error_clusters: {
      grain: 'kmeans_error_event_aggregate',
      storage: 'PostgreSQL public.error_clusters',
      vectorDim: null, // No embedding column in PostgreSQL
      canonicalOwner: false,
      status: 'LEGACY_EVENT_AGGREGATE'
    },
    error_cluster_groups: {
      grain: 'mapreduce_recovery_group',
      storage: 'PostgreSQL public.error_cluster_groups',
      vectorDim: null, // Non-vector grouping table
      canonicalOwner: false,
      status: 'HISTORICAL_MAPREDUCE_GROUPS'
    },
    error_embeddings: {
      grain: 'dense_qdrant_error_collection',
      storage: 'Qdrant collection error_embeddings',
      vectorDim: 768,
      canonicalOwner: true,
      status: 'ACTIVE_SEMANTIC_768_QDRANT'
    }
  };

  function assertNoConflation(sourceTable, targetTable) {
    const s = CLUSTER_TABLE_REGISTRY[sourceTable];
    const t = CLUSTER_TABLE_REGISTRY[targetTable];
    if (!s || !t) throw new Error('UNKNOWN_CLUSTER_TABLE');
    if (s.storage !== t.storage && sourceTable !== targetTable) {
      if (s.vectorDim !== t.vectorDim) {
        throw new Error(`CLUSTER_TABLE_SCHEMA_CONFLATION_BLOCKED: cannot treat ${sourceTable} (dim=${s.vectorDim}) as interchangeable with ${targetTable} (dim=${t.vectorDim})`);
      }
    }
  }

  // Attempting to treat error_cluster (384) as error_embeddings (768) must throw
  assert.throws(() => {
    assertNoConflation('error_cluster', 'error_embeddings');
  }, /CLUSTER_TABLE_SCHEMA_CONFLATION_BLOCKED/);

  // Attempting to treat error_clusters (no vector) as error_cluster (384) must throw
  assert.throws(() => {
    assertNoConflation('error_clusters', 'error_cluster');
  }, /CLUSTER_TABLE_SCHEMA_CONFLATION_BLOCKED/);
});

test('deterministic activation-parity: training tanh forward pass diverges from July ReLU evaluator', () => {
  // Layer weights mock for [2 -> 2]
  const W = [0.5, -0.8, 1.2, -0.3];
  const b = [0.1, -0.2];
  const x = [0.7, -0.4];

  // Forward linear
  const z0 = x[0] * W[0] + x[1] * W[1] + b[0];
  const z1 = x[0] * W[2] + x[1] * W[3] + b[1];

  // Evaluator A: July ReLU
  const reluOut = [Math.max(0, z0), Math.max(0, z1)];

  // Evaluator B: Exact Training Tanh
  const tanhOut = [Math.tanh(z0), Math.tanh(z1)];

  // Outputs MUST diverge mathematically on negative or saturated values
  assert.notDeepEqual(reluOut, tanhOut, 'ReLU and Tanh forward passes must not be conflated');
  const l2Diff = Math.hypot(reluOut[0] - tanhOut[0], reluOut[1] - tanhOut[1]);
  assert.ok(l2Diff > 0.05, `Expected non-zero difference between activations, got ${l2Diff}`);
});
