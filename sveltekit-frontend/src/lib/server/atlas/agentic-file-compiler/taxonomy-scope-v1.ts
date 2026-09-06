import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import type { QueryClassificationV1 } from './query-classifier.js';

export const TAXONOMY_SCOPE_V1_SCHEMA = 'parent-atlas.taxonomy-scope.v1' as const;

export const TAXONOMY_SOURCE_V1 = [
  'FEATURE_ALIAS', 'TAXONOMY', 'SYMBOL', 'API_DOC', 'ONTOLOGY', 'PRF', 'LLM',
] as const;
export type TaxonomySourceV1 = typeof TAXONOMY_SOURCE_V1[number];

export const TaxonomyEvidenceRefV1Schema = z.object({
  kind: z.enum(['CLASSIFICATION', 'FEATURE', 'SYMBOL', 'API', 'OPEN_SPEC', 'ONTOLOGY']),
  ref: z.string().min(1),
  revision: z.string().min(1),
}).strict();
export type TaxonomyEvidenceRefV1 = z.infer<typeof TaxonomyEvidenceRefV1Schema>;

export const TaxonomyScopeV1Schema = z.object({
  schema: z.literal(TAXONOMY_SCOPE_V1_SCHEMA),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  queryClassificationChecksum: z.string().length(64),
  taxonomyRevision: z.string().min(1),
  ontologyRevision: z.string().min(1),
  domains: z.array(z.string().min(1)),
  topics: z.array(z.string().min(1)),
  subtopics: z.array(z.string().min(1)),
  featureIds: z.array(z.string().min(1)),
  apiRefs: z.array(z.string().min(1)),
  experimentRefs: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(TaxonomyEvidenceRefV1Schema),
  allowedSources: z.array(z.enum(TAXONOMY_SOURCE_V1)).min(1),
  maxExpansionTerms: z.number().int().positive().max(256),
  checksum: z.string().length(64),
}).strict();
export type TaxonomyScopeV1 = z.infer<typeof TaxonomyScopeV1Schema>;

export interface TaxonomyFeatureDescriptorV1 { id: string; aliases?: readonly string[]; }
export interface TaxonomyApiDescriptorV1 { ref: string; aliases?: readonly string[]; }

function normalizedTerms(query: string): Set<string> {
  return new Set(query.toLocaleLowerCase().split(/[^a-z0-9_.:/-]+/).filter(Boolean));
}

function matches(queryTerms: Set<string>, id: string, aliases: readonly string[] = []): boolean {
  const candidates = [id, ...aliases].flatMap((value) => value.toLocaleLowerCase().split(/[^a-z0-9_.:/-]+/).filter(Boolean));
  return candidates.some((candidate) => queryTerms.has(candidate));
}

export function compileTaxonomyScopeV1(input: {
  classification: QueryClassificationV1;
  workspaceRevision: string;
  taxonomyRevision: string;
  ontologyRevision: string;
  knownFeatures?: readonly TaxonomyFeatureDescriptorV1[];
  knownApis?: readonly TaxonomyApiDescriptorV1[];
}): TaxonomyScopeV1 {
  const queryTerms = normalizedTerms(input.classification.rawQuery);
  const domains = [...new Set(input.classification.domains)].sort();
  const featureIds = (input.knownFeatures ?? [])
    .filter((feature) => matches(queryTerms, feature.id, feature.aliases))
    .map((feature) => feature.id)
    .sort();
  const apiRefs = (input.knownApis ?? [])
    .filter((api) => matches(queryTerms, api.ref, api.aliases))
    .map((api) => api.ref)
    .sort();
  const evidenceRefs: TaxonomyEvidenceRefV1[] = domains.length || featureIds.length || apiRefs.length
    ? [{ kind: 'CLASSIFICATION', ref: `classification:${input.classification.requestId}`, revision: input.classification.checksum }]
    : [];
  const body = {
    schema: TAXONOMY_SCOPE_V1_SCHEMA,
    requestId: input.classification.requestId,
    workspaceRevision: input.workspaceRevision,
    queryClassificationChecksum: input.classification.checksum,
    taxonomyRevision: input.taxonomyRevision,
    ontologyRevision: input.ontologyRevision,
    domains,
    topics: [],
    subtopics: [],
    featureIds,
    apiRefs,
    experimentRefs: [],
    confidence: 1,
    evidenceRefs,
    allowedSources: ['FEATURE_ALIAS', 'TAXONOMY', 'SYMBOL', 'API_DOC', 'ONTOLOGY'],
    maxExpansionTerms: 32,
  };
  return TaxonomyScopeV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
