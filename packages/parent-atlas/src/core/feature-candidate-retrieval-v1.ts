import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type ObservationFeatureRegistryV1 } from './observation-feature-compiler.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const observationFeatureCandidateSchema = z.object({
  feature_id: z.string().min(1),
  feature_ordinal: z.number().int().nonnegative(),
  exact_match: z.boolean(),
  lexical_score: z.number().finite().min(0).max(1),
  matched_terms: z.array(z.string().min(1)),
}).strict();
export type ObservationFeatureCandidateV1 = z.infer<typeof observationFeatureCandidateSchema>;

/** Retrieval output only: it proposes existing registry entries and cannot promote identity. */
export const featureCandidateRetrievalSchema = z.object({
  schema: z.literal('atlas.feature-candidate-retrieval.v1').default('atlas.feature-candidate-retrieval.v1'),
  observation_id: z.string().min(1),
  query_text: z.string().min(1),
  registry_revision: z.string().min(1),
  retrieval_revision: z.string().min(1),
  top_k: z.number().int().min(1).max(10),
  candidates: z.array(observationFeatureCandidateSchema).max(10),
  retrieval_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type FeatureCandidateRetrievalV1 = z.infer<typeof featureCandidateRetrievalSchema>;

function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/[^a-z0-9_.:-]+/g, ' ').trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/[\s._:-]+/).filter(Boolean))].sort();
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function retrieveFeatureCandidatesV1(input: {
  observationId: string;
  queryText: string;
  registry: ObservationFeatureRegistryV1;
  retrievalRevision: string;
  topK?: number;
}): FeatureCandidateRetrievalV1 {
  const query = normalize(input.queryText);
  const queryTerms = tokens(query);
  const topK = Math.max(1, Math.min(input.topK ?? 10, 10));
  const candidates = input.registry.definitions.map((definition) => {
    const featureText = normalize(`${definition.feature_id} ${definition.description}`);
    const featureTerms = new Set(tokens(featureText));
    const matchedTerms = queryTerms.filter((term) => featureTerms.has(term));
    const lexicalScore = queryTerms.length === 0 ? 0 : matchedTerms.length / queryTerms.length;
    const exactMatch = query === normalize(definition.feature_id);
    return observationFeatureCandidateSchema.parse({
      feature_id: definition.feature_id,
      feature_ordinal: definition.ordinal,
      exact_match: exactMatch,
      lexical_score: exactMatch ? 1 : lexicalScore,
      matched_terms: matchedTerms,
    });
  }).filter((candidate) => candidate.exact_match || candidate.lexical_score > 0)
    .sort((a, b) => Number(b.exact_match) - Number(a.exact_match) || b.lexical_score - a.lexical_score || a.feature_ordinal - b.feature_ordinal)
    .slice(0, topK);

  const body = {
    schema: 'atlas.feature-candidate-retrieval.v1' as const,
    observation_id: input.observationId,
    query_text: input.queryText,
    registry_revision: input.registry.registry_revision,
    retrieval_revision: input.retrievalRevision,
    top_k: topK,
    candidates,
    canonical_authority: false as const,
  };
  return featureCandidateRetrievalSchema.parse({ ...body, retrieval_checksum: digest(body) });
}
