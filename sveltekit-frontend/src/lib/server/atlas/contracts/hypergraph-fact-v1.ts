import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * HypergraphFactV1 — Canonical Hypergraph Fact Contract
 *
 * Defines n-ary semantic facts and persistence contracts across PostgreSQL (canonical truth)
 * and Neo4j (graph projection). Preserves whole-fact recovery so retrieval does not
 * suffer lossy edge decomposition.
 *
 * Conforms to MASTER-FEATURE-TODO-2026-05-20 lines 918-937.
 */
export const HYPERGRAPH_FACT_SCHEMA_V1 = 'atlas.hypergraph-fact.v1' as const;

export const HypergraphFactParticipantV1Schema = z
  .object({
    entityId: z.string().min(1),
    role: z.string().min(1),
    ordinal: z.number().int().nonnegative().optional(),
    entityKind: z
      .enum(['PACKET', 'TREE_NODE', 'CONCEPT', 'FILE', 'STATUTE', 'CASE', 'UNKNOWN'])
      .default('UNKNOWN'),
  })
  .strict();
export type HypergraphFactParticipantV1 = z.infer<typeof HypergraphFactParticipantV1Schema>;

export const HypergraphFactEvidenceV1Schema = z
  .object({
    evidenceId: z.string().min(1),
    sourceRef: z.string().min(1),
    contentHash: z.string().min(1),
    byteRange: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
    lineRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
    snippet: z.string().optional(),
  })
  .strict();
export type HypergraphFactEvidenceV1 = z.infer<typeof HypergraphFactEvidenceV1Schema>;

export const HypergraphFactV1Schema = z
  .object({
    schema: z.literal(HYPERGRAPH_FACT_SCHEMA_V1),
    factId: z.string().min(1),
    predicate: z.string().min(1),
    participants: z.array(HypergraphFactParticipantV1Schema).min(2),
    evidence: z.array(HypergraphFactEvidenceV1Schema),
    workspaceRevision: z.string().min(1),
    graphRevision: z.string().min(1),
    sourceRevision: z.string().min(1),
    producerRevision: z.string().min(1),
    domainClass: z.string().optional(),
    confidenceScore: z.number().min(0).max(1).default(1.0),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type HypergraphFactV1 = z.infer<typeof HypergraphFactV1Schema>;

export interface HypergraphFactV1Input {
  predicate: string;
  participants: HypergraphFactParticipantV1[];
  evidence?: HypergraphFactEvidenceV1[];
  workspaceRevision: string;
  graphRevision: string;
  sourceRevision: string;
  producerRevision: string;
  domainClass?: string;
  confidenceScore?: number;
}

export interface Neo4jHypergraphProjectionV1 {
  factNode: {
    labels: ['HypergraphFact', string];
    properties: {
      factId: string;
      predicate: string;
      domainClass: string | null;
      confidenceScore: number;
      workspaceRevision: string;
      graphRevision: string;
      checksum: string;
    };
  };
  relationships: Array<{
    type: 'INCIDENT_IN';
    entityId: string;
    role: string;
    ordinal: number | null;
  }>;
}

function normalizeFactParticipants(
  participants: readonly HypergraphFactParticipantV1[]
): HypergraphFactParticipantV1[] {
  const byIdentity = new Map<string, HypergraphFactParticipantV1>();
  for (const p of participants) {
    const parsed = HypergraphFactParticipantV1Schema.parse({
      entityId: p.entityId.trim(),
      role: p.role.trim(),
      ordinal: p.ordinal,
      entityKind: p.entityKind ?? 'UNKNOWN',
    });
    const identityKey = `${parsed.role}\u001f${parsed.ordinal ?? ''}\u001f${parsed.entityId}`;
    byIdentity.set(identityKey, parsed);
  }
  return [...byIdentity.values()].sort((a, b) => {
    const ordA = a.ordinal ?? Number.MAX_SAFE_INTEGER;
    const ordB = b.ordinal ?? Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    const roleCmp = a.role.localeCompare(b.role);
    return roleCmp !== 0 ? roleCmp : a.entityId.localeCompare(b.entityId);
  });
}

function computeFactChecksum(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Factory to create a canonical HypergraphFactV1 with deterministic identity and checksum.
 */
export function createHypergraphFactV1(input: HypergraphFactV1Input): HypergraphFactV1 {
  const normalizedParticipants = normalizeFactParticipants(input.participants);
  if (normalizedParticipants.length < 2) {
    throw new Error('HypergraphFactV1 requires at least two role-qualified participants');
  }

  const normalizedEvidence = (input.evidence ?? []).map((e) =>
    HypergraphFactEvidenceV1Schema.parse({
      ...e,
      sourceRef: e.sourceRef.trim(),
    })
  );

  const payloadForId = {
    predicate: input.predicate.trim(),
    participants: normalizedParticipants,
    workspaceRevision: input.workspaceRevision.trim(),
    graphRevision: input.graphRevision.trim(),
    sourceRevision: input.sourceRevision.trim(),
  };

  const factId = `fact_${computeFactChecksum(payloadForId).slice(0, 32)}`;

  const payloadWithoutChecksum = {
    schema: HYPERGRAPH_FACT_SCHEMA_V1,
    factId,
    predicate: input.predicate.trim(),
    participants: normalizedParticipants,
    evidence: normalizedEvidence,
    workspaceRevision: input.workspaceRevision.trim(),
    graphRevision: input.graphRevision.trim(),
    sourceRevision: input.sourceRevision.trim(),
    producerRevision: input.producerRevision.trim(),
    domainClass: input.domainClass?.trim(),
    confidenceScore: input.confidenceScore ?? 1.0,
  };

  const checksum = computeFactChecksum(payloadWithoutChecksum);
  return HypergraphFactV1Schema.parse({ ...payloadWithoutChecksum, checksum });
}

/**
 * Projects a HypergraphFactV1 into Neo4j graph structure preserving whole-fact identity.
 */
export function projectFactToNeo4j(fact: HypergraphFactV1): Neo4jHypergraphProjectionV1 {
  return {
    factNode: {
      labels: ['HypergraphFact', fact.predicate],
      properties: {
        factId: fact.factId,
        predicate: fact.predicate,
        domainClass: fact.domainClass ?? null,
        confidenceScore: fact.confidenceScore,
        workspaceRevision: fact.workspaceRevision,
        graphRevision: fact.graphRevision,
        checksum: fact.checksum,
      },
    },
    relationships: fact.participants.map((p) => ({
      type: 'INCIDENT_IN',
      entityId: p.entityId,
      role: p.role,
      ordinal: p.ordinal ?? null,
    })),
  };
}

/**
 * Maps a HypergraphFactV1 to the Postgres feature_semantic_facts table format.
 */
export function factToSemanticFactsRow(fact: HypergraphFactV1) {
  const primaryEvidence = fact.evidence[0];
  return {
    packetKey: fact.factId,
    sourceRef: primaryEvidence?.sourceRef ?? `hypergraph/${fact.predicate}`,
    domainClass: fact.domainClass ?? null,
    similarityConfidence: fact.confidenceScore,
    contentHash: fact.checksum,
    metadata: {
      predicate: fact.predicate,
      participants: fact.participants,
      evidence: fact.evidence,
      workspaceRevision: fact.workspaceRevision,
      graphRevision: fact.graphRevision,
      sourceRevision: fact.sourceRevision,
    },
  };
}
