import { createHash } from 'node:crypto';
import type {
  CanonicalSourceRef,
  GraphifyStructuralMaterializer,
  StructuralMaterializationResult,
} from './graphify-structural-materializer.js';

export type StructuralBatchFileStatus = 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED';
export type StructuralDeltaStatus =
  | 'ADDED'
  | 'REEXTRACTED'
  | 'SKIPPED_UNCHANGED'
  | 'TOMBSTONED'
  | 'FAILED';

export interface GraphifyStructuralBatchInputV1 extends CanonicalSourceRef {
  contentHash: string;
}

export interface GraphifyStructuralBatchFileReceiptV1 {
  sourceRef: string;
  sourceRevision: string;
  contentHash: string;
  status: StructuralBatchFileStatus;
  diagnostics: string[];
  errorNodeCount: number;
  missingNodeCount: number;
  nativeStructuralProvenance: boolean;
}

export interface GraphifyStructuralBatchReceiptV1 {
  schema: 'atlas.graphify-structural-batch.v1';
  workspaceRevision: string;
  producerRevision: string;
  discoveredFileCount: number;
  attemptedFileCount: number;
  provenCount: number;
  recoveredCount: number;
  failedCount: number;
  files: GraphifyStructuralBatchFileReceiptV1[];
  isolatedFailurePass: boolean;
  persistenceAttempted: false;
  canonicalWritesAllowed: false;
}

export interface GraphifyStructuralDeltaManifestRowV1 {
  sourceRef: string;
  sourceRevision: string;
  contentHash: string;
}

export interface GraphifyStructuralTombstoneV1 {
  schema: 'atlas.graphify-structural-tombstone.v1';
  sourceRef: string;
  previousSourceRevision: string;
  observedWorkspaceRevision: string;
  previousEvidenceRefs: string[];
  previousPacketKeys: string[];
  observation: 'SOURCE_ABSENT';
  mutationAuthorized: false;
  canonicalDeletionAllowed: false;
}

export interface GraphifyStructuralDeltaFileReceiptV1 {
  sourceRef: string;
  previousSourceRevision: string | null;
  currentSourceRevision: string | null;
  previousContentHash: string | null;
  currentContentHash: string | null;
  status: StructuralDeltaStatus;
  materializationStatus: StructuralBatchFileStatus | null;
  diagnostics: string[];
  tombstone: GraphifyStructuralTombstoneV1 | null;
}

export interface GraphifyStructuralDeltaReceiptV1 {
  schema: 'atlas.graphify-structural-delta.v1';
  previousSnapshotRevision: string;
  currentSnapshotRevision: string;
  addedCount: number;
  changedCount: number;
  unchangedCount: number;
  deletedCount: number;
  reparsedCount: number;
  skippedCount: number;
  tombstoneCount: number;
  failedCount: number;
  files: GraphifyStructuralDeltaFileReceiptV1[];
  productionPersistenceReadback: false;
  canonicalDeletionPerformed: false;
  canonicalWritesAllowed: false;
}

function countNodeKind(value: unknown, kind: 'ERROR' | 'MISSING'): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countNodeKind(child, kind), 0);
  const row = value as Record<string, unknown>;
  let count = 0;
  const nodeType = typeof row.node_type === 'string' ? row.node_type : typeof row.type === 'string' ? row.type : null;
  if (kind === 'ERROR' && nodeType === 'ERROR') count += 1;
  if (kind === 'MISSING' && (row.missing === true || row.is_missing === true || row.isMissing === true)) count += 1;
  for (const child of Object.values(row)) count += countNodeKind(child, kind);
  return count;
}

function nativeReady(result: StructuralMaterializationResult): boolean {
  return result.provenanceReadiness.status === 'NATIVE_READY';
}

async function materializeOne(
  materializer: Pick<GraphifyStructuralMaterializer, 'materialize'>,
  input: GraphifyStructuralBatchInputV1,
): Promise<GraphifyStructuralBatchFileReceiptV1> {
  try {
    const result = await materializer.materialize(input);
    const evidence = result.evidence as unknown;
    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      contentHash: input.contentHash,
      status: result.status,
      diagnostics: result.diagnostics,
      errorNodeCount: countNodeKind(evidence, 'ERROR'),
      missingNodeCount: countNodeKind(evidence, 'MISSING'),
      nativeStructuralProvenance: nativeReady(result),
    };
  } catch (error) {
    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      contentHash: input.contentHash,
      status: 'FAILED',
      diagnostics: [error instanceof Error ? error.message : String(error)],
      errorNodeCount: 0,
      missingNodeCount: 0,
      nativeStructuralProvenance: false,
    };
  }
}

