import { createHash } from 'node:crypto';

const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function proposalOnlyNodeId(type, identity) {
  return `proposal:${type}:${createHash('sha256').update(identity).digest('hex')}`;
}

export function buildSnapshotBoundProposalGraphV1({ proposals, workspaceRevision, inputArtifactDigest, inputArtifacts = [], symbolCandidatesByTarget = {} }) {
  if (!Array.isArray(proposals) || proposals.length === 0) throw new Error('PROPOSALS_REQUIRED');
  if (!REVISION_PATTERN.test(workspaceRevision ?? '')) throw new Error('WORKSPACE_REVISION_INVALID');
  if (!REVISION_PATTERN.test(inputArtifactDigest ?? '')) throw new Error('INPUT_ARTIFACT_DIGEST_INVALID');

  const nodes = new Map();
  const edges = [];
  const proposalIds = new Set();

  for (const proposal of proposals) {
    const callsCandidate = proposal?.schema === 'atlas.graphify-edge-candidate.v1';
    const graphEdgeProposal = proposal?.schema === 'atlas.graph-edge-proposal.v1';
    if (!callsCandidate && !graphEdgeProposal) throw new Error('PROPOSAL_SCHEMA_INVALID');
    const predicate = callsCandidate ? proposal.predicate : proposal.relation;
    const sourceRef = callsCandidate ? proposal.source_ref : proposal.source_locator;
    const sourceContentDigest = callsCandidate ? proposal.source_content_digest : proposal.evidence?.source_content_digest;
    const sourceByteLength = callsCandidate ? proposal.source_byte_length : proposal.evidence?.source_byte_length;
    const span = callsCandidate
      ? proposal.evidence_span?.occurrence_byte_span
      : proposal.evidence?.source_span && [proposal.evidence.source_span.startByte, proposal.evidence.source_span.endByte];
    const spanDigest = callsCandidate ? proposal.evidence_span?.digest : proposal.evidence?.source_span?.digest;
    const startLine = callsCandidate ? proposal.evidence_span?.start_line : proposal.evidence?.line;
    const endLine = callsCandidate ? proposal.evidence_span?.end_line : proposal.evidence?.line;
    const targetLabel = callsCandidate ? proposal.unresolved_target : proposal.target_label;
    if (proposal.workspace_revision !== workspaceRevision) throw new Error('PROPOSAL_WORKSPACE_REVISION_MISMATCH');
    if (callsCandidate ? predicate !== 'CALLS' : !['HANDLES_ENDPOINT', 'REGISTERS_TOOL', 'REFERENCES_MCP', 'USES_TOOL', 'USES_DB', 'USES_QDRANT', 'USES_VECTOR_SEARCH'].includes(predicate)) {
      throw new Error('PROPOSAL_PREDICATE_UNSUPPORTED');
    }
    if (proposal.canonical_authority !== false
      || (callsCandidate && proposal.persisted !== false)
      || (!callsCandidate && proposal.persisted !== undefined && proposal.persisted !== false)
      || proposal.admission_status !== 'REVIEW_REQUIRED') {
      throw new Error('PROPOSAL_NOT_REVIEW_ONLY');
    }
    if (!REVISION_PATTERN.test(proposal.source_revision ?? '')
      || sourceContentDigest !== proposal.source_revision
      || !Number.isSafeInteger(sourceByteLength)
      || sourceByteLength < 0) throw new Error('PROPOSAL_SOURCE_LINEAGE_INVALID');
    if (callsCandidate || span !== null) {
      if (!Array.isArray(span) || span.length !== 2 || !span.every(Number.isSafeInteger)
        || span[0] < 0 || span[1] <= span[0] || span[1] > sourceByteLength
        || !REVISION_PATTERN.test(spanDigest ?? '')) throw new Error('PROPOSAL_SPAN_INVALID');
    } else if (proposal.evidence?.evidence_scope !== 'FILE') {
      throw new Error('PROPOSAL_FILE_EVIDENCE_INVALID');
    }
    if (typeof proposal.proposal_id !== 'string' || !proposal.proposal_id.trim() || proposalIds.has(proposal.proposal_id)) {
      throw new Error('PROPOSAL_ID_INVALID_OR_DUPLICATE');
    }
    if (typeof sourceRef !== 'string' || !sourceRef.trim()) throw new Error('PROPOSAL_SOURCE_REF_REQUIRED');
    if (typeof targetLabel !== 'string' || !targetLabel.trim()) throw new Error('PROPOSAL_TARGET_REQUIRED');

    proposalIds.add(proposal.proposal_id);
    const sourceKey = `${sourceRef}\n${proposal.source_revision}`;
    const sourceId = proposalOnlyNodeId('source', sourceKey);
    nodes.set(sourceId, {
      id: sourceId,
      kind: 'source',
      identityStatus: 'PROPOSAL_ONLY',
      sourceRef,
      sourceRevision: proposal.source_revision,
      workspaceRevision,
      sourceContentDigest,
      sourceByteLength,
    });

    let fromId = sourceId;
    let fromIdentityStatus = 'SOURCE_BOUND_PROPOSAL';
    let fromKind = 'source';
    if (callsCandidate) {
      const callerIdentity = proposal.subject_symbol_id
        ? `symbol:${proposal.subject_symbol_id}`
        : `unresolved-caller:${sourceRef}:${proposal.subject_evidence_key ?? proposal.proposal_id}`;
      fromId = proposalOnlyNodeId(proposal.subject_symbol_id ? 'symbol' : 'unresolved-symbol', callerIdentity);
      fromIdentityStatus = 'PROPOSAL_ONLY';
      fromKind = proposal.subject_symbol_id ? 'symbol' : 'unresolved_symbol';
      nodes.set(fromId, {
        id: fromId,
        kind: fromKind,
        identityStatus: fromIdentityStatus,
        symbolIdCandidate: proposal.subject_symbol_id ?? null,
        qualifiedName: proposal.subject_qualified_name ?? null,
        sourceRef,
        sourceRevision: proposal.source_revision,
      });
    }

    const targetIdentity = `${sourceRef}:${predicate}:${targetLabel}`;
    const targetKind = callsCandidate ? 'unresolved_symbol' : 'proposal_target';
    const targetId = proposalOnlyNodeId(targetKind, targetIdentity);
    nodes.set(targetId, {
      id: targetId,
      kind: targetKind,
      identityStatus: callsCandidate ? 'UNRESOLVED_PROPOSAL_LABEL' : 'PROPOSAL_LABEL_NOT_CANONICAL_ID',
      label: targetLabel,
      sourceRef,
      sourceRevision: proposal.source_revision,
    });

    edges.push({
      id: proposal.proposal_id,
      from: fromId,
      to: targetId,
      predicate,
      status: 'REVIEW_REQUIRED',
      identityStatus: fromIdentityStatus,
      evidence: {
        sourceNodeId: sourceId,
        sourceRef,
        workspaceRevision,
        sourceRevision: proposal.source_revision,
        sourceContentDigest,
        byteSpan: span ?? null,
        spanDigest: spanDigest ?? null,
        startLine: startLine ?? null,
        endLine: endLine ?? null,
      },
    });
  }

  for (const node of nodes.values()) {
    if (node.kind !== 'unresolved_symbol' || typeof node.label !== 'string') continue;
    const candidate = symbolCandidatesByTarget[node.label];
    if (!candidate) continue;
    const candidates = Array.isArray(candidate) ? candidate : candidate.candidates ?? [];
    node.advisorySymbolCandidates = candidates;
    node.advisoryResolutionStatus = candidates.length > 0
      ? candidates.some((item) => item.workspaceVersionCount > 0)
        ? 'CANDIDATE_WORKSPACE_VERSION_PRESENT_REVIEW_REQUIRED'
        : 'CANDIDATES_NOT_WORKSPACE_VERSION_QUALIFIED'
      : 'NO_EXACT_REGISTRY_OR_ALIAS_CANDIDATE';
  }

  edges.sort((left, right) => left.id.localeCompare(right.id));
  const graph = {
    schema: 'atlas.snapshot-bound-proposal-graph.v1',
    workspaceRevision,
    inputArtifactDigest,
    inputArtifacts,
    canonicalAuthority: false,
    persisted: false,
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges,
  };
  const graphDigest = digest(stableJson(graph));
  return {
    ...graph,
    receipt: {
      schema: 'atlas.snapshot-bound-proposal-graph-receipt.v1',
      status: 'INTEGRATED_PROPOSAL_GRAPH_REVIEW_REQUIRED',
      workspaceRevision,
      inputArtifactDigest,
      graphDigest,
      proposalCount: proposals.length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      unresolvedCallerCount: graph.nodes.filter((node) => node.kind === 'unresolved_symbol' && node.identityStatus === 'PROPOSAL_ONLY').length,
      unresolvedTargetCount: graph.nodes.filter((node) => node.identityStatus === 'UNRESOLVED_PROPOSAL_LABEL').length,
      proposalTargetLabelCount: graph.nodes.filter((node) => node.identityStatus === 'PROPOSAL_LABEL_NOT_CANONICAL_ID').length,
      callTargetsWithAdvisoryCandidates: graph.nodes.filter((node) => node.advisorySymbolCandidates?.length > 0).length,
      canonicalAuthority: false,
      writesPerformed: false,
    },
  };
}

