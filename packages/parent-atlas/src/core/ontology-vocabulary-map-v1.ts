import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const sourceVocabulary = z.enum(['EXTERNAL_DOC_DOMAIN', 'EXTERNAL_DOC_ONTOLOGY']);

export const ontologyVocabularyMappingV1Schema = z.object({
  schema: z.literal('atlas.ontology-vocabulary-mapping.v1').default('atlas.ontology-vocabulary-mapping.v1'),
  sourceVocabulary,
  sourceLabel: z.string().min(1),
  targetClassId: z.string().min(1),
  mappingRevision: revision,
  ontologyRevision: revision,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type OntologyVocabularyMappingV1 = z.infer<typeof ontologyVocabularyMappingV1Schema>;

export const ontologyVocabularyMapReceiptV1Schema = z.object({
  schema: z.literal('atlas.ontology-vocabulary-map-receipt.v1').default('atlas.ontology-vocabulary-map-receipt.v1'),
  mappingRevision: revision,
  ontologyRevision: revision,
  sourceVocabulary,
  mappingCount: z.number().int().nonnegative(),
  sourceLabels: z.array(z.string().min(1)),
  mappingChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  writesPerformed: z.literal(false).default(false),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type OntologyVocabularyMapReceiptV1 = z.infer<typeof ontologyVocabularyMapReceiptV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

export function buildOntologyVocabularyMapReceiptV1(input: {
  sourceVocabulary: OntologyVocabularyMappingV1['sourceVocabulary'];
  mappingRevision: string;
  ontologyRevision: string;
  mappings: readonly OntologyVocabularyMappingV1[];
}): OntologyVocabularyMapReceiptV1 {
  const mappings = input.mappings.map((mapping) => ontologyVocabularyMappingV1Schema.parse(mapping)).sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel));
  if (mappings.some((mapping) => mapping.sourceVocabulary !== input.sourceVocabulary)) {
    throw new Error('ONTOLOGY_VOCABULARY_MISMATCH');
  }
  return ontologyVocabularyMapReceiptV1Schema.parse({
    schema: 'atlas.ontology-vocabulary-map-receipt.v1',
    mappingRevision: input.mappingRevision,
    ontologyRevision: input.ontologyRevision,
    sourceVocabulary: input.sourceVocabulary,
    mappingCount: mappings.length,
    sourceLabels: mappings.map((mapping) => mapping.sourceLabel),
    mappingChecksum: createHash('sha256').update(stableJson(mappings), 'utf8').digest('hex'),
    writesPerformed: false,
    canonicalAuthority: false,
  });
}
