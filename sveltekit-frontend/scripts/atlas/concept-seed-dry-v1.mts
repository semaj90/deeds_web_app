import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CANONICAL_DOMAINS, DOMAIN_TAXONOMY_VERSION } from '$lib/server/atlas/domain-taxonomy.js';
import { createConceptV1 } from '$lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.js';

const concepts = CANONICAL_DOMAINS.map((label) => createConceptV1({
  conceptKey: `domain.${label}`,
  namespace: 'parent-atlas.domain',
  label,
  aliases: [],
  description: `Parent Atlas canonical coarse domain: ${label}.`,
  taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
  definitionEvidenceRefs: ['source:domain-taxonomy.ts'],
  producerRevision: DOMAIN_TAXONOMY_VERSION,
}));

const candidateSetChecksum = createHash('sha256')
  .update(JSON.stringify(concepts))
  .digest('hex');

const report = {
  schema: 'atlas.concept-seed-dry-01.v1',
  task: 'CONCEPT-SEED-DRY-01',
  mode: 'READ_ONLY_PROPOSAL',
  source: 'sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts',
  taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
  candidateCount: concepts.length,
  candidateSetChecksum,
  candidates: concepts.map((concept) => ({ ...concept, status: 'proposed' })),
  databaseWrites: 0,
  canonicalPromotion: false,
  blockers: [
    'atlas_ontology_concepts is empty in the live database',
    'definition evidence is source-contract evidence only',
    'bounded domain seed does not establish the complete controlled vocabulary',
  ],
  nextGate: 'CONCEPT-SEED-REVIEW-01',
};

const reportPath = path.resolve(process.cwd(), '..', 'docs', 'reports', 'concept-seed-dry-01.json');
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, candidateCount: concepts.length, candidateSetChecksum, databaseWrites: 0 }));
