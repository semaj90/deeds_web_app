// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnosticChainReceiptChecksumV1, mapDiagnosticChainReceiptV1, mapKanbanReplayReceiptV1 } from './offline-receipt-telemetry-v1.js';

const D = (c: string) => `sha256:${c.repeat(64)}`;
const KANBAN = {
  schema: 'atlas.couchdb-duckdb-kanban-replay-receipt.v1',
  receiptChecksum: D('a'),
  inputChangeCount: 27,
  rollup: { aggregateDigest: D('b'), projectedDocumentCount: 27 },
  canonicalAuthority: false,
  sourceAdmission: 'NOT_ADMITTED',
  persistentWrites: 0,
};
const CHAIN_BODY = {
  schema: 'atlas.omr-msgpack-e2e-receipt.v1',
  overallAuthority: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
  firstFailingBoundary: null,
  stages: {
    C_DUCKDB_REDUCE: { verdict: 'DIAGNOSTIC_REDUCE_VERIFIED', checks: { SNAPSHOT_MATCH: true } },
    D_MSGPACK: { verdict: 'MSGPACK_ROUNDTRIP_VERIFIED', checks: { PAYLOAD_READBACK: true } },
    E_CHAIN: { verdict: 'DIAGNOSTIC_CHAIN_VERIFIED', checks: { RECEIPT_LINKED: true } },
  },
  links: {
    snapshot: { digest: D('d') },
    reduce: { outputDigest: D('c') },
    messagepack: { descriptorFile: '.tmp/descriptor.msgpack', descriptorDigest: D('e'), envelopePayloadBytesDigest: D('f'), descriptorByteLength: 1367 },
  },
  canonicalAuthority: false,
  writesPerformed: false,
  canonicalWrites: 'DISABLED',
};
const CHAIN = { ...CHAIN_BODY, checksumSha256: diagnosticChainReceiptChecksumV1(CHAIN_BODY) };

describe('offline receipt telemetry adapter', () => {
  it('maps a kanban replay receipt with separate verdicts and no agent or trace ID', () => {
    const t = mapKanbanReplayReceiptV1(KANBAN);
    expect(t).toMatchObject({
      workflow: 'couchdb-duckdb-kanban',
      serviceHealth: 'NOT_MEASURED',
      executionStatus: 'SUCCEEDED',
      evidenceValidity: 'DIGEST_VERIFIED',
      canonicalAdmission: 'NOT_ADMITTED',
      receiptDigest: D('a'),
      agentRunId: null,
      firstFailingBoundary: null,
    });
  });

  it('maps a diagnostic chain receipt and keeps canonical admission unadmitted', () => {
    const t = mapDiagnosticChainReceiptV1(CHAIN);
    expect(t).toMatchObject({ workflow: 'postgres-msgpack-diagnostic', executionStatus: 'SUCCEEDED', evidenceValidity: 'DIGEST_VERIFIED', canonicalAdmission: 'NOT_ADMITTED', receiptDigest: CHAIN.checksumSha256, agentRunId: null });
  });

  it('does not mark a missing or tampered diagnostic receipt checksum as verified evidence', () => {
    expect(mapDiagnosticChainReceiptV1(CHAIN).evidenceValidity).toBe('DIGEST_VERIFIED');
    expect(mapDiagnosticChainReceiptV1(CHAIN_BODY).evidenceValidity).toBe('NOT_VERIFIED');
    expect(mapDiagnosticChainReceiptV1({ ...CHAIN, links: { ...CHAIN.links, reduce: { outputDigest: D('9') } } }))
      .toMatchObject({ evidenceValidity: 'NOT_VERIFIED', receiptDigest: null });
  });

  it('a successful offline run can never report ADMITTED, even when the input claims it', () => {
    expect(() => mapKanbanReplayReceiptV1({ ...KANBAN, sourceAdmission: 'ADMITTED' })).toThrow('RECEIPT_AUTHORITY_INVALID');
    expect(() => mapDiagnosticChainReceiptV1({ ...CHAIN, overallAuthority: 'ADMITTED' })).toThrow('RECEIPT_AUTHORITY_INVALID');
    expect(mapKanbanReplayReceiptV1(KANBAN).canonicalAdmission).toBe('NOT_ADMITTED');
  });

  it('refuses receipts that claim writes or canonical authority', () => {
    expect(() => mapKanbanReplayReceiptV1({ ...KANBAN, persistentWrites: 1 })).toThrow('RECEIPT_AUTHORITY_INVALID');
    expect(() => mapDiagnosticChainReceiptV1({ ...CHAIN, canonicalWrites: 'ENABLED' })).toThrow('RECEIPT_AUTHORITY_INVALID');
  });

  it('propagates the first failing boundary and marks a failed stage as FAILED', () => {
    const t = mapDiagnosticChainReceiptV1({ ...CHAIN, firstFailingBoundary: 'D_MSGPACK', stages: { ...CHAIN.stages, D_MSGPACK: { verdict: 'FAILED' } } });
    expect(t).toMatchObject({ executionStatus: 'FAILED', firstFailingBoundary: 'D_MSGPACK' });
  });

  it('marks evidence NOT_VERIFIED when a digest is malformed', () => {
    expect(mapKanbanReplayReceiptV1({ ...KANBAN, receiptChecksum: 'sha256:xyz' })).toMatchObject({ evidenceValidity: 'NOT_VERIFIED', receiptDigest: null });
  });

  it('maps the real receipts on disk when present', () => {
    const root = path.resolve(process.cwd(), '..');
    const kanbanDir = path.join(root, '.tmp/atlas/couchdb-duckdb-kanban-rollup');
    const e2eDir = path.join(root, '.tmp/atlas/omr-msgpack/e2e');
    if (existsSync(kanbanDir)) {
      const latest = readdirSync(kanbanDir).map((d) => path.join(kanbanDir, d, 'receipt.json')).filter(existsSync).sort().pop();
      if (latest) expect(mapKanbanReplayReceiptV1(JSON.parse(readFileSync(latest, 'utf8'))).canonicalAdmission).toBe('NOT_ADMITTED');
    }
    if (existsSync(e2eDir)) {
      const latest = readdirSync(e2eDir).filter((n) => n.endsWith('.json')).sort().pop();
      if (latest) expect(mapDiagnosticChainReceiptV1(JSON.parse(readFileSync(path.join(e2eDir, latest), 'utf8'))).executionStatus).toBe('SUCCEEDED');
    }
    const runsDir = path.join(root, '.tmp/atlas/omr-msgpack/runs');
    if (existsSync(runsDir)) {
      const latestReceipt = readdirSync(runsDir)
        .map((runId) => path.join(runsDir, runId, 'e2e/receipt.json'))
        .filter(existsSync)
        .sort()
        .at(-1);
      if (latestReceipt) {
        const telemetry = mapDiagnosticChainReceiptV1(JSON.parse(readFileSync(latestReceipt, 'utf8')));
        expect(telemetry).toMatchObject({ executionStatus: 'SUCCEEDED', evidenceValidity: 'DIGEST_VERIFIED', canonicalAdmission: 'NOT_ADMITTED' });
      }
    }
  });
});
