import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256(data) {
  return 'sha256:' + crypto.createHash('sha256').update(data).digest('hex');
}

export function cleanDigest(val) {
  return String(val ?? '').trim().toLowerCase().replace(/^sha256:/, '');
}

export function verifySnapshotUtf8ByteSpan({ bytes, byteSpan }) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('SOURCE_BYTES_REQUIRED');
  if (!Array.isArray(byteSpan) || byteSpan.length !== 2
    || !Number.isSafeInteger(byteSpan[0]) || !Number.isSafeInteger(byteSpan[1])
    || byteSpan[0] < 0 || byteSpan[1] <= byteSpan[0] || byteSpan[1] > bytes.byteLength) {
    throw new Error('SOURCE_BYTE_SPAN_INVALID');
  }
  const sourceBytes = Buffer.from(bytes);
  const spanBytes = sourceBytes.subarray(byteSpan[0], byteSpan[1]);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(spanBytes);
  } catch {
    throw new Error('SOURCE_BYTE_SPAN_NOT_UTF8_ALIGNED');
  }
  const startLine = sourceBytes.subarray(0, byteSpan[0]).toString('utf8').split('\n').length;
  const endLine = sourceBytes.subarray(0, byteSpan[1]).toString('utf8').split('\n').length;
  return {
    text,
    digest: sha256(spanBytes),
    startLine,
    endLine,
    byteSpan: [byteSpan[0], byteSpan[1]],
  };
}

/**
 * Validates and resolves a source file strictly from the materialized snapshot root.
 */
export function resolveSnapshotSourceFile({ snapshotRoot, manifestIndex, sourceRef, expectedWorkspaceRevision }) {
  if (!snapshotRoot || typeof snapshotRoot !== 'string') {
    throw new Error('SNAPSHOT_ROOT_REQUIRED');
  }
  if (!expectedWorkspaceRevision || typeof expectedWorkspaceRevision !== 'string') {
    throw new Error('WORKSPACE_REVISION_REQUIRED');
  }
  if (!sourceRef || typeof sourceRef !== 'string' || path.posix.isAbsolute(sourceRef.replaceAll('\\', '/'))) {
    throw new Error('SOURCE_REF_INVALID');
  }

  const normalizedRef = sourceRef.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalizedRef.split('/').some((p) => p === '..' || p === '')) {
    throw new Error('PATH_TRAVERSAL_OR_ESCAPE_REJECTED');
  }

  // 1. Check existence in manifest
  const manifestEntry = manifestIndex.get(normalizedRef);
  if (!manifestEntry) {
    throw new Error(`SOURCE_PATH_ABSENT_FROM_MANIFEST:${normalizedRef}`);
  }

  if (!manifestEntry.sourceRevision || !manifestEntry.contentDigest) {
    throw new Error('REVISION_REQUIRED: manifest entry missing sourceRevision or contentDigest');
  }

  // 2. Resolve inside snapshotRoot and ensure no traversal escapes
  const resolvedRoot = path.resolve(snapshotRoot);
  const absoluteTarget = path.resolve(resolvedRoot, ...normalizedRef.split('/'));
  if (!absoluteTarget.startsWith(`${resolvedRoot}${path.sep}`) && absoluteTarget !== resolvedRoot) {
    throw new Error(`PATH_TRAVERSAL_OR_ESCAPE_REJECTED:${normalizedRef}`);
  }

  if (!fs.existsSync(absoluteTarget)) {
    throw new Error(`MATERIALIZED_SNAPSHOT_FILE_NOT_FOUND:${normalizedRef}`);
  }

  // Check for symlinks escaping the snapshot root
  const lstat = fs.lstatSync(absoluteTarget);
  if (lstat.isSymbolicLink()) {
    const realTarget = fs.realpathSync(absoluteTarget);
    if (!realTarget.startsWith(`${resolvedRoot}${path.sep}`) && realTarget !== resolvedRoot) {
      throw new Error(`PATH_TRAVERSAL_OR_ESCAPE_REJECTED:symlink escapes snapshot:${normalizedRef}`);
    }
  }

  // 3. Verify exact bytes against manifest digest
  const bytes = fs.readFileSync(absoluteTarget);
  const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  const expectedDigest = cleanDigest(manifestEntry.contentDigest);
  if (actualDigest !== expectedDigest) {
    throw new Error(`SOURCE_BYTES_DIGEST_MISMATCH:${normalizedRef} expected ${expectedDigest} got ${actualDigest}`);
  }

  return {
    sourceRef: normalizedRef,
    absolutePath: absoluteTarget,
    sourceRevision: manifestEntry.sourceRevision,
    workspaceRevision: expectedWorkspaceRevision,
    contentDigest: `sha256:${actualDigest}`,
    byteLength: bytes.byteLength,
    bytes,
    verified: true,
  };
}

