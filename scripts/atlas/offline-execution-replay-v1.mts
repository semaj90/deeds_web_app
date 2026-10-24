/**
 * Fixture-only offline chain (M12): frozen index -> local MapReduce-style aggregate -> Arrow IPC feature
 * artifact -> admitted read-back -> msgpack RPC descriptor -> token-budgeted ContextManifest -> execution manifest.
 *
 * Output layout (gitignored, run-scoped, immutable):
 *   .tmp/atlas/offline-pipeline/<run-id>/
 *     input-manifest.json  feature-schema.json  feature-matrix.arrow  rpc-descriptor.msgpack
 *     context-manifest.json  execution-manifest.json  receipts/{index,mapreduce,arrow,readback,rpc,context}.json
 *
 * Every file is created exclusively. No CouchDB push, no Valkey, PostgreSQL, Qdrant or Neo4j writes,
 * no canonical graph promotion, no model training. Every stage records expected, processed and failed
 * counts. A candidate counts as processed only if it passes the whole chain. Any failure halts the chain
 * and makes the terminal status BLOCKED.
 *
 * usage: npx tsx scripts/atlas/offline-execution-replay-v1.mts [--corrupt]
 *   --corrupt  writes a one-byte-altered copy of the artifact and reads that copy, to prove fail-closed behaviour.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { admitArrowArtifact } from './lib/arrow-artifact-admission-v1.mjs';
import {
  applyCouchDbOfflineBatchV1,
  createCouchDbOfflineBatchV1,
  createCouchDbReplayStateV1,
  readBackCouchDbOfflineBatchArtifactV1,
  summarizeCouchDbReplayV1,
  writeCouchDbOfflineBatchArtifactV1,
} from './lib/couchdb-offline-batch-v1.mjs';
import { reduceCouchDbReplaySummaryWithDuckDbV1, verifyCouchDbDuckDbSourceRollupV1 } from './lib/couchdb-duckdb-source-rollup-v1.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// msgpack is installed under sveltekit-frontend only; resolve it from there.
const frontendRequire = createRequire(path.join(REPO_ROOT, 'sveltekit-frontend', 'package.json'));
const { encode, decode } = frontendRequire('@msgpack/msgpack') as {
  encode: (value: unknown) => Uint8Array;
  decode: (bytes: Uint8Array) => unknown;
};

const corrupt = process.argv.includes('--corrupt');
const runId = `pipe-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const runDir = path.join(REPO_ROOT, '.tmp', 'atlas', 'offline-pipeline', runId);
const receiptsDir = path.join(runDir, 'receipts');

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const writeOnce = (file: string, data: string | Uint8Array) => writeFileSync(file, data, { flag: 'wx' });

// ---- fixture input (fixture only; not derived from production) -------------------------------
const fixture = {
  workspace_revision: 'fixture-ws-1',
  source_revision: 'fixture-src-1',
  graph_revision: 'fixture-graph-1',
  budget_tokens: 40,
  candidates: Array.from({ length: 6 }, (_, i) => ({
    candidate_id: `cand:${i + 1}`,
    source_ref: `fixture/${i % 2 === 0 ? 'api' : 'lib'}/file-${i + 1}.ts`,
    lex: i * 0.1,
    sem: 1 - i * 0.12,
    struct: (i % 3) * 0.5,
    summary: `Fixture summary for candidate ${i + 1}: source-grounded text used for context.`,
  })),
};
const couchDbBatch = createCouchDbOfflineBatchV1({
  sourceDatabase: 'fixture_parent_atlas',
  lastSequence: { fixture_sequence: fixture.candidates.length },
  changes: fixture.candidates.map((candidate, index) => ({
    id: `fixture-candidate-${index + 1}`,
    changes: [{ rev: `1-fixture-${index + 1}` }],
    doc: { _id: `fixture-candidate-${index + 1}`, _rev: `1-fixture-${index + 1}`, payload: candidate },
  })),
});
const initialReplay = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), couchDbBatch);
const replaySummary = summarizeCouchDbReplayV1(initialReplay.state);
const candidates = replaySummary.documents.filter((document) => !document.deleted).map((document) => document.document.payload);
const expected = candidates.length;
const inputSnapshotSha = sha(canonical({ fixture, couchdb_batch_sha256: couchDbBatch.batchDigest }));

type StageReceipt = {
  stage: string;
  status: 'PASS' | 'FAIL';
  expected: number;
  processed: number;
  failed: number;
  outputSha256?: string;
  reason?: string;
};
const stages: StageReceipt[] = [];
let halted = false;
const record = (receipt: StageReceipt, payload: unknown) => {
  stages.push(receipt);
  writeOnce(path.join(receiptsDir, `${receipt.stage.toLowerCase()}.json`), canonical({ ...receipt, input_snapshot_sha256: inputSnapshotSha, payload_sha256: payload ? sha(canonical(payload)) : null }));
  halted = receipt.status === 'FAIL';
};

mkdirSync(receiptsDir, { recursive: true });
writeOnce(path.join(runDir, 'input-manifest.json'), canonical({ run_id: runId, fixture: true, input_snapshot_sha256: inputSnapshotSha, couchdb_batch_sha256: couchDbBatch.batchDigest, workspace_revision: fixture.workspace_revision, source_revision: fixture.source_revision, graph_revision: fixture.graph_revision, expected_count: expected }));

// ---- stage 1: fixture CouchDB batch envelope and immutable artifact readback ----------------
let couchDbBatchReadbackValid = false;
if (!halted) {
  const batchDirectory = path.join(runDir, 'couchdb-batch');
  writeCouchDbOfflineBatchArtifactV1(couchDbBatch, batchDirectory);
  const readback = readBackCouchDbOfflineBatchArtifactV1(batchDirectory);
  couchDbBatchReadbackValid = readback.batch.batchDigest === couchDbBatch.batchDigest
    && readback.receipt.recordCount === expected
    && replaySummary.documentCount === expected;
  record({ stage: 'COUCHDB_BATCH', status: couchDbBatchReadbackValid ? 'PASS' : 'FAIL', expected, processed: readback.receipt.recordCount, failed: couchDbBatchReadbackValid ? 0 : expected, outputSha256: readback.receipt.receiptChecksum, reason: couchDbBatchReadbackValid ? undefined : 'COUCHDB_BATCH_READBACK_MISMATCH' }, readback.receipt);
}

// ---- stage 2: frozen index fixture (validate ids and finite values) -------------------------
const indexValid = candidates.filter((c) =>
  /^cand:\d+$/.test(c.candidate_id) && [c.lex, c.sem, c.struct].every((v) => Number.isFinite(v)));
record({ stage: 'INDEX', status: indexValid.length === expected ? 'PASS' : 'FAIL', expected, processed: indexValid.length, failed: expected - indexValid.length, reason: indexValid.length === expected ? undefined : 'INDEX_ROW_INVALID' }, candidates);

// ---- stage 3: DuckDB MapReduce aggregate (group by source directory; deterministic) ------------
let aggregate: Awaited<ReturnType<typeof reduceCouchDbReplaySummaryWithDuckDbV1>> | null = null;
let mapReduceArtifactSha: string | null = null;
if (!halted) {
  aggregate = await reduceCouchDbReplaySummaryWithDuckDbV1(replaySummary);
  const rollupPath = path.join(runDir, 'mapreduce-rollup.json');
  writeOnce(rollupPath, canonical(aggregate));
  const rollupBytes = readFileSync(rollupPath);
  const rollupReadback = JSON.parse(rollupBytes.toString('utf8'));
  const rollupVerification = verifyCouchDbDuckDbSourceRollupV1(rollupReadback);
  mapReduceArtifactSha = sha(rollupBytes);
  const total = rollupVerification.valid ? rollupReadback.aggregatedDocumentCount : 0;
  const mapReduceOk = rollupVerification.valid && rollupReadback.aggregateDigest === aggregate.aggregateDigest && total === expected;
  record({ stage: 'MAPREDUCE', status: mapReduceOk ? 'PASS' : 'FAIL', expected, processed: mapReduceOk ? total : 0, failed: mapReduceOk ? 0 : expected, outputSha256: mapReduceArtifactSha, reason: mapReduceOk ? undefined : (rollupVerification.reason ?? 'AGGREGATE_READBACK_MISMATCH') }, rollupReadback);
}

// ---- stage 4: Arrow IPC feature artifact -----------------------------------------------------
let artifactSha = '';
let artifactFile = path.join(runDir, 'feature-matrix.arrow');
const featureSchema = { fields: ['candidate_id:utf8', 'lex:f32', 'sem:f32', 'struct:f32'], row_count: expected, source_revision: fixture.source_revision };
if (!halted) {
  const table = tableFromArrays({
    candidate_id: candidates.map((c) => c.candidate_id),
    lex: Float32Array.from(candidates.map((c) => c.lex)),
    sem: Float32Array.from(candidates.map((c) => c.sem)),
    struct: Float32Array.from(candidates.map((c) => c.struct)),
  });
  const bytes = tableToIPC(table, 'file');
  artifactSha = sha(bytes);
  writeOnce(artifactFile, bytes);
  writeOnce(path.join(runDir, 'feature-schema.json'), canonical(featureSchema));
  if (corrupt) {
    // Fault injection: a copy with one byte flipped, read in place of the real artifact.
    const bad = Uint8Array.from(bytes);
    bad[Math.floor(bad.length / 2)] ^= 0xff;
    artifactFile = path.join(runDir, 'feature-matrix.corrupted.arrow');
    writeOnce(artifactFile, bad);
  }
  record({ stage: 'ARROW', status: 'PASS', expected, processed: expected, failed: 0, outputSha256: sha(bytes) }, featureSchema);
}

// ---- stage 5: admitted read-back (checksum, schema, dtype, row range, revision, finite) ------
const descriptorForAdmission = {
  artifact_sha256: artifactSha,
  schema: featureSchema.fields,
  row_range: [0, expected] as [number, number],
  row_count: expected,
  source_revision: fixture.source_revision,
};
let rpcSha = '';
let contextSha = '';
let admittedRows = 0;
if (!halted) {
  // Admission gate (M13 Phase B): every check runs before any row is returned.
  const admitted = await admitArrowArtifact(artifactFile, descriptorForAdmission, fixture.source_revision);
  let valuesMatch = false;
  if (admitted.ok && admitted.table) {
    const back = admitted.table;
    valuesMatch = back.numRows === expected && Array.from({ length: expected }, (_, i) =>
      Math.abs(back.getChild('sem')!.get(i)! - fixture.candidates[i].sem) < 1e-6).every(Boolean);
  }
  const readOk = admitted.ok && valuesMatch;
  admittedRows = readOk ? expected : 0;
  record({
    stage: 'READBACK',
    status: readOk ? 'PASS' : 'FAIL',
    expected,
    processed: admittedRows,
    failed: readOk ? 0 : expected,
    outputSha256: admitted.ok ? admitted.sha256 : undefined,
    reason: readOk ? undefined : (admitted.ok ? 'VALUE_MISMATCH' : admitted.reason),
  }, null);
}

// ---- stage 6: msgpack RPC descriptor (reference only, no values) -----------------------------
let descriptorBytes: Uint8Array = new Uint8Array();
if (!halted) {
  const descriptor = {
    artifact: 'feature-matrix.arrow',
    artifact_sha256: artifactSha,
    schema: featureSchema.fields,
    row_range: [0, expected],
    workspace_revision: fixture.workspace_revision,
    source_revision: fixture.source_revision,
    graph_revision: fixture.graph_revision,
  };
  descriptorBytes = encode(descriptor);
  writeOnce(path.join(runDir, 'rpc-descriptor.msgpack'), descriptorBytes);
  rpcSha = sha(descriptorBytes);
  const roundTrip = decode(descriptorBytes) as { artifact_sha256: string; row_range: number[] };
  const ok = roundTrip.artifact_sha256=== artifactSha && roundTrip.row_range[1] === expected;
  record({ stage: 'RPC', status: ok ? 'PASS' : 'FAIL', expected, processed: ok ? expected : 0, failed: ok ? 0 : expected, outputSha256: rpcSha, reason: ok ? undefined : 'DESCRIPTOR_ROUNDTRIP_FAILED' }, descriptor);
}

// ---- stage 7: token-budgeted ContextManifest, selected evidence only ------------------------
let selected: Array<{ candidate_id: string; source_ref: string; source_revision: string; est_tokens: number }> = [];
if (!halted) {
  const ranked = [...fixture.candidates].sort((a, b) => b.sem - a.sem || a.candidate_id.localeCompare(b.candidate_id));
  let used = 0;
  for (const c of ranked) {
    const est = Math.ceil(c.summary.length / 4);
    if (used + est > fixture.budget_tokens) continue;
    used += est;
    selected.push({ candidate_id: c.candidate_id, source_ref: c.source_ref, source_revision: fixture.source_revision, est_tokens: est });
  }
  const manifest = { budget_tokens: fixture.budget_tokens, used_tokens: selected.reduce((s, x) => s + x.est_tokens, 0), selected };
  const manifestText = canonical(manifest);
  contextSha = sha(manifestText);
  writeOnce(path.join(runDir, 'context-manifest.json'), manifestText);
  const ok = manifest.used_tokens <= fixture.budget_tokens && selected.length > 0;
  record({ stage: 'CONTEXT', status: ok ? 'PASS' : 'FAIL', expected: 1, processed: ok ? 1 : 0, failed: ok ? 0 : 1, outputSha256: contextSha, reason: ok ? undefined : 'EMPTY_OR_OVER_BUDGET' }, manifest);
}

// ---- execution manifest: joins every stage receipt --------------------------------------------
const allPass = stages.length === 7 && stages.every((r) => r.status === 'PASS');
const processed = allPass ? expected : 0;
const execution = {
  schema: 'atlas.offline-pipeline-execution-manifest.v1',
  fixture: true,
  canonicalAuthority: false,
  run_id: runId,
  workspace_revision: fixture.workspace_revision,
  source_revision: fixture.source_revision,
  graph_revision: fixture.graph_revision,
  input_snapshot_sha256: inputSnapshotSha,
  couchdb_batch_sha256: couchDbBatch.batchDigest,
  couchdb_replay_summary_sha256: replaySummary.summaryDigest,
  mapreduce_rollup_artifact_sha256: mapReduceArtifactSha,
  stage_receipts: stages,
  artifact_sha256: artifactSha || null,
  rpc_descriptor_sha256: rpcSha || null,
  context_manifest_sha256: contextSha || null,
  expected_count: expected,
  processed_count: processed,
  failed_count: expected - processed,
  writes_performed: { valkey: false, postgres: false, qdrant: false, neo4j: false, couchdb: false, canonical_graph: false, files: 'run directory .tmp/atlas/offline-pipeline only' },
  fault_injection: corrupt,
  terminal_status: allPass ? 'COMPLETED' : 'BLOCKED',
};
writeOnce(path.join(runDir, 'execution-manifest.json'), canonical(execution));
console.log(JSON.stringify({ run: path.relative(REPO_ROOT, runDir), terminal_status: execution.terminal_status, expected: expected, processed: processed, failed: execution.failed_count, stages: stages.map((s) => `${s.stage}=${s.status}`) }, null, 2));
process.exit(allPass ? 0 : 1);
