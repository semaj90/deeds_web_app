/**
 * Canonical relation contract (pure). Separates the LOGICAL relation (one fact) from EVIDENCE observations (many).
 * Nothing here reads or writes a datastore. Proposal-only origins can never be admitted.
 *
 * Node identity:  { class, key }   class in NODE_CLASSES; key is the canonical key for that class
 * Relation fact:  { type, source, target, scope:{repositoryId, snapshotId} | {crossRepository:true, repositoryIds[]},
 *                   extractionRecipe, relationRevision, origin, evidence:[{evidenceId, evidenceRevision, kind}] }
 */
export const NODE_CLASSES = Object.freeze(['Repository', 'SourceFile', 'Packet', 'Feature', 'Concept', 'Symbol', 'Directory']);

/** type -> allowed [sourceClass, targetClass] pairs. Direction is part of the contract. Types seen in live data: CONTAINS, MATERIALIZES, DERIVED_FROM, USES_CONCEPT. */
export const RELATION_TYPES = Object.freeze({
  CONTAINS: [['Directory', 'SourceFile'], ['Directory', 'Directory'], ['Repository', 'Directory'], ['SourceFile', 'Symbol']],
  MATERIALIZES: [['SourceFile', 'Packet'], ['Feature', 'Packet']],
  DERIVED_FROM: [['Packet', 'SourceFile'], ['Feature', 'Packet']],
  USES_CONCEPT: [['Packet', 'Concept'], ['Feature', 'Concept'], ['Symbol', 'Concept']],
  // Structural (parser-proven) reference relations, added with the AST-to-relation mapping.
  IMPORTS: [['SourceFile', 'SourceFile']],
  IMPORTS_SYMBOL: [['SourceFile', 'Symbol']],
  EXPORTS: [['SourceFile', 'Symbol']],
  CALLS: [['Symbol', 'Symbol']],
  REFERENCES: [['Symbol', 'Symbol'], ['SourceFile', 'Symbol']],
  EXTENDS: [['Symbol', 'Symbol']],
  IMPLEMENTS: [['Symbol', 'Symbol']],
});

/** Origins whose output is a hypothesis. They may never be admitted as canonical facts. */
export const PROPOSAL_ONLY_ORIGINS = Object.freeze(['LLM', 'EMBEDDING_SIMILARITY', 'KMEANS_CLUSTER', 'SOM_NEIGHBOR', 'HEURISTIC']);
export const ADMISSIBLE_ORIGINS = Object.freeze(['AST_STRUCTURAL', 'COMPILER_SYMBOL', 'MANIFEST_MEMBERSHIP', 'SCHEMA_DECLARED']);

const SHA = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRelationFact(fact) {
  const reasons = [];
  const f = fact ?? {};
  const allowedPairs = RELATION_TYPES[f.type];
  if (!allowedPairs) reasons.push('RELATION_TYPE_UNKNOWN');
  for (const side of ['source', 'target']) {
    const n = f[side];
    if (!n || !NODE_CLASSES.includes(n.class)) reasons.push(`${side.toUpperCase()}_CLASS_INVALID`);
    else if (typeof n.key !== 'string' || n.key.trim() === '' || n.key !== n.key.trim()) reasons.push(`${side.toUpperCase()}_KEY_INVALID`);
  }
  if (allowedPairs && NODE_CLASSES.includes(f.source?.class) && NODE_CLASSES.includes(f.target?.class)
    && !allowedPairs.some(([s, t]) => s === f.source.class && t === f.target.class)) {
    reasons.push(allowedPairs.some(([s, t]) => s === f.target.class && t === f.source.class) ? 'DIRECTION_REVERSED' : 'ENDPOINT_CLASS_PAIR_NOT_PERMITTED');
  }
  if (f.source && f.target && f.source.class === f.target.class && f.source.key === f.target.key) reasons.push('SELF_RELATION');
  const scope = f.scope;
  if (!scope) reasons.push('SCOPE_MISSING');
  else if (scope.crossRepository === true) {
    if (!Array.isArray(scope.repositoryIds) || scope.repositoryIds.length < 2 || scope.repositoryIds.some((id) => !UUID.test(id))) reasons.push('CROSS_REPOSITORY_SCOPE_INVALID');
  } else if (!UUID.test(scope.repositoryId ?? '') || !UUID.test(scope.snapshotId ?? '')) reasons.push('REPOSITORY_OR_SNAPSHOT_SCOPE_INVALID');
  if (typeof f.extractionRecipe !== 'string' || f.extractionRecipe === '') reasons.push('EXTRACTION_RECIPE_MISSING');
  if (!SHA.test(f.relationRevision ?? '')) reasons.push('RELATION_REVISION_INVALID');

  if (PROPOSAL_ONLY_ORIGINS.includes(f.origin)) {
    return { verdict: 'PROPOSAL_ONLY', admissible: false, reasons: [...reasons, `ORIGIN_${f.origin}_IS_PROPOSAL_ONLY`] };
  }
  if (!ADMISSIBLE_ORIGINS.includes(f.origin)) reasons.push('ORIGIN_UNKNOWN');

  const evidence = Array.isArray(f.evidence) ? f.evidence : [];
  if (evidence.length === 0) reasons.push('EVIDENCE_MISSING');
  const ids = new Set();
  for (const e of evidence) {
    if (!e?.evidenceId || !SHA.test(e.evidenceRevision ?? '') || !e.kind) { reasons.push('EVIDENCE_INCOMPLETE'); continue; }
    if (ids.has(e.evidenceId)) reasons.push('EVIDENCE_DUPLICATE');
    ids.add(e.evidenceId);
  }
  // Independence: at least one evidence item whose kind differs from the extraction origin's own output.
  const independent = evidence.filter((e) => e?.kind && e.kind !== f.origin);
  if (evidence.length > 0 && independent.length === 0) reasons.push('NO_INDEPENDENT_EVIDENCE');

  const unique = [...new Set(reasons)];
  return { verdict: unique.length === 0 ? 'ADMISSIBLE' : 'REJECTED', admissible: unique.length === 0, reasons: unique };
}

/** Logical identity: excludes evidence and confidence, so re-observation never creates a second relation. */
export function relationIdentity(fact) {
  const scope = fact.scope?.crossRepository ? `x:${[...fact.scope.repositoryIds].sort().join(',')}` : `${fact.scope?.repositoryId}:${fact.scope?.snapshotId}`;
  return [fact.type, fact.source.class, fact.source.key, fact.target.class, fact.target.key, scope].join('\u001f');
}

/**
 * Insert-or-verify against an existing row snapshot (plain object or null). Idempotent: same fact -> VERIFIED_EXISTING.
 * Differences in relationRevision or recipe for the same logical relation are a CONFLICT, never an overwrite.
 */
export function decideRelationWrite(fact, existing) {
  const v = validateRelationFact(fact);
  if (!v.admissible) return { decision: 'REJECT', reasons: v.reasons };
  if (!existing) return { decision: 'INSERT', identity: relationIdentity(fact) };
  if (existing.identity !== relationIdentity(fact)) return { decision: 'CONFLICT', reasons: ['LOGICAL_IDENTITY_MISMATCH'] };
  const drift = [];
  if (existing.relationRevision !== fact.relationRevision) drift.push('RELATION_REVISION_DIFFERS');
  if (existing.extractionRecipe !== fact.extractionRecipe) drift.push('EXTRACTION_RECIPE_DIFFERS');
  return drift.length === 0 ? { decision: 'VERIFIED_EXISTING', identity: existing.identity } : { decision: 'CONFLICT', reasons: drift };
}
