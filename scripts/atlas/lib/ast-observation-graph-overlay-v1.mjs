import { createHash } from 'node:crypto';
import { createSourceBindingResolverV1, snapshotBindingFetcherV1, verifySourceBytesAgainstBindingV1 } from './source-binding-resolver-v1.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

export function verifyAstSourceBindingReceiptV1({ receipt, sourceEvidence, workspaceRevision, snapshotRevision }) {
  if (!receipt || receipt.schema !== 'atlas.directory-intelligence.source-binding-readback.v1'
    || receipt.status !== 'EXACT_SOURCE_BINDINGS_READBACK_VERIFIED' || receipt.canonicalAuthority !== false
    || receipt.sourceBindingOwner !== 'public.atlas_workspace_source_bindings'
    || receipt.queryMode !== 'REPEATABLE_READ_READ_ONLY'
    || receipt.writesPerformed !== false || receipt.datastoreWrites !== false || !Array.isArray(receipt.bindings)
    || !Number.isInteger(receipt.candidateCount) || !Number.isInteger(receipt.exactBindingCount)
    || typeof receipt.receiptSha256 !== 'string' || !(sourceEvidence instanceof Map)) {
    throw new Error('SOURCE_BINDING_RECEIPT_INVALID');
  }
  const { receiptSha256, ...body } = receipt;
  const digest = createHash('sha256').update(canonical(body)).digest('hex');
  if (digest !== receiptSha256) throw new Error('SOURCE_BINDING_RECEIPT_CHECKSUM_INVALID');
  if (receipt.workspaceRevision !== workspaceRevision || receipt.inputSnapshotRevision !== snapshotRevision) {
    throw new Error('SOURCE_BINDING_RECEIPT_REVISION_MISMATCH');
  }
  if (receipt.candidateCount !== sourceEvidence.size || receipt.exactBindingCount !== receipt.bindings.length) {
    throw new Error('SOURCE_BINDING_RECEIPT_COUNT_MISMATCH');
  }
  const rows = receipt.bindings.map(binding => ({
    canonical_source_ref: binding.sourceRef,
    workspace_revision: binding.workspaceRevision,
    source_revision: binding.sourceRevision,
    content_digest: binding.contentDigest,
    binding_checksum: binding.bindingChecksum,
    producer_revision: binding.producerRevision,
    byte_length: binding.byteLength,
  }));
  const resolveBinding = createSourceBindingResolverV1(snapshotBindingFetcherV1(rows));
  const bindings = [];
  for (const [sourceRef, evidence] of [...sourceEvidence].sort(([left], [right]) => compare(left, right))) {
    if (evidence.workspaceRevision !== workspaceRevision) throw new Error('SOURCE_BINDING_AST_WORKSPACE_REVISION_MISMATCH');
    const binding = resolveBinding({ workspaceRevision, sourceRef });
    if (!binding) throw new Error('SOURCE_BINDING_MISSING_OR_AMBIGUOUS');
    if (binding.sourceRevision !== `sha256:${evidence.sourceSha256}`) throw new Error('SOURCE_BINDING_SOURCE_REVISION_MISMATCH');
    const byteCheck = verifySourceBytesAgainstBindingV1(binding, evidence.sourceBytes);
    if (!byteCheck.verified) throw new Error(byteCheck.status);
    bindings.push({ sourceRef, sourceRevision: binding.sourceRevision, bindingChecksum: binding.bindingChecksum });
  }
  const expectedRefs = new Set(sourceEvidence.keys());
  if (rows.some(row => row.workspace_revision === workspaceRevision && !expectedRefs.has(row.canonical_source_ref))) {
    throw new Error('SOURCE_BINDING_UNEXPECTED_SOURCE');
  }
  return Object.freeze({
    status: 'SOURCE_BINDINGS_MATCH_AST_COHORT',
    receiptSha256,
    workspaceRevision,
    snapshotRevision,
    exactBindingCount: bindings.length,
    bindings,
    canonicalAuthority: false,
  });
}

