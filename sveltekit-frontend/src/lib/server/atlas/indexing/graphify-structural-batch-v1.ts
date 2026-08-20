import { createHash } from 'node:crypto';

import type {
  CanonicalSourceRef,
  SourceRevisionAuthorityV1,
  StructuralMaterializationResult,
} from './graphify-structural-materializer.js';

export type GraphifyStructuralDeltaActionV1 = 'UPSERT' | 'DELETE';

export interface GraphifyStructuralDeltaInputV1 {
  sourceRef: string;
  action: GraphifyStructuralDeltaActionV1;
  /** Required for UPSERT. DELETE intentionally carries no source body. */
  source?: string | null;
  language?: string | null;
  priorContentHash?: string | null;
  currentContentHash?: string | null;
}

export interface GraphifyStructuralTombstoneV1 {
  schema: 'atlas.graphify-structural-tombstone.v1';
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: null;
  sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY';
  sourceVersionAnchor: string;
  reason: 'SOURCE_DELETED';
  priorContentHash: string | null;
  producerRevision: string;
}

export type GraphifyStructuralBatchFileStatusV1 =
  | 'SKIPPED_UNCHANGED'
  | 'PROVEN'
  | 'RECOVERED_WITH_ERRORS'
  | 'FAILED'
  | 'TOMBSTONED';

export interface GraphifyStructuralBatchFileReceiptV1 {
  sourceRef: string;
  action: GraphifyStructuralDeltaActionV1;
  status: GraphifyStructuralBatchFileStatusV1;
  sourceRevision: string | null;
  sourceRevisionAuthority: SourceRevisionAuthorityV1;
  sourceVersionAnchor: string | null;
  contentHash: string | null;
  priorContentHash: string | null;
  provider: string | null;
  structuralStatus: StructuralMaterializationResult['status'] | null;
  canonicalPromotionAllowed: boolean;
  diagnosticCount: number;
  diagnostics: string[];
  outputDigest: string;
}

export interface GraphifyStructuralBatchReceiptV1 {
  schema: 'atlas.graphify-structural-batch.v1';
  workspaceRevision: string;
  producerRevision: string;
  astEngine: 'treesitter-chunker-8095';
  inputMode: 'FULL_SCAN' | 'DELTA_MANIFEST';
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
  revisionAuthorityPass: boolean;
  files: GraphifyStructuralBatchFileReceiptV1[];
  tombstones: GraphifyStructuralTombstoneV1[];
  outputChecksum: string;
}

export interface GraphifyStructuralBatchPortsV1 {
  materialize(input: CanonicalSourceRef): Promise<StructuralMaterializationResult>;
}

export interface RunGraphifyStructuralBatchInputV1 {
  workspaceRevision: string;
  producerRevision: string;
  inputMode: GraphifyStructuralBatchReceiptV1['inputMode'];
  entries: readonly GraphifyStructuralDeltaInputV1[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function graphifyStructuralSha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : stable(value), 'utf8')
    .digest('hex');
}

function normalizeSourceRef(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`INVALID_SOURCE_REF:${value}`);
  }
  return normalized;
}

function inferSourceVersionAnchor(sourceRef: string, contentHash: string): string {
  return `content:${contentHash}:${graphifyStructuralSha256(sourceRef).slice(0, 12)}`;
}

function inferLanguage(sourceRef: string, explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  const lower = sourceRef.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.java')) return 'java';
  throw new Error(`UNSUPPORTED_SOURCE_LANGUAGE:${sourceRef}`);
}

function fileReceiptDigest(receipt: Omit<GraphifyStructuralBatchFileReceiptV1, 'outputDigest'>): string {
  return graphifyStructuralSha256(receipt);
}

/**
 * GPH-15/GPH-16 orchestration contract.
 *
 * Content hashes are deterministic noncanonical sourceVersionAnchor values.
 * This batch never fabricates canonical sourceRevision authority.
 */
