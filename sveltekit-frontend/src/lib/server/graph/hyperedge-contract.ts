import { createHash } from 'node:crypto';
import { z } from 'zod';

export const HyperedgeParticipantV1Schema = z
  .object({
    canonicalId: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();
export type HyperedgeParticipantV1 = z.infer<typeof HyperedgeParticipantV1Schema>;

export const HyperedgeV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.hyperedge.v1'),
    hyperedgeId: z.string().min(1),
    predicate: z.string().min(1),
    participants: z.array(HyperedgeParticipantV1Schema).min(2),
    evidenceRefs: z.array(z.string().min(1)),
    workspaceRevision: z.string().min(1),
    graphRevision: z.string().min(1),
    sourceRevision: z.string().min(1),
    producerRevision: z.string().min(1),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type HyperedgeV1 = z.infer<typeof HyperedgeV1Schema>;

export interface HyperedgeV1Input {
  predicate: string;
  participants: HyperedgeParticipantV1[];
  evidenceRefs?: string[];
  workspaceRevision: string;
  graphRevision: string;
  sourceRevision: string;
  producerRevision: string;
}

export interface HyperedgeIncidenceRowV1 {
  hyperedgeId: string;
  canonicalId: string;
  role: string;
  incidenceWeight: 1;
  graphRevision: string;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeParticipants(participants: readonly HyperedgeParticipantV1[]): HyperedgeParticipantV1[] {
  const byRoleAndId = new Map<string, HyperedgeParticipantV1>();
  for (const participant of participants) {
    const parsed = HyperedgeParticipantV1Schema.parse({
      canonicalId: participant.canonicalId.trim(),
      role: participant.role.trim(),
    });
    byRoleAndId.set(`${parsed.role}\u001f${parsed.canonicalId}`, parsed);
  }
  return [...byRoleAndId.values()].sort((a, b) => {
    const role = a.role.localeCompare(b.role);
    return role !== 0 ? role : a.canonicalId.localeCompare(b.canonicalId);
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Build a deterministic role-aware n-ary fact/event.
 *
 * Identity deliberately includes source/workspace revision: a mutation or tool
 * execution at revision R is not the same event as an otherwise identical one
 * at revision R+1. graphRevision is lineage/projection metadata and is covered
 * by the checksum, but not the stable event key, so a disposable graph
 * projection can be rebuilt without changing the canonical event identity.
 */
export function createHyperedgeV1(input: HyperedgeV1Input): HyperedgeV1 {
  const predicate = input.predicate.trim();
  const participants = normalizeParticipants(input.participants);
  if (participants.length < 2) throw new Error('HyperedgeV1 requires at least two unique role-qualified participants');

  const evidenceRefs = stableUnique(input.evidenceRefs ?? []);
  const identityPayload = {
    predicate,
    participants,
    workspaceRevision: input.workspaceRevision.trim(),
    sourceRevision: input.sourceRevision.trim(),
  };
  const hyperedgeId = `hyperedge:${sha256(identityPayload).slice(0, 32)}`;
  const payloadWithoutChecksum = {
    schemaVersion: 'atlas.hyperedge.v1' as const,
    hyperedgeId,
    predicate,
    participants,
    evidenceRefs,
    workspaceRevision: input.workspaceRevision.trim(),
    graphRevision: input.graphRevision.trim(),
    sourceRevision: input.sourceRevision.trim(),
    producerRevision: input.producerRevision.trim(),
  };
  const checksum = sha256(payloadWithoutChecksum);
  return HyperedgeV1Schema.parse({ ...payloadWithoutChecksum, checksum });
}

/**
 * Disposable incidence projection for Neo4j/cuGraph/PageRank materialization.
 * Canonical HyperedgeV1 remains the authority; these rows may be regenerated.
 */
export function projectHyperedgeIncidence(edge: HyperedgeV1): HyperedgeIncidenceRowV1[] {
  return edge.participants.map((participant) => ({
    hyperedgeId: edge.hyperedgeId,
    canonicalId: participant.canonicalId,
    role: participant.role,
    incidenceWeight: 1,
    graphRevision: edge.graphRevision,
  }));
}