export async function materializeGraphifyStructuralBatchV1(input: {
  workspaceRevision: string;
  producerRevision?: string;
  files: readonly GraphifyStructuralBatchInputV1[];
  materializer: Pick<GraphifyStructuralMaterializer, 'materialize'>;
}): Promise<GraphifyStructuralBatchReceiptV1> {
  const receipts: GraphifyStructuralBatchFileReceiptV1[] = [];
  for (const file of input.files) receipts.push(await materializeOne(input.materializer, file));
  const provenCount = receipts.filter((row) => row.status === 'PROVEN').length;
  const recoveredCount = receipts.filter((row) => row.status === 'RECOVERED_WITH_ERRORS').length;
  const failedCount = receipts.filter((row) => row.status === 'FAILED').length;
  return {
    schema: 'atlas.graphify-structural-batch.v1',
    workspaceRevision: input.workspaceRevision,
    producerRevision: input.producerRevision ?? 'graphify-structural-batch-v1',
    discoveredFileCount: input.files.length,
    attemptedFileCount: receipts.length,
    provenCount,
    recoveredCount,
    failedCount,
    files: receipts,
    isolatedFailurePass: receipts.length === input.files.length,
    persistenceAttempted: false,
    canonicalWritesAllowed: false,
  };
}

export function sha256Source(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

export async function materializeGraphifyStructuralDeltaV1(input: {
  previousSnapshotRevision: string;
  currentSnapshotRevision: string;
  previous: readonly GraphifyStructuralDeltaManifestRowV1[];
  current: readonly GraphifyStructuralBatchInputV1[];
  materializer: Pick<GraphifyStructuralMaterializer, 'materialize'>;
}): Promise<GraphifyStructuralDeltaReceiptV1> {
  const previousByRef = new Map(input.previous.map((row) => [row.sourceRef, row]));
  const currentByRef = new Map(input.current.map((row) => [row.sourceRef, row]));
  const refs = [...new Set([...previousByRef.keys(), ...currentByRef.keys()])].sort();
  const files: GraphifyStructuralDeltaFileReceiptV1[] = [];

  for (const sourceRef of refs) {
    const previous = previousByRef.get(sourceRef) ?? null;
    const current = currentByRef.get(sourceRef) ?? null;
    if (!current && previous) {
      files.push({
        sourceRef,
        previousSourceRevision: previous.sourceRevision,
        currentSourceRevision: null,
        previousContentHash: previous.contentHash,
        currentContentHash: null,
        status: 'TOMBSTONED',
        materializationStatus: null,
        diagnostics: [],
        tombstone: {
          schema: 'atlas.graphify-structural-tombstone.v1',
          sourceRef,
          previousSourceRevision: previous.sourceRevision,
          observedWorkspaceRevision: input.currentSnapshotRevision,
          previousEvidenceRefs: [],
          previousPacketKeys: [],
          observation: 'SOURCE_ABSENT',
          mutationAuthorized: false,
          canonicalDeletionAllowed: false,
        },
      });
      continue;
    }
    if (!current) continue;
    if (previous && previous.sourceRevision === current.sourceRevision && previous.contentHash === current.contentHash) {
      files.push({
        sourceRef,
        previousSourceRevision: previous.sourceRevision,
        currentSourceRevision: current.sourceRevision,
        previousContentHash: previous.contentHash,
        currentContentHash: current.contentHash,
        status: 'SKIPPED_UNCHANGED',
        materializationStatus: null,
        diagnostics: [],
        tombstone: null,
      });
      continue;
    }

    const receipt = await materializeOne(input.materializer, current);
    files.push({
      sourceRef,
      previousSourceRevision: previous?.sourceRevision ?? null,
      currentSourceRevision: current.sourceRevision,
      previousContentHash: previous?.contentHash ?? null,
      currentContentHash: current.contentHash,
      status: receipt.status === 'FAILED' ? 'FAILED' : previous ? 'REEXTRACTED' : 'ADDED',
      materializationStatus: receipt.status,
      diagnostics: receipt.diagnostics,
      tombstone: null,
    });
  }

  const addedCount = files.filter((row) => row.status === 'ADDED').length;
  const changedCount = files.filter((row) => row.status === 'REEXTRACTED').length;
  const unchangedCount = files.filter((row) => row.status === 'SKIPPED_UNCHANGED').length;
  const deletedCount = files.filter((row) => row.status === 'TOMBSTONED').length;
  const failedCount = files.filter((row) => row.status === 'FAILED').length;
  return {
    schema: 'atlas.graphify-structural-delta.v1',
    previousSnapshotRevision: input.previousSnapshotRevision,
    currentSnapshotRevision: input.currentSnapshotRevision,
    addedCount,
    changedCount,
    unchangedCount,
    deletedCount,
    reparsedCount: addedCount + changedCount + failedCount,
    skippedCount: unchangedCount,
    tombstoneCount: deletedCount,
    failedCount,
    files,
    productionPersistenceReadback: false,
    canonicalDeletionPerformed: false,
    canonicalWritesAllowed: false,
  };
}
