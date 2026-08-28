import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateDomainOntologyTaxonomy } from './lib/domain-ontology-taxonomy-v1.mjs';

const domains = [
  { domainId: 'software', parentDomainId: null },
  { domainId: 'software.retrieval', parentDomainId: 'software' },
  { domainId: 'software.retrieval.semantic', parentDomainId: 'software.retrieval' },
];
const concepts = [
  { conceptId: 'concept:semantic-search', broaderConceptId: null, domainId: 'software.retrieval.semantic' },
  { conceptId: 'concept:embedding', broaderConceptId: 'concept:semantic-search', domainId: 'software.retrieval.semantic' },
];
const tuples = [
  { tupleId: 'tuple:domain', subject: 'packet:1', predicate: 'CLASSIFIED_AS', object: 'software.retrieval', evidenceRefs: ['source:src/search.ts'] },
  { tupleId: 'tuple:concept', subject: 'packet:1', predicate: 'HAS_ONTOLOGY_TAG', object: 'concept:embedding', evidenceRefs: ['ast:symbol:embed'] },
  { tupleId: 'tuple:topology', subject: 'packet:1', predicate: 'MEMBER_OF', object: 'cluster:retrieval:7', evidenceRefs: ['topology:receipt:1'] },
  { tupleId: 'tuple:broader', subject: 'concept:embedding', predicate: 'BROADER_THAN', object: 'concept:semantic-search', evidenceRefs: ['ontology:def:1'] },
];

assert.equal(domains.find((d) => d.domainId === 'software.retrieval').parentDomainId, 'software');
assert.equal(domains.find((d) => d.domainId === 'software.retrieval.semantic').parentDomainId, 'software.retrieval');
assert.equal(new Set(tuples.map((tuple) => tuple.predicate)).size, 4);
assert(tuples.every((tuple) => tuple.evidenceRefs.length > 0));
assert.equal(tuples.find((tuple) => tuple.predicate === 'CLASSIFIED_AS').object, 'software.retrieval');
assert.equal(tuples.find((tuple) => tuple.predicate === 'HAS_ONTOLOGY_TAG').object, 'concept:embedding');
assert.notEqual(tuples.find((tuple) => tuple.predicate === 'MEMBER_OF').object, tuples.find((tuple) => tuple.predicate === 'CLASSIFIED_AS').object);
const contract = validateDomainOntologyTaxonomy({ domains, concepts, tuples });

const report = {
  schema: 'atlas.domain-ontology-taxonomy-proof-receipt.v1',
  status: 'PROVEN_FIXTURE_ONLY',
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  productionState: {
    domainTaxonomy: 'FLAT_CANONICAL_DOMAIN_LIST_WITH_ALIAS_AND_SCORE_CLASSIFICATION',
    topologyTaxonomy: 'HIERARCHICAL_TAXONOMY_NODES_AND_EDGES',
    ontologyTuples: 'EVIDENCE_LINKED_TYPED_ASSERTIONS',
    promotion: 'REVIEWED_TAXONOMY_ASSIGNMENT_TO_ENTITY_CLASSIFIED_AS_HYPEREDGE',
  },
  fixture: {
    hierarchyDepth: 3,
    domainNodes: domains,
    concepts,
    tuples,
    ...contract,
  },
  invariant: 'domain classification, ontology concept membership, and topology membership are separate predicates',
  notProven: [
    'durable current domain hierarchy owner',
    'revision-qualified domain tuple backfill',
    'live source lineage for all packets',
    'promotion of unreviewed assignments',
  ],
};
const output = path.resolve('docs/reports/domain-ontology-taxonomy-proof-v1.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));