export function verifySnapshotBoundProposalGraphV1(graph, { readArtifactBytes, requireSnapshotLineage = false } = {}) {
  const failures = [];
  const fail = (code) => failures.push(code);
  if (!graph || graph.schema !== 'atlas.snapshot-bound-proposal-graph.v1') fail('GRAPH_SCHEMA_INVALID');
  if (!graph?.receipt || graph.receipt.schema !== 'atlas.snapshot-bound-proposal-graph-receipt.v1') fail('RECEIPT_SCHEMA_INVALID');
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges) || !Array.isArray(graph?.inputArtifacts)) {
    fail('GRAPH_COLLECTIONS_INVALID');
    return { status: 'INVALID', failures };
  }

  const { receipt, ...graphBody } = graph;
  if (receipt?.graphDigest !== digest(stableJson(graphBody))) fail('GRAPH_DIGEST_MISMATCH');
  if (graph.inputArtifactDigest !== `sha256:${createHash('sha256').update(JSON.stringify(graph.inputArtifacts)).digest('hex')}`) {
    fail('INPUT_ARTIFACT_MANIFEST_DIGEST_MISMATCH');
  }
  if (graph.canonicalAuthority !== false || graph.persisted !== false || receipt?.canonicalAuthority !== false || receipt?.writesPerformed !== false) {
    fail('PROPOSAL_ONLY_GUARD_MISMATCH');
  }
  if (receipt?.status !== 'INTEGRATED_PROPOSAL_GRAPH_REVIEW_REQUIRED') fail('REVIEW_STATUS_MISMATCH');
  if (receipt?.workspaceRevision !== graph.workspaceRevision) fail('WORKSPACE_REVISION_MISMATCH');
  if (receipt?.nodeCount !== graph.nodes.length || receipt?.edgeCount !== graph.edges.length || receipt?.proposalCount !== graph.edges.length) {
    fail('RECEIPT_COUNT_MISMATCH');
  }
  const requiredLineageKinds = ['CALLS_PLAN', 'CALLS', 'ROOT_SOURCE_BINDING_RECEIPT', 'SYMBOL_CANDIDATE_CENSUS', 'SYMBOL_CANDIDATE_BASE_GRAPH'];
  if (requireSnapshotLineage && !requiredLineageKinds.every((kind) => graph.inputArtifacts.some((artifact) => artifact.kind === kind))) {
    fail('SNAPSHOT_LINEAGE_ARTIFACTS_MISSING');
  }
  if (requireSnapshotLineage && typeof readArtifactBytes !== 'function') fail('INPUT_ARTIFACT_READER_REQUIRED');

  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (!node?.id || nodeIds.has(node.id)) fail('NODE_ID_MISSING_OR_DUPLICATE');
    nodeIds.add(node?.id);
    if (node?.advisorySymbolCandidates?.length && node.identityStatus !== 'UNRESOLVED_PROPOSAL_LABEL') {
      fail('ADVISORY_SYMBOL_CANDIDATE_PROMOTED');
    }
  }

  const edgeIds = new Set();
  for (const edge of graph.edges) {
    if (!edge?.id || edgeIds.has(edge.id)) fail('EDGE_ID_MISSING_OR_DUPLICATE');
    edgeIds.add(edge?.id);
    if (!nodeIds.has(edge?.from) || !nodeIds.has(edge?.to) || !nodeIds.has(edge?.evidence?.sourceNodeId)) fail('DANGLING_GRAPH_REFERENCE');
    if (edge?.status !== 'REVIEW_REQUIRED'
      || (edge?.identityStatus !== undefined && !['PROPOSAL_ONLY', 'SOURCE_BOUND_PROPOSAL'].includes(edge.identityStatus))) {
      fail('EDGE_NOT_PROPOSAL_ONLY');
    }
    if (edge?.evidence?.workspaceRevision !== graph.workspaceRevision) fail('EDGE_WORKSPACE_REVISION_MISMATCH');
  }

  if (typeof readArtifactBytes === 'function') {
    const artifactBodies = new Map();
    for (const artifact of graph.inputArtifacts) {
      try {
        const bytes = readArtifactBytes(artifact.path);
        if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
          fail('ARTIFACT_READER_RETURN_TYPE_INVALID');
          continue;
        }
        if (artifact.byteLength !== bytes.byteLength || artifact.sha256 !== digest(bytes)) fail(`INPUT_ARTIFACT_READBACK_MISMATCH:${artifact.kind}`);
        if (['CALLS_PLAN', 'ROOT_SOURCE_BINDING_RECEIPT', 'SYMBOL_CANDIDATE_CENSUS', 'SYMBOL_CANDIDATE_BASE_GRAPH'].includes(artifact.kind)) {
          artifactBodies.set(artifact.kind, JSON.parse(Buffer.from(bytes).toString('utf8')));
        }
      } catch {
        fail(`INPUT_ARTIFACT_UNREADABLE:${artifact?.kind ?? 'UNKNOWN'}`);
      }
    }

    const callsPlanArtifact = graph.inputArtifacts.find((artifact) => artifact.kind === 'CALLS_PLAN');
    const callsArtifact = graph.inputArtifacts.find((artifact) => artifact.kind === 'CALLS');
    const callsPlan = artifactBodies.get('CALLS_PLAN');
    const sourceBindingReceipt = artifactBodies.get('ROOT_SOURCE_BINDING_RECEIPT');
    const census = artifactBodies.get('SYMBOL_CANDIDATE_CENSUS');
    const baseGraph = artifactBodies.get('SYMBOL_CANDIDATE_BASE_GRAPH');
    if (requireSnapshotLineage && (!callsPlanArtifact || !callsArtifact || !callsPlan || !sourceBindingReceipt || !census || !baseGraph)) fail('SNAPSHOT_LINEAGE_ARTIFACTS_UNREADABLE');
    if (callsPlan) {
      if (callsPlan.schema !== 'atlas.calls-edge-population-dryrun-plan.v1'
        || callsPlan.targetWorkspaceRevision !== graph.workspaceRevision
        || callsPlan.canonicalAuthority !== false
        || callsPlan.dbWritesPerformed !== false
        || callsPlan.projectionWritesPerformed !== false
        || callsPlan.proposalArtifact?.sha256 !== callsArtifact?.sha256
        || callsPlan.proposalArtifact?.path !== callsArtifact?.path) fail('CALLS_PLAN_LINEAGE_MISMATCH');
    }
    if (sourceBindingReceipt && (sourceBindingReceipt.schema !== 'atlas.workspace-source-binding-root-24253-receipt.v1'
      || sourceBindingReceipt.status !== 'COMMITTED_AND_READBACK_VERIFIED'
      || sourceBindingReceipt.workspaceRevision !== graph.workspaceRevision
      || sourceBindingReceipt.expectedRows !== sourceBindingReceipt.committedRows
      || sourceBindingReceipt.missingRows !== 0
      || sourceBindingReceipt.checksumMismatches !== 0)) fail('ROOT_SOURCE_BINDING_RECEIPT_MISMATCH');
    if (census && (census.schema !== 'atlas.calls-target-symbol-census.v1'
      || census.workspaceRevision !== graph.workspaceRevision
      || census.canonicalAuthority !== false
      || census.writesPerformed !== false)) fail('SYMBOL_CENSUS_LINEAGE_MISMATCH');
    if (baseGraph && (baseGraph.workspaceRevision !== graph.workspaceRevision
      || baseGraph.receipt?.graphDigest !== census?.graphDigest)) fail('SYMBOL_CANDIDATE_BASE_GRAPH_MISMATCH');
  }

  return {
    status: failures.length === 0 ? 'VERIFIED_PROPOSAL_GRAPH' : 'INVALID',
    failures: [...new Set(failures)],
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    inputArtifactCount: graph.inputArtifacts.length,
    graphDigest: receipt?.graphDigest ?? null,
    canonicalAuthority: graph.canonicalAuthority,
    writesPerformed: receipt?.writesPerformed ?? null,
  };
}
