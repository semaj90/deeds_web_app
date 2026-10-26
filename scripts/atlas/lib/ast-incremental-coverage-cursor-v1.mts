import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { selectRoundRobinSourcesWithCursor } from './graphify-run-source-readback-v1.mjs';

export interface SealedSourceEntryV1 {
  readonly canonicalSourceId: string; // UUIDv5(repoId, normalizedRelPath)
  readonly repoId: string;
  readonly relativePath: string;      // POSIX normalized, e.g. "src/lib/server/db.ts"
  readonly sha256Hex: string;
  readonly byteLength: number;
  readonly isSymlink: boolean;
  readonly nestedRepoRoot?: string | null;
}

export type SourceExtractionStatusV1 =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'QUARANTINED_PARSE_INCOMPLETE';

export interface AstParserCompletenessReceiptV1 {
  readonly canonicalSourceId: string;
  readonly sourceSha256Hex: string;
  readonly readbackBytesVerified: boolean;
  readonly extractorVersion: string;  // e.g. "tree-sitter-4.0.0"
  readonly utf8ByteLength: number;
  readonly rootNodeHasError: boolean; // Tree-sitter root.has_error
  readonly errorNodeCount: number;    // Explicit (ERROR) nodes
  readonly missingNodeCount: number;  // Zero-width (MISSING) tokens inserted by recovery
  readonly chunkCount: number;
  readonly edgeCount: number;
}

export interface AstCoverageLedgerV1 {
  readonly schema: 'atlas.ast-coverage-ledger.v1';
  readonly workspaceId: string;
  readonly workspaceRevision: string;
  readonly snapshotManifestSha256: string;
  readonly extractorVersion: string;
  readonly batchSize: number;
  readonly batchSequenceNumber: number;
  readonly lastCursor: {
    readonly directoryBucket: string;
    readonly canonicalSourceId: string;
  } | null;
  readonly statusBySourceId: Readonly<Record<string, SourceExtractionStatusV1>>;
  readonly attemptsBySourceId: Readonly<Record<string, number>>;
  readonly settledBatchSequenceNumber?: number;
  readonly selectedSourceIds?: readonly string[];
  readonly lastOutcomeBySourceId?: Readonly<Record<string, {
    readonly status: SourceExtractionStatusV1;
    readonly reason: string;
    readonly parserReceipt?: AstParserCompletenessReceiptV1;
  }>>;
  readonly ledgerDigest: string;
}

export function sealAstCoverageLedgerV1(
  ledger: Omit<AstCoverageLedgerV1, 'ledgerDigest'> | AstCoverageLedgerV1
): AstCoverageLedgerV1 {
  const { ledgerDigest: ignoredDigest, ...body } = ledger as AstCoverageLedgerV1;
  return {
    ...body,
    ledgerDigest: `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`
  };
}

export function verifyParserCompletenessV1(
  receipt: AstParserCompletenessReceiptV1,
  expectedSha256Hex: string,
  expectedByteLength: number
): { complete: boolean; reason: string } {
  if (typeof receipt.readbackBytesVerified !== 'boolean'
    || typeof receipt.rootNodeHasError !== 'boolean'
    || !receipt.extractorVersion?.trim()
    || ![receipt.utf8ByteLength, receipt.errorNodeCount, receipt.missingNodeCount,
      receipt.chunkCount, receipt.edgeCount, expectedByteLength]
      .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return { complete: false, reason: 'PARSER_RECEIPT_INVALID' };
  }
  if (!receipt.readbackBytesVerified) {
    return { complete: false, reason: 'SEALED_SOURCE_READBACK_UNVERIFIED' };
  }
  if (receipt.sourceSha256Hex !== expectedSha256Hex) {
    return { complete: false, reason: 'SOURCE_DIGEST_MISMATCH' };
  }
  if (receipt.utf8ByteLength !== expectedByteLength) {
    return { complete: false, reason: 'UTF8_SPAN_BYTE_LENGTH_MISMATCH' };
  }
  // Tree-sitter distinguishes explicit ERROR nodes and zero-width MISSING recovery tokens.
  // Both must be 0 for canonical symbol/edge admission.
  if (receipt.rootNodeHasError || receipt.errorNodeCount > 0 || receipt.missingNodeCount > 0) {
    return {
      complete: false,
      reason: `PARSER_INCOMPLETE_SYNTAX: errorNodes=${receipt.errorNodeCount}, missingNodes=${receipt.missingNodeCount}`
    };
  }
  return { complete: true, reason: 'PARSER_COMPLETENESS_VERIFIED' };
}

