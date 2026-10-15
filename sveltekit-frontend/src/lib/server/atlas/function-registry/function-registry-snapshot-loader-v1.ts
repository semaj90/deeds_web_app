import { createHash } from 'node:crypto';
import {
  qualifyFunctionRegistryReadOnlyV1,
  type FunctionRegistryReadPortsV1,
  type FunctionRegistryReadRejectionV1,
} from './function-registry-read-adapter-v1.js';
import type { FunctionRegistrySnapshotV1 } from './function-registry-snapshot-v1.js';

export type FunctionSnapshotLoadRequestV1 = {
  symbolVersionId: string;
  expectedWorkspaceRevision: string;
  expectedSourceRevision: string;
};

export type FunctionRegistryLoadReceiptV1 = {
  schema: 'atlas.function-registry-load-receipt.v1';
  symbolVersionId: string;
  sourceRevision: string;
  workspaceRevision: string;
  packetKey: string | null;
  treeNodeId: string | null;
  sourceContentHash: string | null;
  snapshotChecksum: string | null;
  qualificationOutcome: 'QUALIFIED' | 'REJECTED';
  rejectionReason: FunctionRegistryReadRejectionV1 | null;
  evidenceRefs: string[];
  receiptChecksum: string;
};

export type FunctionSnapshotLoadResultV1 =
  | { status: 'QUALIFIED'; snapshot: FunctionRegistrySnapshotV1; receipt: FunctionRegistryLoadReceiptV1 }
  | { status: 'REJECTED'; reason: FunctionRegistryReadRejectionV1; receipt: FunctionRegistryLoadReceiptV1 };

export interface FunctionSnapshotLoaderV1 {
  loadQualified(request: FunctionSnapshotLoadRequestV1): Promise<FunctionSnapshotLoadResultV1>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function buildReceipt(input: Omit<FunctionRegistryLoadReceiptV1, 'receiptChecksum'>): FunctionRegistryLoadReceiptV1 {
  return { ...input, receiptChecksum: checksum(input) };
}

export function createFunctionRegistrySnapshotLoaderV1(input: {
  ports: FunctionRegistryReadPortsV1;
}): FunctionSnapshotLoaderV1 {
  return {
    async loadQualified(request): Promise<FunctionSnapshotLoadResultV1> {
      const outcome = await qualifyFunctionRegistryReadOnlyV1({
        ...request,
        ports: input.ports,
      });

      if (outcome.status === 'REJECTED') {
        const receipt = buildReceipt({
          schema: 'atlas.function-registry-load-receipt.v1',
          symbolVersionId: request.symbolVersionId,
          sourceRevision: request.expectedSourceRevision,
          workspaceRevision: request.expectedWorkspaceRevision,
          packetKey: null,
          treeNodeId: null,
          sourceContentHash: null,
          snapshotChecksum: null,
          qualificationOutcome: 'REJECTED',
          rejectionReason: outcome.reason,
          evidenceRefs: outcome.evidenceRefs,
        });
        return { status: 'REJECTED', reason: outcome.reason, receipt };
      }

      const [entry] = outcome.snapshot.entries;
      if (!entry) {
        const reason: FunctionRegistryReadRejectionV1 = 'SNAPSHOT_BUILD_FAILED';
        const receipt = buildReceipt({
          schema: 'atlas.function-registry-load-receipt.v1',
          symbolVersionId: request.symbolVersionId,
          sourceRevision: request.expectedSourceRevision,
          workspaceRevision: request.expectedWorkspaceRevision,
          packetKey: null,
          treeNodeId: null,
          sourceContentHash: null,
          snapshotChecksum: null,
          qualificationOutcome: 'REJECTED',
          rejectionReason: reason,
          evidenceRefs: outcome.evidenceRefs,
        });
        return { status: 'REJECTED', reason, receipt };
      }

      const receipt = buildReceipt({
        schema: 'atlas.function-registry-load-receipt.v1',
        symbolVersionId: entry.symbolVersionId,
        sourceRevision: entry.sourceRevision,
        workspaceRevision: entry.workspaceRevision,
        packetKey: entry.packetKey,
        treeNodeId: entry.treeNodeId,
        sourceContentHash: entry.sourceContentHash,
        snapshotChecksum: outcome.snapshot.snapshotChecksum,
        qualificationOutcome: 'QUALIFIED',
        rejectionReason: null,
        evidenceRefs: outcome.evidenceRefs,
      });
      return { status: 'QUALIFIED', snapshot: outcome.snapshot, receipt };
    },
  };
}
