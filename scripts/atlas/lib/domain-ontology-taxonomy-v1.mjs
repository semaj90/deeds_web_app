import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function checksum(value) {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export const DOMAIN_TUPLE_PREDICATES = Object.freeze([
  'CLASSIFIED_AS',
  'HAS_ONTOLOGY_TAG',
  'MEMBER_OF',
  'BROADER_THAN',
]);

function assertAcyclicDomains(domains) {
  const parentById = new Map(domains.map((domain) => [domain.domainId, domain.parentDomainId]));
  for (const domain of domains) {
    const seen = new Set();
    let cursor = domain.domainId;
    while (cursor) {
      if (seen.has(cursor)) throw new Error(`DOMAIN_HIERARCHY_CYCLE:${cursor}`);
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }
}

export function validateDomainOntologyTaxonomy({ domains, concepts, tuples }) {
  if (!Array.isArray(domains) || !Array.isArray(concepts) || !Array.isArray(tuples)) throw new Error('DOMAIN_ONTOLOGY_ARRAYS_REQUIRED');
  const domainIds = new Set();
  for (const domain of domains) {
    if (!domain.domainId) throw new Error('DOMAIN_ID_REQUIRED');
    if (domainIds.has(domain.domainId)) throw new Error(`DOMAIN_DUPLICATE:${domain.domainId}`);
    domainIds.add(domain.domainId);
  }
  for (const domain of domains) {
    if (domain.parentDomainId && !domainIds.has(domain.parentDomainId)) throw new Error(`DOMAIN_PARENT_UNKNOWN:${domain.domainId}:${domain.parentDomainId}`);
  }
  assertAcyclicDomains(domains);
  const conceptIds = new Set();
  for (const concept of concepts) {
    if (!concept.conceptId) throw new Error('CONCEPT_ID_REQUIRED');
    if (conceptIds.has(concept.conceptId)) throw new Error(`CONCEPT_DUPLICATE:${concept.conceptId}`);
    conceptIds.add(concept.conceptId);
    if (concept.domainId && !domainIds.has(concept.domainId)) throw new Error(`CONCEPT_DOMAIN_UNKNOWN:${concept.conceptId}:${concept.domainId}`);
    if (concept.broaderConceptId && !conceptIds.has(concept.broaderConceptId)) throw new Error(`CONCEPT_BROADER_UNKNOWN:${concept.conceptId}:${concept.broaderConceptId}`);
  }
  const tupleIds = new Set();
  for (const tuple of tuples) {
    if (!tuple.tupleId || !tuple.subject || !tuple.object) throw new Error('TUPLE_ID_SUBJECT_OBJECT_REQUIRED');
    if (tupleIds.has(tuple.tupleId)) throw new Error(`TUPLE_DUPLICATE:${tuple.tupleId}`);
    tupleIds.add(tuple.tupleId);
    if (!DOMAIN_TUPLE_PREDICATES.includes(tuple.predicate)) throw new Error(`TUPLE_PREDICATE_UNSUPPORTED:${tuple.predicate}`);
    if (!Array.isArray(tuple.evidenceRefs) || tuple.evidenceRefs.length === 0) throw new Error(`TUPLE_EVIDENCE_REQUIRED:${tuple.tupleId}`);
  }
  return { domainCount: domains.length, conceptCount: concepts.length, tupleCount: tuples.length, hierarchyChecksum: checksum(domains), conceptChecksum: checksum(concepts), tupleSetChecksum: checksum(tuples) };
}

