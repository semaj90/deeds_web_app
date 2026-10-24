import { createHash } from 'node:crypto';

/**
 * Read-only adapter from validated offline Parent Atlas receipts to structured telemetry attributes.
 *
 * It owns no trace producer: the existing OpenTelemetry SDK emits spans, and this adapter only describes receipts as
 * attributes. Service health, execution success, evidence validity and canonical admission are separate fields.
 * A successful offline run never sets canonicalAdmission to ADMITTED, and no agent-run or trace ID is created here.
 */

export const OFFLINE_RECEIPT_TELEMETRY_SCHEMA_V1 = 'atlas.offline-receipt-telemetry.v1';

export type OfflineReceiptTelemetryV1 = {
  schema: typeof OFFLINE_RECEIPT_TELEMETRY_SCHEMA_V1;
  workflow: 'couchdb-duckdb-kanban' | 'postgres-msgpack-diagnostic';
  /** Receipts do not probe services, so health is reported as not measured rather than inferred. */
  serviceHealth: 'NOT_MEASURED';
  executionStatus: 'SUCCEEDED' | 'FAILED';
  evidenceValidity: 'DIGEST_VERIFIED' | 'NOT_VERIFIED';
  canonicalAdmission: 'NOT_ADMITTED';
  receiptDigest: string | null;
  agentRunId: null;
  firstFailingBoundary: string | null;
};

const DIGEST = /^sha256:[0-9a-f]{64}$/;

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function diagnosticChainReceiptChecksumV1(receipt: Record<string, any>): string {
  const { checksumSha256: _checksumSha256, ...body } = receipt;
  // Normalize through JSON first, so the in-memory value and the value read back from the file hash identically
  // (NaN and undefined become null or disappear, as they do when the receipt is written).
  const stable = JSON.parse(JSON.stringify(body));
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(stable)), 'utf8').digest('hex')}`;
}

/** Map the kanban replay receipt (`atlas.couchdb-duckdb-kanban-replay-receipt.v1`). */
export function mapKanbanReplayReceiptV1(receipt: any): OfflineReceiptTelemetryV1 {
  if (!receipt || receipt.schema !== 'atlas.couchdb-duckdb-kanban-replay-receipt.v1') throw new Error('RECEIPT_SCHEMA_UNSUPPORTED');
  if (receipt.canonicalAuthority !== false || receipt.sourceAdmission !== 'NOT_ADMITTED' || receipt.persistentWrites !== 0) {
    throw new Error('RECEIPT_AUTHORITY_INVALID');
  }
  const digestOk = DIGEST.test(String(receipt.receiptChecksum)) && DIGEST.test(String(receipt.rollup?.aggregateDigest));
  const succeeded = receipt.rollup?.projectedDocumentCount === receipt.inputChangeCount;
  return {
    schema: OFFLINE_RECEIPT_TELEMETRY_SCHEMA_V1,
    workflow: 'couchdb-duckdb-kanban',
    serviceHealth: 'NOT_MEASURED',
    executionStatus: succeeded ? 'SUCCEEDED' : 'FAILED',
    evidenceValidity: digestOk ? 'DIGEST_VERIFIED' : 'NOT_VERIFIED',
    canonicalAdmission: 'NOT_ADMITTED',
    receiptDigest: DIGEST.test(String(receipt.receiptChecksum)) ? receipt.receiptChecksum : null,
    agentRunId: null,
    firstFailingBoundary: succeeded ? null : 'PROJECTION_COUNT',
  };
}

/** Map the diagnostic PostgreSQL → DuckDB → MessagePack chain receipt (`atlas.omr-msgpack-e2e-receipt.v1`). */
export function mapDiagnosticChainReceiptV1(receipt: any): OfflineReceiptTelemetryV1 {
  if (!receipt || receipt.schema !== 'atlas.omr-msgpack-e2e-receipt.v1') throw new Error('RECEIPT_SCHEMA_UNSUPPORTED');
  if (receipt.overallAuthority !== 'DIAGNOSTIC_ONLY_NOT_ADMITTED' || receipt.canonicalAuthority !== false
    || receipt.writesPerformed !== false || receipt.canonicalWrites !== 'DISABLED') {
    throw new Error('RECEIPT_AUTHORITY_INVALID');
  }
  const verdictsPass = ['C_DUCKDB_REDUCE', 'D_MSGPACK', 'E_CHAIN'].every((stage) => {
    const verdict = receipt.stages?.[stage]?.verdict;
    return typeof verdict === 'string' && verdict !== 'FAILED';
  });
  const stageChecksPass = ['C_DUCKDB_REDUCE', 'D_MSGPACK', 'E_CHAIN'].every((stage) => {
    const checks = receipt.stages?.[stage]?.checks;
    return checks && Object.keys(checks).length > 0 && Object.values(checks).every((value) => value === true);
  });
  const snapshotDigest = receipt.links?.snapshot?.digest;
  const reducedArtifactDigest = receipt.links?.reduce?.outputDigest;
  const descriptorDigest = receipt.links?.messagepack?.descriptorDigest;
  const descriptorBytesDigest = receipt.links?.messagepack?.envelopePayloadBytesDigest;
  const descriptorArtifactBound = typeof receipt.links?.messagepack?.descriptorFile === 'string'
    && Number.isInteger(receipt.links?.messagepack?.descriptorByteLength ?? receipt.links?.messagepack?.byteLength);
  const checksumValid = DIGEST.test(String(receipt.checksumSha256))
    && receipt.checksumSha256 === diagnosticChainReceiptChecksumV1(receipt);
  const digestsValid = [snapshotDigest, reducedArtifactDigest, descriptorDigest, descriptorBytesDigest].every((digest) => DIGEST.test(String(digest)));
  return {
    schema: OFFLINE_RECEIPT_TELEMETRY_SCHEMA_V1,
    workflow: 'postgres-msgpack-diagnostic',
    serviceHealth: 'NOT_MEASURED',
    executionStatus: verdictsPass && receipt.firstFailingBoundary === null ? 'SUCCEEDED' : 'FAILED',
    evidenceValidity: verdictsPass && stageChecksPass && checksumValid && digestsValid && descriptorArtifactBound ? 'DIGEST_VERIFIED' : 'NOT_VERIFIED',
    canonicalAdmission: 'NOT_ADMITTED',
    receiptDigest: checksumValid ? receipt.checksumSha256 : null,
    agentRunId: null,
    firstFailingBoundary: receipt.firstFailingBoundary ?? null,
  };
}

/**
 * OBS-07: allowlisted span attributes for a mapped receipt. Only these keys may be attached to spans; there is no
 * agent-run key, so a receipt can never create one. Verdicts stay independent of each other.
 */
export function toSpanAttributesV1(t: OfflineReceiptTelemetryV1): Record<string, string | null> {
  return {
    'atlas.workflow': t.workflow,
    'atlas.service_health': t.serviceHealth,
    'atlas.execution_status': t.executionStatus,
    'atlas.evidence_validity': t.evidenceValidity,
    'atlas.canonical_admission': t.canonicalAdmission,
    'atlas.receipt_digest': t.receiptDigest,
    'atlas.first_failing_boundary': t.firstFailingBoundary,
  };
}
