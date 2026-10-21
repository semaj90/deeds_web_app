const IMMUTABLE_COLUMNS = [
  'tree_node_id', 'v1_tree_node_id', 'repo_id', 'workspace_id', 'workspace_revision', 'identity_revision',
  'path_namespace', 'relative_path', 'source_revision', 'source_byte_length', 'node_kind', 'qualified_symbol',
  'occurrence', 'source_span_sha256', 'extraction_contract_revision', 'offset_encoding', 'start_byte', 'end_byte',
  'start_utf16', 'end_utf16', 'line_start', 'line_end', 'parent_tree_node_id', 'packet_key', 'parser_name',
  'parser_version', 'parser_language', 'grammar_version', 'superseded_by', 'superseded_at',
];

export function buildAtlasAstNodesV2RowProposalV1(proposal) {
  if (proposal?.schema !== 'atlas.ast-nodes-v2-proposal.v1' || proposal.status !== 'DRY_RUN_VALIDATED_NOT_INDEXED' ||
      proposal.canonicalAuthority !== false || proposal.writesPerformed !== false || !Array.isArray(proposal.nodes) ||
      !proposal.identity || proposal.unresolved?.packetKey !== true) {
    throw new Error('AST_V2_ROW_PROPOSAL_INPUT_INVALID');
  }
  const identity = proposal.identity;
  const rows = proposal.nodes.map(node => ({
    tree_node_id: node.treeNodeId,
    v1_tree_node_id: null,
    repo_id: identity.repoId,
    workspace_id: identity.workspaceId,
    workspace_revision: identity.workspaceRevision,
    identity_revision: identity.identityRevision,
    path_namespace: identity.pathNamespace,
    relative_path: identity.relativePath,
    source_revision: identity.sourceRevision,
    source_byte_length: identity.sourceByteLength,
    node_kind: node.nodeKind,
    qualified_symbol: node.qualifiedSymbol,
    occurrence: node.occurrence,
    source_span_sha256: node.sourceSpanSha256,
    extraction_contract_revision: identity.extractionContractRevision,
    offset_encoding: 'utf-8',
    start_byte: node.startByte,
    end_byte: node.endByte,
    start_utf16: node.startUtf16,
    end_utf16: node.endUtf16,
    line_start: node.lineStart,
    line_end: node.lineEnd,
    parent_tree_node_id: node.parentTreeNodeId,
    packet_key: null,
    parser_name: identity.parserName,
    parser_version: identity.parserVersion,
    parser_language: identity.parserLanguage,
    grammar_version: identity.grammarVersion,
    superseded_by: null,
    superseded_at: null,
  }));
  return {
    schema: 'atlas.ast-nodes-v2-row-proposal.v1',
    status: 'WRITER_INPUT_PROPOSAL_NOT_WRITTEN',
    canonicalAuthority: false,
    writesPerformed: false,
    packetIdentity: 'UNRESOLVED',
    rows,
  };
}

export function compareAtlasAstNodesV2IndependentReadbackV1(expectedRows, actualRows) {
  if (!Array.isArray(expectedRows) || !Array.isArray(actualRows)) throw new Error('AST_V2_READBACK_ROWS_REQUIRED');
  const expectedIds = expectedRows.map(row => row?.tree_node_id);
  const actualIds = actualRows.map(row => row?.tree_node_id);
  if (expectedIds.some(id => typeof id !== 'string' || !id) || actualIds.some(id => typeof id !== 'string' || !id)) {
    throw new Error('AST_V2_READBACK_ID_INVALID');
  }
  if (new Set(expectedIds).size !== expectedIds.length || new Set(actualIds).size !== actualIds.length) {
    return { status: 'DUPLICATE_READBACK_ID', exactMatchCount: 0, missingIds: [], unexpectedIds: [] };
  }
  const expectedById = new Map(expectedRows.map(row => [row.tree_node_id, row]));
  const actualById = new Map(actualRows.map(row => [row.tree_node_id, row]));
  const missingIds = expectedIds.filter(id => !actualById.has(id));
  const unexpectedIds = actualIds.filter(id => !expectedById.has(id));
  const conflicts = [];
  for (const id of expectedIds) {
    const actual = actualById.get(id);
    if (!actual) continue;
    const expected = expectedById.get(id);
    const differingColumns = IMMUTABLE_COLUMNS.filter(column => (actual[column] ?? null) !== (expected[column] ?? null));
    if (differingColumns.length) conflicts.push({ treeNodeId: id, differingColumns });
  }
  const exactMatchCount = expectedIds.length - missingIds.length - conflicts.length;
  return {
    status: missingIds.length || unexpectedIds.length || conflicts.length ? 'READBACK_MISMATCH' : 'INDEXED_READBACK_MATCH',
    exactMatchCount,
    missingIds,
    unexpectedIds,
    conflicts,
  };
}
