const predicateKinds = new Map([
  ['CALLS', 'call'],
  ['IMPORTS', 'import'],
  ['EXPORTS', 'export'],
  ['EXTENDS', 'extends'],
  ['INHERITS', 'extends'],
  ['IMPLEMENTS', 'implements'],
  ['REFERENCES', 'type_ref'],
]);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildGraphifyStructuralReferenceFactsV1(rows, workspaceRevision) {
  if (!nonEmpty(workspaceRevision)) throw new Error('WORKSPACE_REVISION_REQUIRED');

  const facts = [];
  const rejections = [];
  for (const row of rows) {
    const referenceKind = predicateKinds.get(String(row.predicate ?? '').toUpperCase());
    const targetText = row.target_qualified_name ?? row.unresolved_target;
    const rejection = (code) => rejections.push({ edge_id: row.edge_id ?? null, code });

    if (!referenceKind) {
      rejection('UNSUPPORTED_PREDICATE');
      continue;
    }
    if (!nonEmpty(row.edge_id) || !nonEmpty(row.source_symbol_id) || !nonEmpty(row.source_ref)
      || !nonEmpty(row.source_revision) || !nonEmpty(row.source_binding_revision)
      || row.source_revision !== row.source_binding_revision
      || row.source_binding_workspace_revision !== workspaceRevision) {
      rejection('SOURCE_BINDING_MISMATCH_OR_INCOMPLETE');
      continue;
    }
    if (!nonEmpty(targetText)) {
      rejection('TARGET_TEXT_MISSING');
      continue;
    }
    if (row.target_symbol_id && (!nonEmpty(row.target_source_ref) || !nonEmpty(row.target_source_revision)
      || !nonEmpty(row.target_binding_revision) || row.target_source_revision !== row.target_binding_revision
      || row.target_binding_workspace_revision !== workspaceRevision)) {
      rejection('TARGET_BINDING_MISMATCH_OR_INCOMPLETE');
      continue;
    }

    facts.push({
      schema: 'atlas.structural-reference-fact.v1',
      reference_id: `graphify-edge:${row.edge_id}:${workspaceRevision}`,
      reference_kind: referenceKind,
      source_ref: row.source_ref,
      source_revision: row.source_revision,
      ...(row.target_symbol_id ? {
        target_source_ref: row.target_source_ref,
        target_source_revision: row.target_source_revision,
      } : {}),
      workspace_revision: workspaceRevision,
      upstream_source_node_id: row.source_symbol_id,
      ...(row.target_symbol_id ? { upstream_target_node_id: row.target_symbol_id } : {}),
      upstream_chunk_id: row.source_symbol_id,
      target_text: targetText,
      resolution_status: 'unresolved',
      captures: {
        graphify_edge_id: row.edge_id,
        predicate: String(row.predicate).toUpperCase(),
        evidence_kind: String(row.evidence_kind ?? 'unknown'),
        evidence_span: JSON.stringify(row.evidence_span ?? null),
        confidence: String(row.confidence ?? ''),
      },
      evidence_refs: [`graphify-edge:${row.edge_id}`],
      extractor: 'framework_adapter',
      extractor_revision: 'graphify-edges-adapter-v1',
    });
  }

  return {
    schema: 'atlas.graphify-structural-reference-facts.v1',
    workspace_revision: workspaceRevision,
    facts,
    rejections,
    canonical_authority: false,
    writes_performed: false,
  };
}
