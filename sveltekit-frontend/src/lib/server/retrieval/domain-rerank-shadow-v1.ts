import { createHash } from 'node:crypto';
import { z } from 'zod';

import { compareQueryDomainToPacketV1, type DomainClassMatchV1 } from './domain-class-match-v1.js';
import { composeDomainRerankEvidenceV1, type DomainRerankEvidenceV1 } from './domain-rerank-evidence-v1.js';
import {
  hydratePacketDomainLineageV1,
  PacketDomainLineageV1Schema,
  type PacketDomainFeatureEnvelopeV1,
  type PacketDomainLineageV1,
  type PacketDomainLineageHydrationProofV1,
} from './packet-domain-lineage-v1.js';
import type { FeatureEnvelope } from './feature-envelope.js';

export const DomainRerankShadowProofV1Schema = z.object({
  schema: z.literal('atlas.domain-rerank-shadow-proof.v1'),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  candidateCount: z.number().int().nonnegative(),
  packetLineageProvenCount: z.number().int().nonnegative(),
  matchEligibleCount: z.number().int().nonnegative(),
  exactPrimaryCount: z.number().int().nonnegative(),
  secondaryCount: z.number().int().nonnegative(),
  provenMismatchCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  rankingPromoted: z.literal(false),
  xgboostFeatureActivated: z.literal(false),
  proofChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type DomainRerankShadowProofV1 = z.infer<typeof DomainRerankShadowProofV1Schema>;

export interface DomainRerankShadowCandidateV1 {
  packetKey: string;
  lineage: PacketDomainLineageV1;
  comparison: DomainClassMatchV1;
  evidence: DomainRerankEvidenceV1;
}

export interface DomainRerankShadowResultV1 {
  envelopes: PacketDomainFeatureEnvelopeV1[];
  packetHydrationProof: PacketDomainLineageHydrationProofV1;
  candidates: DomainRerankShadowCandidateV1[];
  proof: DomainRerankShadowProofV1;
}

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

function lineageFromHydratedEnvelope(envelope: PacketDomainFeatureEnvelopeV1): PacketDomainLineageV1 {
  return PacketDomainLineageV1Schema.parse({
    schema: 'atlas.packet-domain-lineage.v1',
    packetKey: envelope.packet_key ?? 'missing-packet-key',
    status: envelope.domain_lineage_status,
    domainClass: envelope.domain_class ?? null,
    domainClassSource: envelope.domain_class_source,
    classifierVersion: envelope.domain_classifier_version,
    domainConfidence: envelope.domain_class_confidence,
    domainFactContentHash: envelope.domain_fact_content_hash,
    rewardPrior: envelope.reward_prior,
    lineageProven: envelope.domain_lineage_status === 'PROVEN',
  });
}

/**
 * Pure shadow evaluation over already packet-lineage-hydrated envelopes.
 * No result from this function is permitted to alter ranking.
 */
export function evaluateHydratedDomainRerankShadowV1(input: {
  query: string;
  envelopes: PacketDomainFeatureEnvelopeV1[];
  packetHydrationProof: PacketDomainLineageHydrationProofV1;
}): DomainRerankShadowResultV1 {
  const query = input.query.trim();
  const candidates = input.envelopes.map((envelope) => {
    const lineage = lineageFromHydratedEnvelope(envelope);
    const comparison = compareQueryDomainToPacketV1({ query, lineage });
    const evidence = composeDomainRerankEvidenceV1(envelope, comparison);
    return {
      packetKey: lineage.packetKey,
      lineage,
      comparison,
      evidence,
    } satisfies DomainRerankShadowCandidateV1;
  });

  const exactPrimaryCount = candidates.filter((row) => row.comparison.matchKind === 'EXACT_PRIMARY').length;
  const secondaryCount = candidates.filter((row) => row.comparison.matchKind === 'SECONDARY').length;
  const provenMismatchCount = candidates.filter((row) => row.comparison.matchKind === 'PROVEN_MISMATCH').length;
  const matchEligibleCount = candidates.filter((row) => row.evidence.domainClassMatchEligible).length;
  const unresolvedCount = candidates.length - matchEligibleCount;

  const proofPayload = {
    schema: 'atlas.domain-rerank-shadow-proof.v1' as const,
    queryHash: hash(query),
    candidateCount: candidates.length,
    packetLineageProvenCount: input.packetHydrationProof.lineageProvenCount,
    matchEligibleCount,
    exactPrimaryCount,
    secondaryCount,
    provenMismatchCount,
    unresolvedCount,
    rankingPromoted: false as const,
    xgboostFeatureActivated: false as const,
  };

  const proof = DomainRerankShadowProofV1Schema.parse({
    ...proofPayload,
    proofChecksum: hash(canonicalJson({
      ...proofPayload,
      comparisons: candidates.map((row) => row.comparison.comparisonChecksum),
      packetStatuses: candidates.map((row) => [row.packetKey, row.lineage.status]),
    })),
  });

  return {
    envelopes: input.envelopes,
    packetHydrationProof: input.packetHydrationProof,
    candidates,
    proof,
  };
}

/**
 * Read-only convenience wrapper for workstation/runtime shadow evaluation.
 * It performs the bounded packet/domain-ledger SELECTs, then runs the pure
 * comparator. The returned evidence is observational only and is not passed to
 * the live XGBoost sidecar or blend weights by this contract.
 */
export async function evaluateDomainRerankShadowV1(input: {
  query: string;
  envelopes: FeatureEnvelope[];
}): Promise<DomainRerankShadowResultV1> {
  const hydrated = await hydratePacketDomainLineageV1(input.envelopes);
  return evaluateHydratedDomainRerankShadowV1({
    query: input.query,
    envelopes: hydrated.envelopes,
    packetHydrationProof: hydrated.proof,
  });
}
