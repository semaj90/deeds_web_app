import { createHash } from 'node:crypto';

import {
  GraphifyStructuralMaterializer,
  type StructuralMaterializationResult,
} from './graphify-structural-materializer.js';

export type GraphifyStructuralIdentityHintV1 = {
  canonicalId?: string | null;
  packetKey?: string | null;
  treeNodeId?: string | null;
  symbolVersionId?: string | null;
};

export type GraphifyStructuralUpsertInputV1 = {
  schema: 'atlas.graphify-structural-delta-input.v1';
  action: 'UPSERT';
  sourceRef: string;
  sourceRevision: string;
  previousSourceRevision?: string | null;
  language: string;
  source: string;
  identity?: GraphifyStructuralIdentityHintV1;
};

export type GraphifyStructuralDeleteInputV1 = {
  schema: 'atlas.graphify-structural-delta-input.v1';
  action: 'DELETE';
  sourceRef: string;
  sourceRevision: string;
  previousSourceRevision?: string | null;
  identity?: GraphifyStructuralIdentityHintV1;
};

export type GraphifyStructuralDeltaInputV1 =
  | GraphifyStructuralUpsertInputV1
  | GraphifyStructuralDeleteInputV1;

export type GraphifyStructuralTombstoneV1 = {
  schema: 'atlas.graphify-structural-tombstone.v1';
  sourceRef: string;
  sourceRevision: string;
  previousSourceRevision: string | null;
  workspaceRevision: string;
  producerRevision: string;
  canonicalId: string | null;
  packetKey: string | null;
  treeNodeId: string | null;
  symbolVersionId: string | null;
  observedAction: 'DELETE';
  parserInvoked: false;
  canonicalPersistence: 'NOT_ATTEMPTED';
  lifecycleAuthority: 'DOWNSTREAM_CANONICAL_OWNER_REQUIRED';
};

export type GraphifyStructuralBatchFileStatus =
  | 'PROVEN'
  | 'RECOVERED_WITH_ERRORS'
  | 'FAILED'
  | 'SKIPPED_UNCHANGED'
  | 'TOMBSTONED';

export type GraphifyStructuralBatchFileReceiptV1 = {
  sourceRef: string;
  sourceRevision: string;
  previousSourceRevision: string | null;
  action: GraphifyStructuralDeltaInputV1['action'];
  status: GraphifyStructuralBatchFileStatus;
  parserInvoked: boolean;
  provider: StructuralMaterializationResult['provider'] | null;
  provenanceReadiness: StructuralMaterializationResult['provenanceReadiness']['status'] | null;
  diagnostics: string[];
  canonicalPersistence: 'NOT_ATTEMPTED';
};

export type GraphifyStructuralBatchReceiptV1 = {
  schema: 'atlas.graphify-structural-batch.v1';
  workspaceRevision: string;
  producerRevision: string;
  astEngine: 'GRAPHIFY_STRUCTURAL_MATERIALIZER';
  totalInputs: number;
  upsertInputs: number;
  deleteInputs: number;
  processedFiles: number;
  skippedUnchangedFiles: number;
  provenFiles: number;
  recoveredFiles: number;
  failedFiles: number;
  tombstoneCount: number;
  isolatedFailurePass: boolean;
  incrementalDeltaPass: boolean;
  files: GraphifyStructuralBatchFileReceiptV1[];
  tombstones: GraphifyStructuralTombstoneV1[];
  persistenceReadback: false;
  canonicalWritesAllowed: false;
  outputChecksum: string;
};