export function settleAstCoverageBatchV1(params: {
  ledger: AstCoverageLedgerV1;
  selectedBatch: readonly SealedSourceEntryV1[];
  results: readonly ({ canonicalSourceId: string; failure: string }
    | { canonicalSourceId: string; parserReceipt: AstParserCompletenessReceiptV1 })[];
}): AstCoverageLedgerV1 {
  const { ledger, selectedBatch, results } = params;
  if (ledger.ledgerDigest !== sealAstCoverageLedgerV1(ledger).ledgerDigest) {
    throw new Error('AST_CURSOR_LEDGER_CHECKSUM_MISMATCH');
  }
  if (!Number.isSafeInteger(ledger.batchSequenceNumber) || ledger.batchSequenceNumber < 1
    || (ledger.settledBatchSequenceNumber ?? 0) >= ledger.batchSequenceNumber) {
    throw new Error('AST_BATCH_ALREADY_SETTLED_OR_INVALID');
  }
  const selectedById = new Map(selectedBatch.map((source) => [source.canonicalSourceId, source]));
  if (selectedById.size !== selectedBatch.length || results.length !== selectedBatch.length
    || !Array.isArray(ledger.selectedSourceIds)
    || ledger.selectedSourceIds.length !== selectedBatch.length
    || ledger.selectedSourceIds.some((sourceId, index) => sourceId !== selectedBatch[index].canonicalSourceId)) {
    throw new Error('AST_BATCH_RESULT_MEMBERSHIP_MISMATCH');
  }
  const statusBySourceId = { ...ledger.statusBySourceId };
  const attemptsBySourceId = { ...ledger.attemptsBySourceId };
  const lastOutcomeBySourceId = { ...ledger.lastOutcomeBySourceId };
  const seen = new Set<string>();
  for (const result of results) {
    const source = selectedById.get(result.canonicalSourceId);
    const previousStatus = statusBySourceId[result.canonicalSourceId];
    const attempts = attemptsBySourceId[result.canonicalSourceId];
    if (!source || seen.has(result.canonicalSourceId)
      || !['PENDING', 'FAILED_RETRYABLE'].includes(previousStatus)
      || !Number.isSafeInteger(attempts) || attempts < 0) {
      throw new Error('AST_BATCH_RESULT_MEMBERSHIP_MISMATCH');
    }
    seen.add(result.canonicalSourceId);
    let status: SourceExtractionStatusV1;
    let reason: string;
    if ('parserReceipt' in result) {
      const receipt = result.parserReceipt;
      if (receipt.canonicalSourceId !== source.canonicalSourceId
        || receipt.extractorVersion !== ledger.extractorVersion) {
        throw new Error('AST_BATCH_PARSER_IDENTITY_MISMATCH');
      }
      const verdict = verifyParserCompletenessV1(receipt, source.sha256Hex, source.byteLength);
      status = verdict.complete ? 'COMPLETED'
        : verdict.reason.startsWith('PARSER_INCOMPLETE_SYNTAX:')
          ? 'QUARANTINED_PARSE_INCOMPLETE' : 'FAILED_RETRYABLE';
      reason = verdict.reason;
    } else {
      if (typeof result.failure !== 'string' || !result.failure.trim()) {
        throw new Error('AST_BATCH_FAILURE_REASON_REQUIRED');
      }
      status = 'FAILED_RETRYABLE';
      reason = result.failure;
    }
    statusBySourceId[result.canonicalSourceId] = status;
    attemptsBySourceId[result.canonicalSourceId] = attempts + 1;
    lastOutcomeBySourceId[result.canonicalSourceId] = {
      status, reason,
      ...('parserReceipt' in result ? { parserReceipt: { ...result.parserReceipt } } : {})
    };
  }
  return sealAstCoverageLedgerV1({
    ...ledger, statusBySourceId, attemptsBySourceId, lastOutcomeBySourceId,
    settledBatchSequenceNumber: ledger.batchSequenceNumber
  });
}

