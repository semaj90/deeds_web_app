// OMR-MSGPACK-RPC-PACKET-01 diagnostic chain (Phases C, D, E).
//   PostgreSQL snapshot digest -> DuckDB reducer input -> diagnostic aggregate digest -> MessagePack envelope digest -> decode readback
// Run from sveltekit-frontend: npx tsx ../scripts/atlas/omr-msgpack-e2e-v1.mts <snapshot.ndjson>
// Writes only under .tmp/atlas/omr-msgpack. Overall authority: DIAGNOSTIC_ONLY_NOT_ADMITTED.
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPacketReductionDescriptorV1,
  decodePacketDescriptorV1,
  encodePacketDescriptorV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/transport/omr-feature-reduction-descriptor-v1.js';
import { diagnosticChainReceiptChecksumV1, mapDiagnosticChainReceiptV1 } from '../../sveltekit-frontend/src/lib/server/observability/offline-receipt-telemetry-v1.js';
import { classifyPacketRow, reduceSnapshotV1 } from './omr-duckdb-reduce-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromFrontend = createRequire(path.join(ROOT, 'sveltekit-frontend', 'package.json'));
const Ajv2020 = requireFromFrontend('ajv/dist/2020.js').default;
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');
const sha256File = (f: string) => `sha256:${createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`;
const ALLOWED_REASONS = new Set(['MISSING_PACKET_KEY', 'MISSING_SOURCE_REVISION', 'INVALID_SOURCE_REVISION', 'MISSING_FEATURE_ID', 'MISSING_SOURCE_REF', 'QUALIFIED']);

type Stage = { verdict: string; checks: Record<string, boolean>; error?: string };
const stages: Record<string, Stage> = {};
const fail = (name: string, error: string) => { stages[name] = { verdict: 'FAILED', checks: {}, error }; };

