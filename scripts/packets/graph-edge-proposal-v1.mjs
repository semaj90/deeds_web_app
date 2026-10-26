import { createHash } from 'node:crypto';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildGraphEdgeProposalV1(edge) {
  if (!edge || typeof edge.source_locator !== 'string' || !edge.source_locator.trim()) {
    throw new Error('GRAPH_EDGE_SOURCE_LOCATOR_REQUIRED');
  }
  if (typeof edge.target_label !== 'string' || !edge.target_label.trim()) {
    throw new Error('GRAPH_EDGE_TARGET_LABEL_REQUIRED');
  }
  if (typeof edge.relation !== 'string' || !edge.relation.trim()) {
    throw new Error('GRAPH_EDGE_RELATION_REQUIRED');
  }

  const revisionPattern = /^sha256:[a-f0-9]{64}$/;
  const sourceRevision = typeof edge.source_revision === 'string' ? edge.source_revision : null;
  const workspaceRevision = typeof edge.workspace_revision === 'string' ? edge.workspace_revision : null;
  const hasSourceRevision = revisionPattern.test(sourceRevision ?? '');
  const hasWorkspaceRevision = revisionPattern.test(workspaceRevision ?? '');
  const hasInvalidRevision = (sourceRevision !== null && !hasSourceRevision)
    || (workspaceRevision !== null && !hasWorkspaceRevision);
  const sourceEvidence = edge.source_evidence ?? null;
  if (sourceEvidence) {
    if (sourceEvidence.sourceRevision !== sourceRevision
      || sourceEvidence.workspaceRevision !== workspaceRevision
      || !revisionPattern.test(sourceEvidence.contentDigest ?? '')
      || !Number.isSafeInteger(sourceEvidence.byteLength)
      || sourceEvidence.byteLength < 0
      || !['FILE', 'LINE'].includes(sourceEvidence.evidenceScope)) {
      throw new Error('GRAPH_EDGE_SOURCE_EVIDENCE_INVALID');
    }
    if (sourceEvidence.evidenceScope === 'FILE' && sourceEvidence.evidenceSpan !== null) {
      throw new Error('GRAPH_EDGE_SOURCE_EVIDENCE_SPAN_SCOPE_MISMATCH');
    }
    if (sourceEvidence.evidenceScope === 'LINE'
      && (!sourceEvidence.evidenceSpan
        || !Number.isSafeInteger(sourceEvidence.evidenceSpan.startByte)
        || !Number.isSafeInteger(sourceEvidence.evidenceSpan.endByte)
        || sourceEvidence.evidenceSpan.startByte < 0
        || sourceEvidence.evidenceSpan.endByte < sourceEvidence.evidenceSpan.startByte
        || !revisionPattern.test(sourceEvidence.evidenceSpan.digest ?? ''))) {
      throw new Error('GRAPH_EDGE_SOURCE_EVIDENCE_SPAN_INVALID');
    }
  }
  const proposal = {
    schema: 'atlas.graph-edge-proposal.v1',
    source_locator: edge.source_locator.replace(/\\/g, '/'),
    target_label: edge.target_label,
    relation: edge.relation,
    source_revision: hasSourceRevision ? sourceRevision : null,
    workspace_revision: hasWorkspaceRevision ? workspaceRevision : null,
    evidence: {
      line: Number.isInteger(edge.line) && edge.line > 0 ? edge.line : null,
      evidence_scope: sourceEvidence?.evidenceScope ?? edge.metadata?.evidence_scope ?? null,
      source_content_digest: sourceEvidence?.contentDigest ?? null,
      source_byte_length: sourceEvidence?.byteLength ?? null,
      source_span: sourceEvidence?.evidenceSpan ?? null,
      caller: typeof edge.caller === 'string' ? edge.caller : null,
      type: typeof edge.type === 'string' ? edge.type : null,
      metadata: edge.metadata && typeof edge.metadata === 'object' ? edge.metadata : {},
    },
    admission_status: hasInvalidRevision
      ? 'GATED_INVALID_REVISION'
      : hasSourceRevision && hasWorkspaceRevision
        ? 'REVIEW_REQUIRED'
        : 'GATED_MISSING_REVISION',
    canonical_authority: false,
  };
  proposal.proposal_id = `sha256:${createHash('sha256').update(stableJson(proposal)).digest('hex')}`;
  return proposal;
}

export function buildSourceEvidenceFromBytesV1(sourceRef, bytes, lineNumber = null) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim()) throw new Error('GRAPH_EDGE_SOURCE_LOCATOR_REQUIRED');
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('GRAPH_EDGE_SOURCE_BYTES_REQUIRED');
  const sourceBytes = Buffer.from(bytes);
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  let evidenceSpan = null;
  let evidenceScope = 'FILE';
  if (lineNumber !== null) {
    if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) throw new Error('GRAPH_EDGE_SOURCE_LINE_INVALID');
    let startByte = 0;
    for (let line = 1; line < lineNumber; line += 1) {
      const newline = sourceBytes.indexOf(0x0a, startByte);
      if (newline < 0) throw new Error('GRAPH_EDGE_SOURCE_LINE_OUT_OF_RANGE');
      startByte = newline + 1;
    }
    let endByte = sourceBytes.indexOf(0x0a, startByte);
    if (endByte < 0) endByte = sourceBytes.byteLength;
    if (endByte <= startByte) throw new Error('GRAPH_EDGE_SOURCE_LINE_EMPTY');
    evidenceScope = 'LINE';
    evidenceSpan = {
      startByte,
      endByte,
      digest: `sha256:${createHash('sha256').update(sourceBytes.subarray(startByte, endByte)).digest('hex')}`,
    };
  }
  return {
    sourceRef: sourceRef.replace(/\\/g, '/'),
    sourceRevision,
    workspaceRevision: null,
    contentDigest: sourceRevision,
    byteLength: sourceBytes.byteLength,
    evidenceScope,
    evidenceSpan,
  };
}

export function buildGraphEdgeProposalFromBytesV1(edge, bytes) {
  const sourceEvidence = buildSourceEvidenceFromBytesV1(edge.source_locator, bytes, edge.line ?? null);
  return buildGraphEdgeProposalV1({
    ...edge,
    source_revision: sourceEvidence.sourceRevision,
    workspace_revision: null,
    source_evidence: sourceEvidence,
  });
}

export function buildGraphEdgeProposalFromSnapshotV1(edge, evidenceBinder) {
  if (!evidenceBinder || typeof evidenceBinder.read !== 'function') {
    throw new Error('GRAPH_EDGE_SNAPSHOT_EVIDENCE_BINDER_REQUIRED');
  }
  const sourceEvidence = evidenceBinder.read({
    sourceRef: edge.source_locator,
    lineNumber: edge.line ?? null,
  });
  return buildGraphEdgeProposalV1({
    ...edge,
    source_revision: sourceEvidence.sourceRevision,
    workspace_revision: sourceEvidence.workspaceRevision,
    source_evidence: sourceEvidence,
  });
}