export function selectNextRoundRobinAstBatchV1(params: {
  sources: readonly SealedSourceEntryV1[];
  allowedRepoIds: ReadonlySet<string>;
  workspaceId: string;
  workspaceRevision: string;
  snapshotManifestSha256: string;
  extractorVersion: string;
  batchSize?: number;
  maxRetries?: number;
  previousLedger?: AstCoverageLedgerV1 | null;
}): {
  selectedBatch: SealedSourceEntryV1[];
  skippedSymlinks: string[];
  skippedUnregisteredNestedRepos: string[];
  nextLedgerPreExecution: AstCoverageLedgerV1;
} {
  const batchSize = params.batchSize ?? 50;
  const maxRetries = params.maxRetries ?? 3;
  const prev = params.previousLedger;

  if (!Number.isSafeInteger(batchSize) || batchSize < 1
    || !Number.isSafeInteger(maxRetries) || maxRetries < 1) {
    throw new Error('AST_CURSOR_INVALID_BATCH_OR_RETRY_LIMIT');
  }

  if (prev) {
    if (prev.schema !== 'atlas.ast-coverage-ledger.v1'
      || prev.ledgerDigest !== sealAstCoverageLedgerV1(prev).ledgerDigest) {
      throw new Error('AST_CURSOR_LEDGER_CHECKSUM_MISMATCH');
    }
    if (prev.workspaceId !== params.workspaceId) {
      throw new Error('AST_CURSOR_WORKSPACE_ID_MISMATCH');
    }
    if (prev.workspaceRevision !== params.workspaceRevision) {
      throw new Error('AST_CURSOR_WORKSPACE_REVISION_MISMATCH');
    }
    if (prev.snapshotManifestSha256 !== params.snapshotManifestSha256) {
      throw new Error('AST_CURSOR_SNAPSHOT_DIGEST_MISMATCH');
    }
    if (prev.extractorVersion !== params.extractorVersion) {
      throw new Error('AST_CURSOR_EXTRACTOR_VERSION_MISMATCH');
    }
    const sourceIds = new Set(params.sources.map((source) => source.canonicalSourceId));
    const statuses = new Set(['PENDING', 'COMPLETED', 'FAILED_RETRYABLE', 'QUARANTINED_PARSE_INCOMPLETE']);
    if (!Number.isSafeInteger(prev.batchSequenceNumber) || prev.batchSequenceNumber < 1
      || !Number.isSafeInteger(prev.settledBatchSequenceNumber ?? 0)
      || (prev.settledBatchSequenceNumber ?? 0) < 0
      || (prev.settledBatchSequenceNumber ?? 0) > prev.batchSequenceNumber
      || (prev.selectedSourceIds !== undefined && (!Array.isArray(prev.selectedSourceIds)
        || new Set(prev.selectedSourceIds).size !== prev.selectedSourceIds.length
        || prev.selectedSourceIds.some((sourceId) => !sourceIds.has(sourceId))))
      || !prev.statusBySourceId || !prev.attemptsBySourceId
      || Object.entries(prev.statusBySourceId).some(([sourceId, status]) =>
        !sourceIds.has(sourceId) || !statuses.has(status)
        || !Number.isSafeInteger(prev.attemptsBySourceId[sourceId])
        || prev.attemptsBySourceId[sourceId] < 0)
      || Object.keys(prev.attemptsBySourceId).some((sourceId) =>
        !Object.hasOwn(prev.statusBySourceId, sourceId))) {
      throw new Error('AST_CURSOR_LEDGER_STATE_INVALID');
    }
  }

  const statusMap: Record<string, SourceExtractionStatusV1> = {
    ...(prev?.statusBySourceId ?? {})
  };
  const attemptsMap: Record<string, number> = {
    ...(prev?.attemptsBySourceId ?? {})
  };

  const skippedSymlinks: string[] = [];
  const skippedUnregisteredNestedRepos: string[] = [];
  const eligibleSources: Array<SealedSourceEntryV1 & { sourceId: string }> = [];
  const sourceById = new Map<string, SealedSourceEntryV1>();

  for (const src of params.sources) {
    if (!src.canonicalSourceId || sourceById.has(src.canonicalSourceId)) {
      throw new Error('AST_SOURCE_ID_INVALID_OR_DUPLICATE');
    }
    sourceById.set(src.canonicalSourceId, src);
    if (src.isSymlink) {
      skippedSymlinks.push(src.canonicalSourceId);
      continue;
    }
    if (src.nestedRepoRoot && !params.allowedRepoIds.has(src.repoId)) {
      skippedUnregisteredNestedRepos.push(src.canonicalSourceId);
      continue;
    }
    if (!params.allowedRepoIds.has(src.repoId)) {
      throw new Error(`AST_SOURCE_UNREGISTERED_REPO_ID: ${src.repoId}`);
    }

    const normPath = posix.normalize(src.relativePath.replace(/\\/g, '/'));
    if (!src.relativePath || normPath === '.' || normPath === '..'
      || normPath.startsWith('../') || normPath.startsWith('/')
      || /^[a-z]:/i.test(normPath) || normPath.includes('\u0000')) {
      throw new Error(`AST_SOURCE_INVALID_RELATIVE_PATH: ${src.relativePath}`);
    }

    if (!(src.canonicalSourceId in statusMap)) {
      statusMap[src.canonicalSourceId] = 'PENDING';
      attemptsMap[src.canonicalSourceId] = 0;
    }

    const currentStatus = statusMap[src.canonicalSourceId];
    const attempts = attemptsMap[src.canonicalSourceId] ?? 0;
    const isEligible =
      currentStatus === 'PENDING' ||
      (currentStatus === 'FAILED_RETRYABLE' && attempts < maxRetries);

    if (isEligible) {
      eligibleSources.push({ ...src, relativePath: normPath, sourceId: src.canonicalSourceId });
    }
  }

  const selection = selectRoundRobinSourcesWithCursor(eligibleSources, {
    limit: batchSize,
    workspaceRevision: params.workspaceRevision,
    snapshotManifestDigest: params.snapshotManifestSha256,
    cursor: prev ? {
      workspaceRevision: prev.workspaceRevision,
      snapshotManifestDigest: prev.snapshotManifestSha256,
      lastBucketKey: prev.lastCursor?.directoryBucket ?? null
    } : null
  });
  const selectedBatch = selection.selected.map((source: { sourceId: string }) => sourceById.get(source.sourceId)!);

  const lastPicked =
    selectedBatch.length > 0 ? selectedBatch[selectedBatch.length - 1] : null;
  const lastDirectoryBucket = lastPicked
    ? `${lastPicked.repoId}::${
        posix.dirname(posix.normalize(lastPicked.relativePath.replace(/\\/g, '/'))) === '.'
          ? './'
          : `${posix.dirname(posix.normalize(lastPicked.relativePath.replace(/\\/g, '/')))}/`
      }`
    : prev?.lastCursor?.directoryBucket ?? '';

  const nextCursor = lastPicked
    ? {
        directoryBucket: lastDirectoryBucket,
        canonicalSourceId: lastPicked.canonicalSourceId
      }
    : prev?.lastCursor ?? null;

  const baseLedger = {
    schema: 'atlas.ast-coverage-ledger.v1' as const,
    workspaceId: params.workspaceId,
    workspaceRevision: params.workspaceRevision,
    snapshotManifestSha256: params.snapshotManifestSha256,
    extractorVersion: params.extractorVersion,
    batchSize,
    batchSequenceNumber: (prev?.batchSequenceNumber ?? 0) + 1,
    settledBatchSequenceNumber: prev?.settledBatchSequenceNumber ?? 0,
    selectedSourceIds: selectedBatch.map((source) => source.canonicalSourceId),
    lastCursor: nextCursor,
    statusBySourceId: statusMap,
    attemptsBySourceId: attemptsMap,
    lastOutcomeBySourceId: prev?.lastOutcomeBySourceId ?? {}
  };

  return {
    selectedBatch,
    skippedSymlinks,
    skippedUnregisteredNestedRepos,
    nextLedgerPreExecution: sealAstCoverageLedgerV1(baseLedger)
  };
}