export async function runGraphifyStructuralBatchV1(
  input: RunGraphifyStructuralBatchInputV1,
  ports: GraphifyStructuralBatchPortsV1,
): Promise<GraphifyStructuralBatchReceiptV1> {
  const files: GraphifyStructuralBatchFileReceiptV1[] = [];
  const tombstones: GraphifyStructuralTombstoneV1[] = [];
  const seen = new Set<string>();

  for (const raw of input.entries) {
    const sourceRef = normalizeSourceRef(raw.sourceRef);
    if (seen.has(sourceRef)) throw new Error(`DUPLICATE_DELTA_SOURCE_REF:${sourceRef}`);
    seen.add(sourceRef);

    if (raw.action === 'DELETE') {
      const sourceVersionAnchor = `deleted:${graphifyStructuralSha256([
        sourceRef,
        raw.priorContentHash ?? null,
        input.workspaceRevision,
      ])}`;
      const tombstone: GraphifyStructuralTombstoneV1 = {
        schema: 'atlas.graphify-structural-tombstone.v1',
        sourceRef,
        workspaceRevision: input.workspaceRevision,
        sourceRevision: null,
        sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
        sourceVersionAnchor,
        reason: 'SOURCE_DELETED',
        priorContentHash: raw.priorContentHash ?? null,
        producerRevision: input.producerRevision,
      };
      tombstones.push(tombstone);
      const partial = {
        sourceRef,
        action: raw.action,
        status: 'TOMBSTONED' as const,
        sourceRevision: null,
        sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY' as const,
        sourceVersionAnchor,
        contentHash: null,
        priorContentHash: raw.priorContentHash ?? null,
        provider: null,
        structuralStatus: null,
        canonicalPromotionAllowed: false,
        diagnosticCount: 1,
        diagnostics: ['SOURCE_DELETED', 'SOURCE_REVISION_AUTHORITY_UNPROVEN'],
      };
      files.push({ ...partial, outputDigest: fileReceiptDigest(partial) });
      continue;
    }

    const source = raw.source ?? '';
    if (!source.trim()) {
      const partial = {
        sourceRef,
        action: raw.action,
        status: 'FAILED' as const,
        sourceRevision: null,
        sourceRevisionAuthority: 'UNPROVEN' as const,
        sourceVersionAnchor: null,
        contentHash: null,
        priorContentHash: raw.priorContentHash ?? null,
        provider: null,
        structuralStatus: null,
        canonicalPromotionAllowed: false,
        diagnosticCount: 1,
        diagnostics: ['UPSERT_SOURCE_REQUIRED'],
      };
      files.push({ ...partial, outputDigest: fileReceiptDigest(partial) });
      continue;
    }

    const contentHash = raw.currentContentHash ?? graphifyStructuralSha256(source);
    const sourceVersionAnchor = inferSourceVersionAnchor(sourceRef, contentHash);
    if (raw.priorContentHash && raw.priorContentHash === contentHash) {
      const partial = {
        sourceRef,
        action: raw.action,
        status: 'SKIPPED_UNCHANGED' as const,
        sourceRevision: null,
        sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY' as const,
        sourceVersionAnchor,
        contentHash,
        priorContentHash: raw.priorContentHash,
        provider: null,
        structuralStatus: null,
        canonicalPromotionAllowed: false,
        diagnosticCount: 1,
        diagnostics: ['SOURCE_REVISION_AUTHORITY_UNPROVEN'],
      };
      files.push({ ...partial, outputDigest: fileReceiptDigest(partial) });
      continue;
    }

    try {
      const result = await ports.materialize({
        sourceRef,
        sourceRevision: null,
        sourceVersionAnchor,
        sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
        language: inferLanguage(sourceRef, raw.language),
        source,
      });
      const partial = {
        sourceRef,
        action: raw.action,
        status: result.status,
        sourceRevision: result.sourceRevision,
        sourceRevisionAuthority: result.sourceRevisionAuthority,
        sourceVersionAnchor: result.sourceVersionAnchor,
        contentHash,
        priorContentHash: raw.priorContentHash ?? null,
        provider: result.provider,
        structuralStatus: result.status,
        canonicalPromotionAllowed: result.provenanceReadiness.canonicalPromotionAllowed,
        diagnosticCount: result.diagnostics.length,
        diagnostics: [...result.diagnostics],
      };
      files.push({ ...partial, outputDigest: fileReceiptDigest(partial) });
    } catch (error) {
      const diagnostics = [error instanceof Error ? error.message : String(error)];
      const partial = {
        sourceRef,
        action: raw.action,
        status: 'FAILED' as const,
        sourceRevision: null,
        sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY' as const,
        sourceVersionAnchor,
        contentHash,
        priorContentHash: raw.priorContentHash ?? null,
        provider: null,
        structuralStatus: null,
        canonicalPromotionAllowed: false,
        diagnosticCount: diagnostics.length,
        diagnostics,
      };
      files.push({ ...partial, outputDigest: fileReceiptDigest(partial) });
    }
  }

  const failedFiles = files.filter((item) => item.status === 'FAILED').length;
  const processedFiles = files.filter((item) =>
    item.status === 'PROVEN' || item.status === 'RECOVERED_WITH_ERRORS' || item.status === 'FAILED',
  ).length;
  const receiptWithoutChecksum = {
    schema: 'atlas.graphify-structural-batch.v1' as const,
    workspaceRevision: input.workspaceRevision,
    producerRevision: input.producerRevision,
    astEngine: 'treesitter-chunker-8095' as const,
    inputMode: input.inputMode,
    totalInputs: files.length,
    upsertInputs: files.filter((item) => item.action === 'UPSERT').length,
    deleteInputs: files.filter((item) => item.action === 'DELETE').length,
    processedFiles,
    skippedUnchangedFiles: files.filter((item) => item.status === 'SKIPPED_UNCHANGED').length,
    provenFiles: files.filter((item) => item.status === 'PROVEN').length,
    recoveredFiles: files.filter((item) => item.status === 'RECOVERED_WITH_ERRORS').length,
    failedFiles,
    tombstoneCount: tombstones.length,
    isolatedFailurePass: failedFiles === 0 || files.some((item) => item.status === 'PROVEN'),
    incrementalDeltaPass:
      input.inputMode === 'DELTA_MANIFEST'
      && files.some((item) => item.status === 'SKIPPED_UNCHANGED')
      && files.some((item) => item.status === 'PROVEN' || item.status === 'RECOVERED_WITH_ERRORS')
      && tombstones.length > 0,
    revisionAuthorityPass: files
      .filter((item) => item.status === 'PROVEN' || item.status === 'RECOVERED_WITH_ERRORS')
      .every((item) => item.sourceRevisionAuthority === 'PROVEN' && item.sourceRevision !== null),
    files,
    tombstones,
  };

  return {
    ...receiptWithoutChecksum,
    outputChecksum: graphifyStructuralSha256(receiptWithoutChecksum),
  };
}
