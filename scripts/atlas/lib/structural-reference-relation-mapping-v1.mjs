import crypto from 'node:crypto';
import { validateRelationFact, relationIdentity } from './canonical-relation-contract-v1.mjs';

/**
 * Pure, read-only mapping of StructuralReferenceFactV1 (packages/parent-atlas structural-symbol.ts) to relation
 * candidates for the canonical relation contract. Nothing is inserted. Only parser-proven facts with canonical endpoints
 * become candidates; everything else is reported with a typed reason. Model-inferred relations never enter this module.
 */
export const KIND_TO_RELATION = Object.freeze({
  import: { type: 'IMPORTS', source: 'SourceFile', target: 'SourceFile', fileLevel: true },
  import_binding: { type: 'IMPORTS_SYMBOL', source: 'SourceFile', target: 'Symbol', fileLevel: true },
  export: { type: 'EXPORTS', source: 'SourceFile', target: 'Symbol', fileLevel: true },
  call: { type: 'CALLS', source: 'Symbol', target: 'Symbol' },
  extends: { type: 'EXTENDS', source: 'Symbol', target: 'Symbol' },
  implements: { type: 'IMPLEMENTS', source: 'Symbol', target: 'Symbol' },
  implementation: { type: 'IMPLEMENTS', source: 'Symbol', target: 'Symbol' },
  class_ref: { type: 'REFERENCES', source: 'Symbol', target: 'Symbol' },
  type_ref: { type: 'REFERENCES', source: 'Symbol', target: 'Symbol' },
});

const SHA = /^sha256:[0-9a-f]{64}$/;
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

/**
 * @param {{facts:object[], scope:{repositoryId:string, snapshotId:string}|null, existing?:Map<string,{relationRevision:string,extractionRecipe:string}>}} input
 */
export function mapReferenceFacts({ facts, scope, existing = new Map() }) {
  const out = { candidates: [], unresolved: [], unsupportedKind: [], rejected: [], duplicates: 0, conflicts: [], counts: {} };
  const byIdentity = new Map();

  for (const fact of facts) {
    const rule = KIND_TO_RELATION[fact.reference_kind];
    if (!rule) { out.unsupportedKind.push({ referenceId: fact.reference_id, kind: fact.reference_kind }); continue; }
    if (fact.resolution_status !== 'canonical') { out.unresolved.push({ referenceId: fact.reference_id, reason: `RESOLUTION_${String(fact.resolution_status).toUpperCase()}` }); continue; }

    const source = rule.fileLevel
      ? { class: 'SourceFile', key: fact.source_ref }
      : fact.containing_stable_symbol_id ? { class: 'Symbol', key: fact.containing_stable_symbol_id } : null;
    const target = rule.target === 'SourceFile'
      ? (fact.target_source_ref ? { class: 'SourceFile', key: fact.target_source_ref } : null)
      : (fact.target_stable_symbol_id ? { class: 'Symbol', key: fact.target_stable_symbol_id } : null);
    if (!source) { out.unresolved.push({ referenceId: fact.reference_id, reason: 'SOURCE_ENDPOINT_MISSING' }); continue; }
    if (!target) { out.unresolved.push({ referenceId: fact.reference_id, reason: 'TARGET_ENDPOINT_MISSING' }); continue; }
    if (!SHA.test(fact.source_revision ?? '')) { out.rejected.push({ referenceId: fact.reference_id, reasons: ['SOURCE_REVISION_NOT_SHA256'] }); continue; }
    if (fact.target_source_revision && !SHA.test(fact.target_source_revision)) { out.rejected.push({ referenceId: fact.reference_id, reasons: ['TARGET_SOURCE_REVISION_NOT_SHA256'] }); continue; }

    const extractionRecipe = `${fact.extractor}@${fact.extractor_revision}`;
    const evidence = [
      { evidenceId: `source-bytes:${fact.source_ref}`, evidenceRevision: fact.source_revision, kind: 'SOURCE_BYTES' },
      ...fact.evidence_refs.map((ref) => ({ evidenceId: `structural-evidence:${ref}`, evidenceRevision: fact.source_revision, kind: 'PARSER_SPAN' })),
    ];
    const candidate = {
      type: rule.type, source, target, scope, extractionRecipe,
      relationRevision: sha256(JSON.stringify([rule.type, source, target, fact.workspace_revision, fact.source_revision, fact.target_source_revision ?? null, extractionRecipe])),
      origin: 'AST_STRUCTURAL', evidence,
    };
    const verdict = validateRelationFact(candidate);
    if (!verdict.admissible) { out.rejected.push({ referenceId: fact.reference_id, reasons: verdict.reasons }); continue; }

    const identity = relationIdentity(candidate);
    const seen = byIdentity.get(identity);
    if (seen) {
      out.duplicates += 1;
      const known = new Set(seen.evidence.map((e) => e.evidenceId));
      for (const e of evidence) if (!known.has(e.evidenceId)) seen.evidence.push(e);
      if (seen.relationRevision !== candidate.relationRevision) out.conflicts.push({ identity, reason: 'DUPLICATE_FACT_REVISION_DIFFERS' });
      continue;
    }
    byIdentity.set(identity, candidate);
    const row = existing.get(identity);
    if (row && (row.relationRevision !== candidate.relationRevision || row.extractionRecipe !== candidate.extractionRecipe)) out.conflicts.push({ identity, reason: 'EXISTING_ROW_REVISION_OR_RECIPE_DIFFERS' });
    out.candidates.push(candidate);
  }

  out.candidates.sort((a, b) => (relationIdentity(a) < relationIdentity(b) ? -1 : 1));
  out.counts = { facts: facts.length, candidates: out.candidates.length, unresolved: out.unresolved.length, unsupportedKind: out.unsupportedKind.length, rejected: out.rejected.length, duplicates: out.duplicates, conflicts: out.conflicts.length, alreadyPresent: out.candidates.filter((c) => existing.has(relationIdentity(c))).length };
  out.writesPerformed = false;
  out.canonicalAuthority = false;
  return out;
}
