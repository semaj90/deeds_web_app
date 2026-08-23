import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CANONICAL_DOMAINS,
  DOMAIN_TAXONOMY_VERSION,
  classifyDomainTaxonomy,
  type CanonicalDomain,
} from '../atlas/domain-taxonomy.js';
import type { RerankCandidate } from './runtime-reranker.js';
import type { PacketDomainLineageV1 } from './packet-domain-lineage-v1.js';

const CanonicalDomainSchema = z.enum(CANONICAL_DOMAINS);

export const DomainClassMatchKindV1Schema = z.enum([
  'EXACT_PRIMARY',
  'SECONDARY',
  'PROVEN_MISMATCH',
  'QUERY_DOMAIN_UNRESOLVED',
  'CANDIDATE_DOMAIN_LINEAGE_UNPROVEN',
  'CANDIDATE_DOMAIN_FALLBACK',
]);

export type DomainClassMatchKindV1 = z.infer<typeof DomainClassMatchKindV1Schema>;

export const DomainClassMatchV1Schema = z.object({
  schema: z.literal('atlas.domain-class-match.v1'),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  queryClassifierVersion: z.literal(DOMAIN_TAXONOMY_VERSION),
  queryDomainClass: CanonicalDomainSchema.nullable(),
  querySecondaryDomains: z.array(CanonicalDomainSchema),
  queryConfidence: z.number().min(0).max(1),
  candidatePacketKey: z.string().min(1),
  candidateDomainClass: z.union([CanonicalDomainSchema, z.literal('general')]).nullable(),
  candidateClassifierVersion: z.string().min(1).nullable(),
  candidateLineageStatus: z.string().min(1),
  domainClassMatch: z.union([z.literal(0), z.literal(0.5), z.literal(1)]).nullable(),
  matchKind: DomainClassMatchKindV1Schema,
  featureEligible: z.boolean(),
  comparisonChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type DomainClassMatchV1 = z.infer<typeof DomainClassMatchV1Schema>;

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function makeReceipt(input: Omit<DomainClassMatchV1, 'schema' | 'comparisonChecksum'>): DomainClassMatchV1 {
  const payload = { schema: 'atlas.domain-class-match.v1' as const, ...input };
  return DomainClassMatchV1Schema.parse({ ...payload, comparisonChecksum: hash(canonicalJson(payload)) });
}

export function compareQueryDomainToPacketV1(input: {
  query: string;
  lineage: PacketDomainLineageV1;
}): DomainClassMatchV1 {
  const query = input.query.trim();
  const queryClassification = classifyDomainTaxonomy({ summary: query });
  const queryDomainClass = queryClassification.primary_domain as CanonicalDomain | null;
  const querySecondaryDomains = queryClassification.secondary_domains
    .filter((value): value is CanonicalDomain => (CANONICAL_DOMAINS as readonly string[]).includes(value));
  const base = {
    queryHash: hash(query),
    queryClassifierVersion: DOMAIN_TAXONOMY_VERSION,
    queryDomainClass,
    querySecondaryDomains,
    queryConfidence: queryClassification.confidence,
    candidatePacketKey: input.lineage.packetKey,
    candidateDomainClass: input.lineage.domainClass,
    candidateClassifierVersion: input.lineage.classifierVersion,
    candidateLineageStatus: input.lineage.status,
  };
  if (!input.lineage.lineageProven) return makeReceipt({ ...base, domainClassMatch: null, matchKind: 'CANDIDATE_DOMAIN_LINEAGE_UNPROVEN', featureEligible: false });
  if (!input.lineage.domainClass || input.lineage.domainClass === 'general') return makeReceipt({ ...base, domainClassMatch: null, matchKind: 'CANDIDATE_DOMAIN_FALLBACK', featureEligible: false });
  if (!queryDomainClass) return makeReceipt({ ...base, domainClassMatch: null, matchKind: 'QUERY_DOMAIN_UNRESOLVED', featureEligible: false });
  if (input.lineage.domainClass === queryDomainClass) return makeReceipt({ ...base, domainClassMatch: 1, matchKind: 'EXACT_PRIMARY', featureEligible: true });
  if (querySecondaryDomains.includes(input.lineage.domainClass)) return makeReceipt({ ...base, domainClassMatch: 0.5, matchKind: 'SECONDARY', featureEligible: true });
  return makeReceipt({ ...base, domainClassMatch: 0, matchKind: 'PROVEN_MISMATCH', featureEligible: true });
}

export function applyDomainClassMatchToRerankCandidateV1(candidate: RerankCandidate, comparison: DomainClassMatchV1): RerankCandidate {
  return {
    ...candidate,
    domainClass: comparison.candidateDomainClass ?? candidate.domainClass,
    domainClassMatch: comparison.featureEligible ? comparison.domainClassMatch ?? undefined : undefined,
  };
}
