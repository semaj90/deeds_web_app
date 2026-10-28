/**
 * Domain taxonomy contract (pure). Mirrors the live owner `domain_taxonomy_v1` / `atlas_domain_ontology` (17 rows, version 1):
 * ids like `database`, `devops.env-config`, parent via `parent_domain_id`. This module validates a taxonomy document and
 * resolves a free-text label to an id by NORMALIZED EXACT match only (same rule as `atlas_domain_vocabulary_crosswalk_v1`).
 * It never invents a domain, never fuzzy-matches, and never relabels history: an unresolved label is ABSTAIN, not a guess.
 *
 * Three separate axes, never merged:
 *   broad domain   -> level-0 ids (single label)
 *   fine role      -> child ids whose parent is a broad domain (single label, optional)
 *   capabilities   -> multi-label set, separate vocabulary
 */
export const TAXONOMY_SCHEMA = 'atlas.domain-taxonomy-contract.v1';
export const STATUSES = Object.freeze(['ASSIGNED', 'UNKNOWN', 'ABSTAIN']);

const ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/;

export const normalizeLabel = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s_/&]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** @param {{version:number, domains:Array<{id:string,label:string,parentId?:string|null,description:string,synonyms?:string[],applicability?:string,active?:boolean}>, capabilities?:Array<{id:string,label:string}>}} doc */
export function validateTaxonomy(doc) {
  const errors = [];
  const domains = Array.isArray(doc?.domains) ? doc.domains : [];
  if (!Number.isInteger(doc?.version) || doc.version < 1) errors.push('VERSION_INVALID');
  if (domains.length === 0) errors.push('NO_DOMAINS');
  const byId = new Map();
  const names = new Map();
  for (const d of domains) {
    if (!ID.test(d?.id ?? '')) { errors.push(`ID_INVALID:${d?.id}`); continue; }
    if (byId.has(d.id)) { errors.push(`ID_DUPLICATE:${d.id}`); continue; }
    byId.set(d.id, d);
    if (typeof d.description !== 'string' || d.description.trim() === '') errors.push(`DESCRIPTION_MISSING:${d.id}`);
    for (const name of [d.label, d.id, ...(d.synonyms ?? [])]) {
      const key = normalizeLabel(name);
      if (key === '') { errors.push(`EMPTY_NAME:${d.id}`); continue; }
      if (names.has(key) && names.get(key) !== d.id) errors.push(`NAME_COLLISION:${key}:${names.get(key)}|${d.id}`);
      names.set(key, d.id);
    }
  }
  for (const d of byId.values()) {
    if (d.parentId == null) continue;
    const parent = byId.get(d.parentId);
    if (!parent) errors.push(`PARENT_MISSING:${d.id}->${d.parentId}`);
    else if (parent.parentId != null) errors.push(`DEPTH_EXCEEDS_TWO_LEVELS:${d.id}`);
    else if (!d.id.startsWith(`${d.parentId}.`)) errors.push(`CHILD_ID_NOT_PREFIXED_BY_PARENT:${d.id}`);
  }
  for (const c of doc?.capabilities ?? []) if (byId.has(c.id) || names.has(normalizeLabel(c.id))) errors.push(`CAPABILITY_COLLIDES_WITH_DOMAIN:${c.id}`);
  return { valid: errors.length === 0, errors, domainCount: byId.size };
}

/** Index for resolution; throws if the taxonomy is invalid so a bad document can never classify anything. */
export function buildResolver(doc) {
  const v = validateTaxonomy(doc);
  if (!v.valid) throw new Error(`TAXONOMY_INVALID: ${v.errors.join(';')}`);
  const index = new Map();
  for (const d of doc.domains) for (const name of [d.label, d.id, ...(d.synonyms ?? [])]) index.set(normalizeLabel(name), d);
  const byId = new Map(doc.domains.map((d) => [d.id, d]));
  return {
    byId,
    resolve(label) {
      const key = normalizeLabel(label);
      if (key === '') return { status: 'UNKNOWN', domainId: null, reason: 'EMPTY_LABEL' };
      const hit = index.get(key);
      if (!hit) return { status: 'ABSTAIN', domainId: null, reason: 'NO_NORMALIZED_EXACT_MATCH' };
      if (hit.active === false) return { status: 'ABSTAIN', domainId: null, reason: 'DOMAIN_INACTIVE', matched: hit.id };
      const parent = hit.parentId ?? null;
      return { status: 'ASSIGNED', domainId: hit.id, broadDomain: parent ?? hit.id, fineRole: parent ? hit.id : null, reason: 'NORMALIZED_EXACT' };
    },
  };
}

/** Census of a legacy label distribution against the taxonomy: how much is resolvable without guessing. */
export function censusLegacyLabels(resolver, counts) {
  const out = { assigned: 0, abstain: 0, unknown: 0, byLabel: {} };
  for (const [label, n] of Object.entries(counts)) {
    const r = resolver.resolve(label);
    out.byLabel[label] = { n, status: r.status, domainId: r.domainId };
    if (r.status === 'ASSIGNED') out.assigned += n; else if (r.status === 'ABSTAIN') out.abstain += n; else out.unknown += n;
  }
  return out;
}
