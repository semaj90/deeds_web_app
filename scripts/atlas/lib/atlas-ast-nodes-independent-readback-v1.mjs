const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/;

export async function verifyAtlasAstNodesIndependentReadbackV1(client, input) {
  const { expectedRows, workspaceId, workspaceRevision, sourceAuthorityRepoId } = input;
  if (!Array.isArray(expectedRows) || expectedRows.length === 0) throw new Error('AST_READBACK_EXPECTED_ROWS_REQUIRED');
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) throw new Error('AST_READBACK_WORKSPACE_ID_REQUIRED');
  if (!SHA256_REVISION.test(workspaceRevision ?? '')) throw new Error('AST_READBACK_WORKSPACE_REVISION_INVALID');
  if (typeof sourceAuthorityRepoId !== 'string' || sourceAuthorityRepoId.trim().length === 0) throw new Error('AST_READBACK_SOURCE_AUTHORITY_REPO_REQUIRED');
  const expectedById = new Map();
  for (const row of expectedRows) {
    if (typeof row.treeNodeId !== 'string' || expectedById.has(row.treeNodeId)) throw new Error('AST_READBACK_TREE_NODE_ID_INVALID_OR_DUPLICATE');
    if (typeof row.sourceRevision !== 'string' || !SHA256_REVISION.test(row.sourceRevision)) throw new Error(`AST_READBACK_SOURCE_REVISION_INVALID:${row.treeNodeId}`);
    expectedById.set(row.treeNodeId, row);
  }

  const { rows } = await client.query(
    `SELECT a.tree_node_id, a.repo_id::text AS repo_id, a.relative_path, a.node_kind,
            a.qualified_symbol, a.start_byte::text AS start_byte, a.end_byte::text AS end_byte,
            a.line_start, a.line_end, a.workspace_id, a.source_revision, a.source_content_hash,
            a.parser_name, a.parser_version, b.canonical_source_ref AS binding_source_ref,
            b.workspace_revision AS binding_workspace_revision,
            b.source_revision AS binding_source_revision, b.content_digest AS binding_content_digest,
            ri.source_authority_repo_id
       FROM public.atlas_ast_nodes a
       JOIN public.atlas_repository_identity ri
         ON ri.repository_id = a.repo_id
        AND ri.source_authority_repo_id = $3
       LEFT JOIN public.atlas_workspace_source_bindings b
         ON b.repo_id = ri.source_authority_repo_id
        AND lower(b.canonical_source_ref) = lower(a.relative_path)
        AND b.source_revision = a.source_revision
        AND b.workspace_revision = $2
      WHERE a.tree_node_id = ANY($1::text[])
      ORDER BY a.tree_node_id, b.canonical_source_ref`,
    [[...expectedById.keys()], workspaceRevision, sourceAuthorityRepoId],
  );

  const actualById = new Map();
  const mismatches = [];
  for (const row of rows) {
    const expected = expectedById.get(row.tree_node_id);
    if (!expected) {
      mismatches.push({ treeNodeId: row.tree_node_id, fields: ['UNEXPECTED_TREE_NODE_ID'] });
      continue;
    }
    const occurrences = actualById.get(row.tree_node_id) ?? [];
    occurrences.push(row);
    actualById.set(row.tree_node_id, occurrences);
  }

  for (const [treeNodeId, expected] of expectedById) {
    const matches = actualById.get(treeNodeId) ?? [];
    if (matches.length !== 1) {
      mismatches.push({ treeNodeId, fields: [matches.length === 0 ? 'ROW_MISSING' : 'ROW_OR_BINDING_AMBIGUOUS'] });
      continue;
    }
    const row = matches[0];
    const fields = [];
    if (row.relative_path !== expected.relativePath) fields.push('relative_path');
    if (row.node_kind !== expected.nodeKind || row.qualified_symbol !== expected.qualifiedSymbol) fields.push('node_kind_or_symbol');
    if (Number(row.start_byte) !== expected.startByte || Number(row.end_byte) !== expected.endByte) fields.push('byte_span');
    if (Number(row.line_start) !== expected.lineStart || Number(row.line_end) !== expected.lineEnd) fields.push('line_span');
    if (row.workspace_id !== workspaceId || row.workspace_id !== expected.workspaceId) fields.push('workspace_id');
    if (row.source_revision !== expected.sourceRevision || row.binding_source_revision !== expected.sourceRevision) fields.push('source_revision');
    if (row.source_content_hash !== expected.sourceContentDigest || row.binding_content_digest !== expected.sourceContentDigest) fields.push('source_content_digest');
    if (row.binding_source_ref !== expected.sourceRef) fields.push('source_ref_binding');
    if (row.binding_workspace_revision !== workspaceRevision) fields.push('workspace_revision_binding');
    if (row.source_authority_repo_id !== expected.sourceAuthorityRepoId) fields.push('source_authority_repo_id');
    if (row.parser_name !== expected.parserName || row.parser_version !== expected.parserVersion) fields.push('parser');
    if (fields.length) mismatches.push({ treeNodeId, fields });
  }

  return {
    status: mismatches.length === 0 && rows.length === expectedById.size ? 'INDEXED_READBACK_PROVEN' : 'INDEPENDENT_READBACK_FAILED',
    workspaceId,
    workspaceRevision,
    expectedRows: expectedById.size,
    rowsRead: rows.length,
    mismatches,
    readbackSource: 'atlas_ast_nodes JOIN atlas_repository_identity LEFT JOIN atlas_workspace_source_bindings',
  };
}
