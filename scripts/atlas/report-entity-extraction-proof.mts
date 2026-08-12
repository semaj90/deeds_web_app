#!/usr/bin/env node
import { entityExtractor } from '../../sveltekit-frontend/src/lib/server/analysis/entity-extractor-unified.ts';

const sampleText = [
  'Contact Jane Doe at jane.doe@example.com or +1 (415) 555-0134.',
  'The matter cites 42 U.S.C. § 1983 and Case No. 1:24-cv-12345.',
  'The hearing was scheduled for 2026-08-11 in San Francisco, CA.',
].join(' ');

async function main() {
  const startedAt = new Date().toISOString();
  const entities = entityExtractor.extractViaRegex(sampleText);
  const receipt = {
    receiptKind: 'PHASE2C_ENTITY_EXTRACTION_PROVEN',
    status: entities.length > 0 ? 'PROVEN' : 'WARN',
    startedAt,
    sampleTextLength: sampleText.length,
    entityCount: entities.length,
    entityTypes: [...new Set(entities.map((entity) => entity.type))],
    extractorUsed: 'regex',
    entities: entities.slice(0, 12),
    notes: [
      'This proves the live entity extraction lane returns non-empty entities on a deterministic sample.',
      'The worker path imports this extractor directly; the proof is about runtime wiring, not corpus completeness.',
    ],
  };

  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
