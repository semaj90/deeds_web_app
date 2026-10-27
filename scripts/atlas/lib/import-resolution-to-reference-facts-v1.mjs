/**
 * Pure adapter: ImportResolutionV1 records -> StructuralReferenceFactV1-shaped facts for structural-reference-relation-mapping-v1.
 * Two separate fact families, never conflated:
 *   - file-level `import`            : MODULE_RESOLVED or SYMBOL_VERSION_VERIFIED (the module is a verified admitted file)
 *   - symbol-level `import_binding`  : SYMBOL_VERSION_VERIFIED only (exact revision-bound symbol id)
 * Anything else yields no fact and a typed skip reason. No identity is created here.
 */
const SHA = /^sha256:[0-9a-f]{64}$/;

export function importResolutionsToFacts({ records, workspaceRevision, extractor = 'treesitter_chunker', extractorRevision }) {
  const facts = []; const skipped = [];
  if (!SHA.test(workspaceRevision ?? '')) return { facts, skipped: [{ reason: 'WORKSPACE_REVISION_NOT_SHA256' }] };
  const seen = new Set();
  records.forEach((r) => {
    const where = `${r.importerSourceRef}|${r.moduleSpecifier}|${r.localName ?? ''}|${r.importedName ?? ''}`;
    if (r.resolution === 'EXTERNAL_MODULE') { skipped.push({ where, reason: 'EXTERNAL_MODULE' }); return; }
    if (!['MODULE_RESOLVED', 'SYMBOL_VERSION_VERIFIED'].includes(r.resolution)) { skipped.push({ where, reason: `RESOLUTION_${r.resolution}` }); return; }
    if (r.canonicalAuthority !== false) { skipped.push({ where, reason: 'RECORD_CLAIMS_AUTHORITY' }); return; }
    if (!r.targetSourceRef || !SHA.test(r.targetSourceRevision ?? '')) { skipped.push({ where, reason: 'TARGET_NOT_REVISION_QUALIFIED' }); return; }
    const common = {
      schema: 'atlas.structural-reference-fact.v1', reference_kind: 'import', source_ref: r.importerSourceRef, source_revision: r.importerSourceRevision, workspace_revision: workspaceRevision,
      upstream_source_node_id: r.evidenceRefs[0], upstream_chunk_id: r.evidenceRefs[0], containing_stable_symbol_id: null, target_text: r.moduleSpecifier,
      captures: { importKind: r.importKind, importedName: r.importedName ?? '', localName: r.localName ?? '' }, evidence_refs: r.evidenceRefs, extractor, extractor_revision: extractorRevision,
    };
    // File-level import: one fact per (importer, target file), however many bindings.
    const fileKey = `file|${r.importerSourceRef}|${r.targetSourceRef}`;
    if (!seen.has(fileKey)) {
      seen.add(fileKey);
      facts.push({ ...common, reference_id: `import-file:${r.importerSourceRef}->${r.targetSourceRef}`, target_stable_symbol_id: null, target_source_ref: r.targetSourceRef, target_source_revision: r.targetSourceRevision, resolution_status: 'canonical' });
    }
    if (r.resolution === 'SYMBOL_VERSION_VERIFIED' && r.targetSymbolId) {
      const symKey = `sym|${r.importerSourceRef}|${r.targetSymbolId}`;
      if (!seen.has(symKey)) {
        seen.add(symKey);
        facts.push({ ...common, reference_kind: 'import_binding', reference_id: `import-binding:${r.importerSourceRef}->${r.targetSymbolId}`, target_stable_symbol_id: r.targetSymbolId, target_source_ref: r.targetSourceRef, target_source_revision: r.targetSourceRevision, resolution_status: 'canonical' });
      }
    } else if (r.importKind !== 'SIDE_EFFECT') skipped.push({ where, reason: r.reason ?? 'SYMBOL_LEVEL_NOT_VERIFIED', level: 'symbol' });
  });
  facts.sort((a, b) => (a.reference_id < b.reference_id ? -1 : 1));
  return { facts, skipped };
}