export type RunGraphifyStructuralBatchInputV1 = {
  workspaceRevision: string;
  producerRevision: string;
  inputs: readonly GraphifyStructuralDeltaInputV1[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function normalizeGraphifyStructuralSourceRef(value: string): string {
  let normalized = value.trim().replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalized) throw new Error('GRAPHIFY_STRUCTURAL_SOURCE_REF_EMPTY');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`GRAPHIFY_STRUCTURAL_SOURCE_REF_MUST_BE_RELATIVE:${value}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`GRAPHIFY_STRUCTURAL_SOURCE_REF_PARENT_TRAVERSAL:${value}`);
  }
  normalized = segments.filter((segment) => segment !== '' && segment !== '.').join('/');
  if (!normalized) throw new Error('GRAPHIFY_STRUCTURAL_SOURCE_REF_EMPTY');
  return normalized;
}

function normalizedInputs(inputs: readonly GraphifyStructuralDeltaInputV1[]): GraphifyStructuralDeltaInputV1[] {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const sourceRef = normalizeGraphifyStructuralSourceRef(input.sourceRef);
    if (seen.has(sourceRef)) {
      throw new Error(`GRAPHIFY_STRUCTURAL_DUPLICATE_SOURCE_REF:${sourceRef}`);
    }
    seen.add(sourceRef);
    if (!input.sourceRevision.trim()) {
      throw new Error(`GRAPHIFY_STRUCTURAL_SOURCE_REVISION_REQUIRED:${sourceRef}`);
    }
    if (input.action === 'UPSERT' && !input.language.trim()) {
      throw new Error(`GRAPHIFY_STRUCTURAL_LANGUAGE_REQUIRED:${sourceRef}`);
    }
    return { ...input, sourceRef } as GraphifyStructuralDeltaInputV1;
  });
}

function tombstoneFor(
  input: GraphifyStructuralDeleteInputV1,
  workspaceRevision: string,
  producerRevision: string,
): GraphifyStructuralTombstoneV1 {
  return {
    schema: 'atlas.graphify-structural-tombstone.v1',
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    previousSourceRevision: input.previousSourceRevision?.trim() || null,
    workspaceRevision,
    producerRevision,
    canonicalId: input.identity?.canonicalId?.trim() || null,
    packetKey: input.identity?.packetKey?.trim() || null,
    treeNodeId: input.identity?.treeNodeId?.trim() || null,
    symbolVersionId: input.identity?.symbolVersionId?.trim() || null,
    observedAction: 'DELETE',
    parserInvoked: false,
    canonicalPersistence: 'NOT_ATTEMPTED',
    lifecycleAuthority: 'DOWNSTREAM_CANONICAL_OWNER_REQUIRED',
  };
}

function fileReceiptFromMaterialization(
  input: GraphifyStructuralUpsertInputV1,
  materialization: StructuralMaterializationResult,
): GraphifyStructuralBatchFileReceiptV1 {
  return {
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    previousSourceRevision: input.previousSourceRevision?.trim() || null,
    action: 'UPSERT',
    status: materialization.status,
    parserInvoked: true,
    provider: materialization.provider,
    provenanceReadiness: materialization.provenanceReadiness.status,
    diagnostics: [...materialization.diagnostics],
    canonicalPersistence: 'NOT_ATTEMPTED',
  };
}

/**
 * Production-oriented Graphify delta orchestration contract.
 *
 * Authority boundaries are intentional:
 * - GraphifyStructuralMaterializer remains the parser orchestrator.
 * - DELETE is observed and emitted as a tombstone fact; this function never
 *   deletes or invalidates canonical PostgreSQL state.
 * - Unchanged UPSERTs are skipped before the parser is invoked.
 * - A failed file becomes a FAILED receipt and does not discard its neighbors.
 * - Duplicate normalized source refs fail preflight before any parser work.
 */
export async function runGraphifyStructuralBatchV1(
  value: RunGraphifyStructuralBatchInputV1,
  materializer: GraphifyStructuralMaterializer = new GraphifyStructuralMaterializer(),
): Promise<GraphifyStructuralBatchReceiptV1> {
  const workspaceRevision = value.workspaceRevision.trim();
  const producerRevision = value.producerRevision.trim();
  if (!workspaceRevision) throw new Error('GRAPHIFY_STRUCTURAL_WORKSPACE_REVISION_REQUIRED');
  if (!producerRevision) throw new Error('GRAPHIFY_STRUCTURAL_PRODUCER_REVISION_REQUIRED');

  // Normalize and reject aliases before processing the first file.
  const inputs = normalizedInputs(value.inputs);
  const files: GraphifyStructuralBatchFileReceiptV1[] = [];
  const tombstones: GraphifyStructuralTombstoneV1[] = [];

  for (const input of inputs) {
    if (input.action === 'DELETE') {
      const tombstone = tombstoneFor(input, workspaceRevision, producerRevision);
      tombstones.push(tombstone);
      files.push({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        previousSourceRevision: input.previousSourceRevision?.trim() || null,
        action: 'DELETE',
        status: 'TOMBSTONED',
        parserInvoked: false,
        provider: null,
        provenanceReadiness: null,
        diagnostics: ['CANONICAL_LIFECYCLE_PERSISTENCE_DEFERRED_TO_DOWNSTREAM_OWNER'],
        canonicalPersistence: 'NOT_ATTEMPTED',
      });
      continue;
    }

    if (
      input.previousSourceRevision?.trim()
      && input.previousSourceRevision.trim() === input.sourceRevision.trim()
    ) {
      files.push({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        previousSourceRevision: input.previousSourceRevision.trim(),
        action: 'UPSERT',
        status: 'SKIPPED_UNCHANGED',
        parserInvoked: false,
        provider: null,
        provenanceReadiness: null,
        diagnostics: [],
        canonicalPersistence: 'NOT_ATTEMPTED',
      });
      continue;
    }

    try {
      const materialization = await materializer.materialize({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        language: input.language,
        source: input.source,
      });
      files.push(fileReceiptFromMaterialization(input, materialization));
    } catch (error) {
      files.push({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        previousSourceRevision: input.previousSourceRevision?.trim() || null,
        action: 'UPSERT',
        status: 'FAILED',
        parserInvoked: true,
        provider: null,
        provenanceReadiness: null,
        diagnostics: [error instanceof Error ? error.message : String(error)],
        canonicalPersistence: 'NOT_ATTEMPTED',
      });
    }
  }

  const upsertInputs = inputs.filter((input) => input.action === 'UPSERT').length;
  const deleteInputs = inputs.length - upsertInputs;
  const processedFiles = files.filter((file) => file.parserInvoked).length;
  const skippedUnchangedFiles = files.filter((file) => file.status === 'SKIPPED_UNCHANGED').length;
  const provenFiles = files.filter((file) => file.status === 'PROVEN').length;
  const recoveredFiles = files.filter((file) => file.status === 'RECOVERED_WITH_ERRORS').length;
  const failedFiles = files.filter((file) => file.status === 'FAILED').length;

  const isolatedFailurePass = files.length === inputs.length
    && files.every((file, index) => file.sourceRef === inputs[index]?.sourceRef);
  const incrementalDeltaPass = files.every((file, index) => {
    const input = inputs[index]!;
    if (input.action === 'DELETE') return file.status === 'TOMBSTONED' && file.parserInvoked === false;
    const unchanged = Boolean(
      input.previousSourceRevision?.trim()
      && input.previousSourceRevision.trim() === input.sourceRevision.trim(),
    );
    if (unchanged) return file.status === 'SKIPPED_UNCHANGED' && file.parserInvoked === false;
    return file.parserInvoked === true;
  });

  const checksumInput = {
    schema: 'atlas.graphify-structural-batch.v1',
    workspaceRevision,
    producerRevision,
    astEngine: 'GRAPHIFY_STRUCTURAL_MATERIALIZER',
    totalInputs: inputs.length,
    upsertInputs,
    deleteInputs,
    processedFiles,
    skippedUnchangedFiles,
    provenFiles,
    recoveredFiles,
    failedFiles,
    tombstoneCount: tombstones.length,
    isolatedFailurePass,
    incrementalDeltaPass,
    files,
    tombstones,
    persistenceReadback: false,
    canonicalWritesAllowed: false,
  } as const;

  return {
    ...checksumInput,
    outputChecksum: sha256(checksumInput),
  };
}