const snapshotFile = path.resolve(process.argv[2] ?? '');
const snapshotReceiptFile = snapshotFile.replace(/\.ndjson$/, '-receipt.json');
const snapshotReceiptBytes = fs.readFileSync(snapshotReceiptFile);
const snapshotReceipt = JSON.parse(snapshotReceiptBytes.toString('utf8'));
const snapshotDigest = sha256File(snapshotFile);
const rows = fs.readFileSync(snapshotFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (snapshotReceipt.schema !== 'atlas.omr-msgpack.packet-snapshot-receipt.v1'
  || snapshotReceipt.status !== 'CAPTURED_NOT_ADMITTED'
  || snapshotReceipt.source?.database !== 'legal_ai_db'
  || snapshotReceipt.source?.table !== 'atlas_packets'
  || snapshotReceipt.writesPerformed !== false
  || snapshotReceipt.canonicalWrites !== 'DISABLED'
  || snapshotReceipt.artifact?.file !== rel(snapshotFile)
  || snapshotReceipt.artifact?.digest !== snapshotDigest
  || snapshotReceipt.artifact?.rows !== rows.length) {
  throw new Error('SNAPSHOT_RECEIPT_CONTENT_INVALID');
}
const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomUUID()}`;
const runDirectory = path.join(ROOT, '.tmp', 'atlas', 'omr-msgpack', 'runs', runId);
fs.mkdirSync(path.dirname(runDirectory), { recursive: true });
fs.mkdirSync(runDirectory);

// ── Stage C: DuckDB reduction verification ──────────────────────────────────────────────
let envelopeRecord: { envelope: any; envelopeBytesDigest: string; reduceReceiptDigest: string; packetKey: string } | null = null;
let c:{ receipt: any; outputFile: string; receiptFile: string; output: any } | null = null;
try {
  const first = reduceSnapshotV1({ snapshotFile, snapshotReceiptDigest: snapshotReceipt.artifact.digest, outDir: runDirectory, runId: 'replay-a' });
  const second = reduceSnapshotV1({ snapshotFile, snapshotReceiptDigest: snapshotReceipt.artifact.digest, outDir: runDirectory, runId: 'replay-b' });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[classifyPacketRow(r)] = (counts[classifyPacketRow(r)] ?? 0) + 1;
  const qualifiedRows = rows.filter((r) => classifyPacketRow(r) === 'QUALIFIED');
  const distinctFeatures = new Set(qualifiedRows.map((r) => r.feature_id)).size;
  const distinctPacketKeys = new Set(qualifiedRows.map((r) => r.packet_key)).size;
  stages.C_DUCKDB_REDUCE = {
    verdict: 'DIAGNOSTIC_REDUCE_VERIFIED',
    checks: {
      SNAPSHOT_SHA256_MATCHES_RECEIPT: snapshotDigest === snapshotReceipt.artifact.digest,
      ROW_COUNT_MATCHES_RECEIPT: rows.length === snapshotReceipt.artifact.rows,
      QUALIFIED_IS_16151: qualifiedRows.length === 16151,
      EXCLUDED_IS_45567: rows.length - qualifiedRows.length === 45567,
      REASONS_EXHAUSTIVE_AND_EXCLUSIVE: Object.values(counts).reduce((a, b) => a + b, 0) === rows.length && Object.keys(counts).every((k) => ALLOWED_REASONS.has(k)),
      DISTINCT_COUNTS_FROM_ROWS: distinctPacketKeys === first.output.distinctPacketKeys && distinctFeatures === first.output.distinctFeatures,
      DETERMINISTIC_ACROSS_TWO_RUNS: first.receipt.outputDigest === second.receipt.outputDigest,
      OUTPUT_REREAD_VERIFIED: first.receipt.readback.outputDigestReread === true && sha256File(first.outputFile) === first.receipt.outputDigest,
    },
  };
  c ={ receipt: first.receipt, outputFile: first.outputFile, receiptFile: first.receiptFile, output: first.output };
  if (Object.values(stages.C_DUCKDB_REDUCE.checks).some((v) => !v)) stages.C_DUCKDB_REDUCE.verdict = 'FAILED';
} catch (e) {
  fail('C_DUCKDB_REDUCE', (e as Error).message);
}

// ── Stage D: MessagePack descriptor over the existing transport owner ────────────────────
if (c) {
  try {
    const packet = rows.filter((r) => classifyPacketRow(r) === 'QUALIFIED').sort((a, b) => (a.packet_key < b.packet_key ? -1 : 1))[0];
    const reduceReceiptDigest = sha256File(c.receiptFile);
    const descriptor = buildPacketReductionDescriptorV1({
      packet: { packet_key: packet.packet_key, source_revision: packet.source_revision, feature_id: packet.feature_id, source_ref: packet.source_ref },
      receipt: { ...c.receipt, outputFile: rel(c.outputFile) },
      snapshotDigest,
      reduceReceiptDigest,
    });
    const expect = { packet_key: packet.packet_key, artifact_digest: c.receipt.outputDigest, snapshot_digest: snapshotDigest, reduce_receipt_digest: reduceReceiptDigest, workspace_revision: null };
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, '.okf', 'schemas', 'tensor-kv-rpc-packet-v1.schema.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    const envelope = encodePacketDescriptorV1(descriptor);
    const decoded = decodePacketDescriptorV1(envelope, expect);
    const descriptorDirectory = path.join(runDirectory, 'messagepack');
    fs.mkdirSync(descriptorDirectory);
    const descriptorFile = path.join(descriptorDirectory, 'packet-descriptor.msgpack');
    const descriptorFd = fs.openSync(descriptorFile, 'wx');
    try {
      fs.writeFileSync(descriptorFd, Buffer.from(envelope.payloadBytes));
      fs.fsyncSync(descriptorFd);
    } finally {
      fs.closeSync(descriptorFd);
    }
    const persistedPayload = fs.readFileSync(descriptorFile);
    const persistedEnvelope = { ...envelope, payloadBytes: new Uint8Array(persistedPayload) };
    const persistedDecoded = decodePacketDescriptorV1(persistedEnvelope, expect);
    const refused = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
    const checks = {
      SCHEMA_VALID: validate(descriptor) === true,
      ENCODE_DECODE_EQUIVALENT: JSON.stringify(decoded) === JSON.stringify(descriptor),
      PERSISTED_PAYLOAD_DIGEST_MATCHES: sha256File(descriptorFile) === `sha256:${createHash('sha256').update(envelope.payloadBytes).digest('hex')}`,
      PERSISTED_PAYLOAD_DECODE_EQUIVALENT: JSON.stringify(persistedDecoded) === JSON.stringify(descriptor),
      TAMPERED_PAYLOAD_REFUSED: refused(() => decodePacketDescriptorV1({ ...envelope, payloadBytes: new Uint8Array(envelope.payloadBytes).fill(0) }, expect)),
      WRONG_PACKET_REFUSED: refused(() => decodePacketDescriptorV1(envelope, { ...expect, packet_key: 'pk-not-in-set' })),
      WRONG_ARTIFACT_REFUSED: refused(() => decodePacketDescriptorV1(envelope, { ...expect, artifact_digest: `sha256:${'0'.repeat(64)}` })),
      CROSS_REVISION_REFUSED: refused(() => decodePacketDescriptorV1(envelope, { ...expect, workspace_revision: `sha256:${'9'.repeat(64)}` })),
    };
    stages.D_MSGPACK = { verdict: Object.values(checks).every(Boolean) ? 'MSGPACK_ROUNDTRIP_VERIFIED' : 'FAILED', checks };
    envelopeRecord = {
      envelope,
      descriptorFile,
      descriptorByteLength: persistedPayload.byteLength,
      envelopeBytesDigest: `sha256:${createHash('sha256').update(persistedPayload).digest('hex')}`,
      reduceReceiptDigest,
      packetKey: packet.packet_key,
    };
  } catch (e) {
    fail('D_MSGPACK', (e as Error).message);
  }
}

// ── Stage E: chain receipt ─────────────────────────────────────────────────────────────
const env = envelopeRecord;
const chainChecks = {
  SNAPSHOT_DIGEST_BOUND_TO_REDUCE: !!c && c.receipt.inputDigest === snapshotDigest,
  ARTIFACT_DIGEST_BOUND_TO_DESCRIPTOR: !!c && !!env && env.reduceReceiptDigest === sha256File(c.receiptFile),
  ENVELOPE_DIGEST_RECORDED: !!env,
  MESSAGEPACK_ARTIFACT_PERSISTED_AND_READ_BACK: !!env && fs.existsSync(env.descriptorFile) && sha256File(env.descriptorFile) === env.envelopeBytesDigest,
};
const upstreamOk = stages.C_DUCKDB_REDUCE?.verdict === 'DIAGNOSTIC_REDUCE_VERIFIED' && stages.D_MSGPACK?.verdict === 'MSGPACK_ROUNDTRIP_VERIFIED';
stages.E_CHAIN = { verdict: upstreamOk && Object.values(chainChecks).every(Boolean) ? 'DIAGNOSTIC_CHAIN_VERIFIED' : 'FAILED', checks: chainChecks };

const order = ['C_DUCKDB_REDUCE', 'D_MSGPACK', 'E_CHAIN'];
const firstFailing = order.find((k) => !stages[k] || stages[k].verdict === 'FAILED') ?? null;
const receipt = {
  schema: 'atlas.omr-msgpack-e2e-receipt.v1',
  runId,
  overallAuthority: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
  firstFailingBoundary: firstFailing,
  stages,
  rejectionCounts: c ? c.receipt.rejections : null,
  links: {
    snapshot: { file: rel(snapshotFile), digest: snapshotDigest, receiptFile: rel(snapshotReceiptFile), receiptDigest: sha256File(snapshotReceiptFile) },
    reduce: c ? { file: rel(c.receiptFile), outputFile: rel(c.outputFile), outputDigest: c.receipt.outputDigest } : null,
    messagepack: env ? {
      schema: env.envelope.schema,
      canonicalJsonChecksum: env.envelope.canonicalJsonChecksum,
      byteLength: env.descriptorByteLength,
      descriptorFile: rel(env.descriptorFile),
      descriptorDigest: env.envelopeBytesDigest,
      envelopePayloadBytesDigest: env.envelopeBytesDigest,
      packetKey: env.packetKey,
    } : null,
  },
  workspace_revision: 'NOT_ADMITTED',
  canonicalAuthority: false,
  writesPerformed: false,
  canonicalWrites: 'DISABLED',
  graphifyPromotion: 'NOT_PERFORMED',
  mastraSynthesis: 'NOT_PERFORMED',
};
const checksumSha256 = diagnosticChainReceiptChecksumV1(receipt);
const checksummedReceipt = { ...receipt, checksumSha256 };
const telemetry = mapDiagnosticChainReceiptV1(checksummedReceipt);
const receiptDirectory = path.join(runDirectory, 'e2e');
fs.mkdirSync(receiptDirectory);
const file = path.join(receiptDirectory, 'receipt.json');
const receiptFd = fs.openSync(file, 'wx');
try {
  fs.writeFileSync(receiptFd, JSON.stringify(checksummedReceipt, null, 2) + '\n', 'utf8');
  fs.fsyncSync(receiptFd);
} finally {
  fs.closeSync(receiptFd);
}
const readback = JSON.parse(fs.readFileSync(file, 'utf8'));
const receiptReadbackVerified = readback.checksumSha256 === diagnosticChainReceiptChecksumV1(readback)
  && telemetry.evidenceValidity === 'DIGEST_VERIFIED'
  && telemetry.canonicalAdmission === 'NOT_ADMITTED';
console.log(JSON.stringify({
  file: rel(file),
  checksumSha256,
  overallAuthority: receipt.overallAuthority,
  firstFailingBoundary: firstFailing,
  receiptReadbackVerified,
  telemetry: { executionStatus: telemetry.executionStatus, evidenceValidity: telemetry.evidenceValidity, canonicalAdmission: telemetry.canonicalAdmission, receiptDigest: telemetry.receiptDigest },
  stages: Object.fromEntries(order.map((k) => [k, stages[k]?.verdict ?? 'MISSING'])),
  descriptor: env ? { file: rel(env.descriptorFile), digest: env.envelopeBytesDigest, byteLength: env.descriptorByteLength } : null,
}, null, 2));
if (!receiptReadbackVerified) process.exitCode = 1;
if (firstFailing) process.exit(1);
