/**
 * Pure, read-only collision audit for the concept seed. No I/O, no database, no writer.
 * Adapted from the downloaded atlas-concept-routing-hardening kit (2026-11-07). Changes:
 *   - one approval may list several aliases (aliasOfConceptIds) or one (aliasConceptId)
 *   - accepts relation or predicate, both must equal ALIAS_OF
 *   - namespace rules live in NAMESPACE_RULES, not inline
 *   - each resolved pair records approval: HUMAN_APPROVED
 * Does NOT change the ConceptDefinitionV1 proposals or the live ontology resolver.
 */
import { createHash } from 'node:crypto';

export const NAMESPACE_RULES = Object.freeze({
  primary: 'domain',
  alias: 'ontology-domain',
});

const normalized = (v) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error('NONEMPTY_STRING_REQUIRED');
  return v.trim().toLowerCase();
};
const sorted = (it) => [...it].sort((a, b) => a.localeCompare(b, 'en'));
const sha = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');

export function deriveStructuralCollisions(proposals) {
  if (!Array.isArray(proposals)) throw new Error('PROPOSALS_NOT_ARRAY');
  const byId = new Map();
  const claims = new Map();
  for (const p of proposals) {
    if (!p || typeof p !== 'object' || typeof p.conceptId !== 'string' || !p.conceptId.trim()) {
      throw new Error('CONCEPT_ID_REQUIRED');
    }
    if (byId.has(p.conceptId)) throw new Error(`DUPLICATE_CONCEPT_ID:${p.conceptId}`);
    byId.set(p.conceptId, p);
    const localClaims = new Set([p.canonicalLabel, ...(p.aliases ?? [])].map(normalized));
    for (const label of localClaims) {
      if (!claims.has(label)) claims.set(label, new Set());
      claims.get(label).add(p.conceptId);
    }
  }
  return sorted(claims.keys()).filter((label) => claims.get(label).size > 1).map((label) => ({
    label, claimants: sorted(claims.get(label)),
  }));
}

/** Accepts { aliasOfConceptIds: [...] } or { aliasConceptId: '...' }; returns an array. */
function aliasList(raw) {
  if (Array.isArray(raw.aliasOfConceptIds)) return raw.aliasOfConceptIds;
  if (typeof raw.aliasConceptId === 'string') return [raw.aliasConceptId];
  return [];
}

export function auditCollisionResolutions(proposals, approvalDoc) {
  if (!approvalDoc || typeof approvalDoc !== 'object') throw new Error('APPROVAL_DOCUMENT_REQUIRED');
  if (approvalDoc.status !== 'APPROVED_BY_OPERATOR') throw new Error('APPROVAL_STATUS_NOT_VERIFIED');
  if (!Array.isArray(approvalDoc.resolutions)) throw new Error('APPROVAL_RESOLUTIONS_NOT_ARRAY');
  const byId = new Map(proposals.map((p) => [p.conceptId, p]));
  if (byId.size !== proposals.length) throw new Error('DUPLICATE_CONCEPT_ID');
  const collisions = deriveStructuralCollisions(proposals);
  const indexed = new Map(collisions.map((c) => [c.label, c]));
  const approved = new Map();

  for (const raw of approvalDoc.resolutions) {
    const label = normalized(raw?.label);
    if (approved.has(label)) throw new Error(`DUPLICATE_APPROVAL:${label}`);
    const actual = indexed.get(label);
    if (!actual) throw new Error(`NO_MATCHING_COLLISION:${label}`);
    if (actual.claimants.length !== 2) throw new Error(`COLLISION_HAS_MORE_THAN_TWO_CLAIMANTS:${label}`);
    const predicate = raw.relation ?? raw.predicate;
    if (predicate !== 'ALIAS_OF') throw new Error(`RELATION_NOT_APPROVED:${label}`);
    const primary = raw.primaryConceptId;
    const aliases = aliasList(raw);
    if (typeof primary !== 'string' || aliases.length !== 1 || aliases[0] === primary) {
      throw new Error(`INVALID_ALIAS_RELATION:${label}`);
    }
    const alias = aliases[0];
    if (!actual.claimants.includes(primary) || !actual.claimants.includes(alias)) {
      throw new Error(`STALE_OR_MISMATCHED_CLAIMANTS:${label}`);
    }
    if (byId.get(primary)?.namespace !== NAMESPACE_RULES.primary
      || byId.get(alias)?.namespace !== NAMESPACE_RULES.alias) {
      throw new Error(`WRONG_NAMESPACE_RELATION:${label}`);
    }
    if (normalized(byId.get(primary).canonicalLabel) !== label) {
      throw new Error(`PRIMARY_LABEL_MISMATCH:${label}`);
    }
    approved.set(label, {
      label, primaryConceptId: primary, aliasConceptId: alias, predicate: 'ALIAS_OF',
      subjectConceptId: alias, objectConceptId: primary,
      relationStatus: 'PROPOSED_NOT_PERSISTED', approval: 'HUMAN_APPROVED',
    });
  }

  const resolved = [...approved.values()].sort((a, b) => a.label.localeCompare(b.label));
  const unresolved = collisions.filter((c) => !approved.has(c.label));
  return {
    schema: 'atlas.concept-seed-resolution-audit.v2',
    rawCollisions: collisions,
    resolved,
    unresolved,
    rawCollisionChecksum: sha(JSON.stringify(collisions)),
    approvalPairsChecksum: sha(JSON.stringify(resolved.map(({ label, primaryConceptId, aliasConceptId, predicate }) =>
      [label, primaryConceptId, aliasConceptId, predicate]))),
    writesPerformed: false,
    canonicalRelationsUpdated: false,
    liveResolverRequalified: false,
    admissionAuthorized: false,
  };
}