/**
 * Builds a qualified snapshot-bound edge proposal.
 */
export function buildSnapshotBoundEdgeProposal({
  sourceRef,
  sourceRevision,
  workspaceRevision,
  relation,
  targetLabel,
  line = null,
  byteSpan = null,
  caller = null,
  subjectSymbol = null,
  objectSymbol = null,
  symbolMatchKind = 'exact', // 'exact' | 'alias' | 'none'
  terminalExecutionReceipt = null,
}) {
  if (!sourceRef || typeof sourceRef !== 'string') throw new Error('SOURCE_REF_REQUIRED');
  if (!sourceRevision || typeof sourceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(sourceRevision)) {
    throw new Error('REVISION_REQUIRED: valid source_revision sha256 required');
  }
  if (!workspaceRevision || typeof workspaceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(workspaceRevision)) {
    throw new Error('REVISION_REQUIRED: valid workspace_revision sha256 required');
  }
  if (!relation || typeof relation !== 'string') throw new Error('RELATION_REQUIRED');
  if (!targetLabel || typeof targetLabel !== 'string') throw new Error('TARGET_LABEL_REQUIRED');

  let admissionStatus = 'REVIEW_REQUIRED';
  if (symbolMatchKind === 'alias') {
    admissionStatus = 'DEGRADED_ALIAS_MATCH';
  } else if (symbolMatchKind === 'exact' && subjectSymbol) {
    admissionStatus = 'CANONICAL_ELIGIBLE';
  }

  const proposal = {
    schema: 'atlas.graph-edge-proposal.v1',
    source_locator: sourceRef.replaceAll('\\', '/'),
    target_label: targetLabel,
    relation,
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    evidence: {
      line: typeof line === 'number' && line > 0 ? line : null,
      byte_span: Array.isArray(byteSpan) && byteSpan.length === 2 ? byteSpan : null,
      caller: typeof caller === 'string' ? caller : null,
    },
    resolution: {
      subject_symbol_id: subjectSymbol?.symbol_id ?? null,
      object_symbol_id: objectSymbol?.symbol_id ?? null,
      symbol_match_kind: symbolMatchKind,
    },
    admission_status: admissionStatus,
    canonical_authority: false,
    persisted: false,
  };

  const identityKey = [
    proposal.source_locator,
    proposal.target_label,
    proposal.relation,
    proposal.source_revision,
    proposal.workspace_revision,
    proposal.evidence.byte_span ? proposal.evidence.byte_span.join('-') : proposal.evidence.line ?? '',
  ].join('::');

  proposal.proposal_id = sha256(identityKey);
  return proposal;
}

/**
 * Validates whether proposals are eligible for canonical persistence.
 * Strictly requires an admitted terminal execution receipt.
 */
export function validateProposalsForPersistence({ proposals, terminalExecutionReceipt, expectedWorkspaceRevision }) {
  if (!terminalExecutionReceipt) {
    return {
      allowed: false,
      reason: 'PERSISTENCE_REFUSED_MISSING_TERMINAL_RECEIPT',
      proposalsPersisted: 0,
    };
  }
  if (terminalExecutionReceipt.status !== 'COMPLETED' || terminalExecutionReceipt.workspaceRevision !== expectedWorkspaceRevision) {
    return {
      allowed: false,
      reason: 'PROPOSAL_REVISION_MISMATCH: terminal receipt workspace revision mismatch',
      proposalsPersisted: 0,
    };
  }

  // Deduplicate proposals deterministically by proposal_id
  const deduplicated = new Map();
  for (const p of proposals) {
    if (!deduplicated.has(p.proposal_id)) {
      deduplicated.set(p.proposal_id, p);
    }
  }

  return {
    allowed: true,
    totalProposals: proposals.length,
    distinctProposals: deduplicated.size,
    eligibleProposals: [...deduplicated.values()].filter((p) => p.admission_status === 'CANONICAL_ELIGIBLE'),
  };
}
