import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareUtf8 } from '../features/canonical-candidate-v1.js';

export const NaryFactProposalAdmissionV1Schema = z.enum([
  'PROPOSED',
  'ADMITTED',
  'REJECTED',
  'AMBIGUOUS',
]);

export const NaryFactProposalParticipantV1Schema = z.object({
  canonicalId: z.string().min(1),
  role: z.string().min(1),
  ordinal: z.number().int().nonnegative().optional(),
  entityType: z.string().min(1),
  entityRevision: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
}).strict();

export const NaryFactProposalV1Schema = z.object({
  schema: z.literal('atlas.nary-fact-proposal.v1'),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  packetKey: z.string().min(1),
  graphRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  predicate: z.string().min(1),
  participants: z.array(NaryFactProposalParticipantV1Schema).min(3).max(64),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(128),
  proposalChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  admission: NaryFactProposalAdmissionV1Schema,
}).strict();

export type NaryFactProposalParticipantV1 = z.infer<typeof NaryFactProposalParticipantV1Schema>;
export type NaryFactProposalV1 = z.infer<typeof NaryFactProposalV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => compareUtf8(left, right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function normalizeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareUtf8);
}

function normalizeParticipants(
  participants: readonly NaryFactProposalParticipantV1[],
): NaryFactProposalParticipantV1[] {
  const normalized = participants.map((participant) => NaryFactProposalParticipantV1Schema.parse(participant));
  const seen = new Set<string>();
  for (const participant of normalized) {
    const key = `${participant.role}\u0000${participant.canonicalId}`;
    if (seen.has(key)) throw new Error(`NARY_PROPOSAL_DUPLICATE_PARTICIPANT:${key}`);
    seen.add(key);
  }
  return normalized.sort((left, right) =>
    (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER)
    || compareUtf8(left.role, right.role)
    || compareUtf8(left.canonicalId, right.canonicalId)
  );
}

export function createNaryFactProposalV1(input: Omit<NaryFactProposalV1, 'schema' | 'proposalChecksum' | 'canonicalAuthority'> & {
  participants: readonly NaryFactProposalParticipantV1[];
  evidenceRefs: readonly string[];
}): NaryFactProposalV1 {
  const body = {
    schema: 'atlas.nary-fact-proposal.v1' as const,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    packetKey: input.packetKey,
    graphRevision: input.graphRevision,
    producerRevision: input.producerRevision,
    predicate: input.predicate,
    participants: normalizeParticipants(input.participants),
    evidenceRefs: normalizeStrings(input.evidenceRefs),
    canonicalAuthority: false as const,
    admission: input.admission,
  };
  if (body.evidenceRefs.length === 0) throw new Error('NARY_PROPOSAL_EVIDENCE_REQUIRED');
  return NaryFactProposalV1Schema.parse({
    ...body,
    proposalChecksum: checksum(body),
  });
}

export function verifyNaryFactProposalChecksumV1(proposal: NaryFactProposalV1): boolean {
  const parsed = NaryFactProposalV1Schema.parse(proposal);
  const { proposalChecksum: _ignored, ...body } = parsed;
  return checksum(body) === parsed.proposalChecksum;
}