export function addAstObservationOverlayV1({ graphNodes, graphEdges, directoryPaths, observations, sourceEvidence, importCandidates = [] }) {
  if (![graphNodes, graphEdges, directoryPaths, observations].every(Array.isArray) || !(sourceEvidence instanceof Map)) {
    throw new TypeError('AST_OVERLAY_INPUT_INVALID');
  }
  if (!Array.isArray(importCandidates)) throw new TypeError('AST_IMPORT_CANDIDATES_INVALID');
  const directories = new Set(directoryPaths);
  const nodes = new Map(graphNodes.map(row => [row.nodeKey, { ...row }]));
  if (nodes.size !== graphNodes.length) throw new Error('GRAPH_NODE_KEY_DUPLICATE');
  const edges = [...graphEdges];
  const edgeKey = row => JSON.stringify([
    row.sourceNodeKey ?? graphNodes[row.sourceOrdinal]?.nodeKey,
    row.targetNodeKey ?? graphNodes[row.targetOrdinal]?.nodeKey,
    row.edgeType, row.startByte ?? 0, row.endByte ?? 0,
  ]);
  const edgeKeys = new Set(graphEdges.map(edgeKey));
  const occurrenceIds = new Set();
  for (const observation of observations) {
    const evidence = sourceEvidence.get(observation.source_ref);
    if (!evidence || evidence.sourceSha256 !== String(observation.source_revision ?? '').replace(/^sha256:/, '')
      || evidence.workspaceRevision !== observation.workspace_revision) throw new Error('AST_SOURCE_REVISION_BINDING_MISMATCH');
    if (!observation.tree_node_occurrence_id || occurrenceIds.has(observation.tree_node_occurrence_id)) {
      throw new Error('AST_OCCURRENCE_ID_MISSING_OR_DUPLICATE');
    }
    occurrenceIds.add(observation.tree_node_occurrence_id);
    if (observation.canonical_symbol_id != null || observation.symbol_version_id != null || observation.canonical_write !== false) {
      throw new Error('AST_CANONICAL_IDENTITY_NOT_ALLOWED_IN_ADVISORY_OVERLAY');
    }
    const fileKey = `file:${observation.source_ref}`;
    const priorFile = nodes.get(fileKey);
    if (priorFile && priorFile.sourceSha256 && priorFile.sourceSha256 !== evidence.sourceSha256) {
      throw new Error('GRAPH_FILE_REVISION_CONFLICT');
    }
    nodes.set(fileKey, { ...priorFile, nodeKey: fileKey, nodeType: 'FILE', relativePath: observation.source_ref,
      sourceSha256: evidence.sourceSha256, identityStatus: 'CONTENT_AND_WORKSPACE_REVISION_BOUND_NONCANONICAL_FILE_REFERENCE' });
    let parent = observation.source_ref.includes('/')
      ? observation.source_ref.slice(0, observation.source_ref.lastIndexOf('/')) : '.';
    const parentChain = [];
    while (parent !== '.') {
      if (!directories.has(parent)) throw new Error('AST_PARENT_DIRECTORY_NOT_IN_FROZEN_SNAPSHOT');
      parentChain.push(parent);
      parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '.';
    }
    if (!directories.has('.')) throw new Error('ROOT_DIRECTORY_NOT_IN_FROZEN_SNAPSHOT');
    nodes.set('dir:.', { ...nodes.get('dir:.'), nodeKey: 'dir:.', nodeType: 'DIRECTORY', relativePath: '.',
      identityStatus: 'RUN_LOCAL_PATH_NOT_CANONICAL_ID' });
    for (const path of parentChain) nodes.set(`dir:${path}`, { ...nodes.get(`dir:${path}`), nodeKey: `dir:${path}`,
      nodeType: 'DIRECTORY', relativePath: path, identityStatus: 'RUN_LOCAL_PATH_NOT_CANONICAL_ID' });
    const observationKey = `ast-observation:${observation.tree_node_occurrence_id}`;
    if (nodes.has(observationKey)) throw new Error('AST_OBSERVATION_NODE_COLLISION');
    nodes.set(observationKey, {
      nodeKey: observationKey,
      nodeType: 'AST_OBSERVATION',
      relativePath: observation.source_ref,
      sourceSha256: evidence.sourceSha256,
      sourceRevision: observation.source_revision,
      workspaceRevision: observation.workspace_revision,
      occurrenceId: observation.tree_node_occurrence_id,
      name: observation.symbol_name ?? observation.name ?? '',
      kind: observation.symbol_kind ?? observation.entity_kind ?? '',
      signature: observation.signature ?? '',
      astKind: observation.ast_kind ?? '',
      startByte: observation.start_byte,
      endByte: observation.end_byte,
      startLine: observation.start_line,
      endLine: observation.end_line,
      extractor: observation.extractor ?? '',
      extractorRevision: observation.extractor_revision ?? '',
      identityStatus: 'EXISTING_OCCURRENCE_ID_ONLY_NO_CANONICAL_SYMBOL_ID',
    });
    const fileOrdinalPlaceholder = fileKey;
    const directory = observation.source_ref.includes('/')
      ? observation.source_ref.slice(0, observation.source_ref.lastIndexOf('/')) : '.';
    const contains = { sourceNodeKey: `dir:${directory}`, targetNodeKey: fileOrdinalPlaceholder,
      edgeType: 'CONTAINS', evidenceStatus: 'PATH_DERIVED_CANDIDATE', sourcePath: observation.source_ref,
      sourceSha256: evidence.sourceSha256, workspaceRevision: '', importSpecifier: '', startByte: 0, endByte: 0, line1: 0,
      installedVersion: '', installedVersionStatus: '' };
    const astEdge = { sourceNodeKey: fileKey, targetNodeKey: observationKey, edgeType: 'HAS_AST_OBSERVATION',
      evidenceStatus: 'EXACT_SOURCE_BYTES_AND_WORKSPACE_REVISION; NONCANONICAL_AST_OBSERVATION',
      sourcePath: observation.source_ref, sourceSha256: evidence.sourceSha256,
      workspaceRevision: evidence.workspaceRevision, importSpecifier: '', startByte: observation.start_byte,
      endByte: observation.end_byte, line1: observation.start_line, installedVersion: '', installedVersionStatus: '' };
    for (const edge of [contains, astEdge]) {
      const key = edgeKey(edge);
      if (!edgeKeys.has(key)) {
        edges.push(edge);
        edgeKeys.add(key);
      }
    }
    let child = directory;
    while (child !== '.') {
      const parentPath = child.includes('/') ? child.slice(0, child.lastIndexOf('/')) : '.';
      const edge = { sourceNodeKey: `dir:${parentPath}`, targetNodeKey: `dir:${child}`, edgeType: 'CONTAINS',
        evidenceStatus: 'PATH_DERIVED_CANDIDATE', sourcePath: child, sourceSha256: '', workspaceRevision: '',
        importSpecifier: '', startByte: 0, endByte: 0, line1: 0, installedVersion: '', installedVersionStatus: '' };
      const key = edgeKey(edge);
      if (!edgeKeys.has(key)) { edges.push(edge); edgeKeys.add(key); }
      child = parentPath;
    }
  }
  for (const candidate of importCandidates) {
    const expectedEdgeType = candidate.relationKind === 'STATIC_IMPORT'
      ? 'IMPORTS_SOURCE_CANDIDATE'
      : candidate.relationKind === 'STATIC_REEXPORT' ? 'REEXPORTS_SOURCE_CANDIDATE' : null;
    const source = sourceEvidence.get(candidate.sourcePath);
    const target = sourceEvidence.get(candidate.targetSourcePath);
    if (!source || !target || candidate.edgeType !== expectedEdgeType
      || !['STATIC_IMPORT', 'STATIC_REEXPORT'].includes(candidate.relationKind)
      || !['EXPLICIT_TYPE_ONLY', 'MIXED_TYPE_AND_VALUE', 'NO_EXPLICIT_TYPE_MODIFIER', 'SIDE_EFFECT_IMPORT'].includes(candidate.typeOnlyStatus)
      || candidate.evidenceStatus !== 'EXACT_SOURCE_SPAN_AND_REVISION; STATIC_MODULE_REFERENCE_ONLY; NONCANONICAL'
      || candidate.sourceSha256 !== source.sourceSha256 || candidate.sourceRevision !== source.sourceSha256
      || candidate.targetSourceSha256 !== target.sourceSha256
      || candidate.workspaceRevision !== source.workspaceRevision
      || candidate.targetWorkspaceRevision !== target.workspaceRevision
      || candidate.workspaceRevision !== target.workspaceRevision) throw new Error('AST_IMPORT_SOURCE_BINDING_MISMATCH');
    if (!Buffer.isBuffer(source.sourceBytes) || !Number.isInteger(candidate.startByte) || !Number.isInteger(candidate.endByte)
      || candidate.startByte < 0 || candidate.endByte <= candidate.startByte || candidate.endByte > source.sourceBytes.length
      || source.sourceBytes.subarray(candidate.startByte, candidate.endByte).toString('utf8') !== candidate.importSpanText) {
      throw new Error('AST_IMPORT_SPAN_INVALID');
    }
    const edge = { ...candidate, sourceNodeKey: `file:${candidate.sourcePath}`, targetNodeKey: `file:${candidate.targetSourcePath}` };
    const key = edgeKey(edge);
    if (!edgeKeys.has(key)) {
      edges.push(edge);
      edgeKeys.add(key);
    }
  }
  const nodeRows = [...nodes.values()].sort((a, b) => compare(a.nodeKey, b.nodeKey));
  const ordinal = new Map(nodeRows.map((row, index) => [row.nodeKey, index]));
  const edgeRows = edges.map(row => {
    const sourceNodeKey = row.sourceNodeKey ?? graphNodes[row.sourceOrdinal]?.nodeKey;
    const targetNodeKey = row.targetNodeKey ?? graphNodes[row.targetOrdinal]?.nodeKey;
    if (!ordinal.has(sourceNodeKey) || !ordinal.has(targetNodeKey)) throw new Error('GRAPH_EDGE_ENDPOINT_MISSING');
    const { sourceNodeKey: _sourceNodeKey, targetNodeKey: _targetNodeKey, ...rest } = row;
    return { ...rest, sourceOrdinal: ordinal.get(sourceNodeKey), targetOrdinal: ordinal.get(targetNodeKey) };
  }).sort((a, b) => a.sourceOrdinal - b.sourceOrdinal || a.targetOrdinal - b.targetOrdinal
    || compare(a.edgeType, b.edgeType) || (a.startByte ?? 0) - (b.startByte ?? 0));
  return { nodes: nodeRows.map((row, index) => ({ ...row, ordinal: index })), edges: edgeRows };
}
