import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { ATLAS_ROOT_NAMESPACE_V1 } from '../../atlas/identity/atlas-uuid-namespaces-v1.js';
import { EvidenceClaimV1Schema } from './evidence-claim-v1.js';

const EVENT_NAMESPACE = uuidv5('atlas.evidence-timeline-event.v1', ATLAS_ROOT_NAMESPACE_V1);
const inputSchema = z.object({ claims: z.array(EvidenceClaimV1Schema).max(16) })
  .strict()
  .superRefine((input, context) => {
    const claimIds = new Set<string>();
    input.claims.forEach((claim, index) => {
      if (claimIds.has(claim.claimId)) {
        context.addIssue({ code: 'custom', path: ['claims', index, 'claimId'], message: 'DUPLICATE_CLAIM_ID' });
      }
      claimIds.add(claim.claimId);
    });
  });

const eventSchema = z.object({
  eventId: z.string().uuid(),
  claimId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  exactText: z.string(),
  supportingClaimIds: z.array(z.string().uuid()).max(128),
  contradictingClaimIds: z.array(z.string().uuid()).max(128),
  observedAt: z.string().datetime({ offset: true }).nullable(),
  validAt: z.string().datetime({ offset: true }).nullable(),
  eventAt: z.string().datetime({ offset: true }).nullable(),
  temporalStatus: z.enum(['DATED', 'UNDATED']),
  previousEventIds: z.array(z.string().uuid()),
  nextEventIds: z.array(z.string().uuid()),
}).strict();

const outputSchema = z.discriminatedUnion('status', [
  z.object({
    schema: z.literal('atlas.evidence-timeline-proposal.v1'),
    status: z.literal('PROPOSED'),
    canonicalAuthority: z.literal(false),
    orderSemantics: z.literal('DISPLAY_ORDER_ONLY_NOT_CAUSAL'),
    events: z.array(eventSchema).min(1).max(16),
  }).strict(),
  z.object({
    schema: z.literal('atlas.evidence-timeline-proposal.v1'),
    status: z.literal('EMPTY'),
    reason: z.literal('NO_SOURCE_GROUNDED_EVENTS'),
    canonicalAuthority: z.literal(false),
    orderSemantics: z.literal('DISPLAY_ORDER_ONLY_NOT_CAUSAL'),
    events: z.array(eventSchema).length(0),
  }).strict(),
  z.object({
    schema: z.literal('atlas.evidence-timeline-proposal.v1'),
    status: z.literal('BLOCKED'),
    reason: z.literal('INVALID_INPUT'),
    canonicalAuthority: z.literal(false),
    orderSemantics: z.literal('DISPLAY_ORDER_ONLY_NOT_CAUSAL'),
    events: z.array(eventSchema).length(0),
  }).strict(),
]);

export type EvidenceTimelineProposalV1 = z.infer<typeof outputSchema>;

export function proposeEvidenceTimelineV1(input: unknown): EvidenceTimelineProposalV1 {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return blockedTimeline();
  if (parsed.data.claims.length === 0) return emptyTimeline();

  const events = parsed.data.claims.map((claim) => {
    const eventAt = claim.validAt ?? claim.observedAt;
    return {
      eventId: uuidv5(`${claim.claimId}\u0000${claim.sourceRevision}\u0000${eventAt ?? 'undated'}`, EVENT_NAMESPACE),
      claimId: claim.claimId,
      sourceId: claim.sourceId,
      sourceRevision: claim.sourceRevision,
      exactText: claim.span.exactText,
      supportingClaimIds: claim.supportingClaimIds,
      contradictingClaimIds: claim.contradictingClaimIds,
      observedAt: claim.observedAt,
      validAt: claim.validAt,
      eventAt,
      temporalStatus: eventAt ? 'DATED' as const : 'UNDATED' as const,
      previousEventIds: [] as string[],
      nextEventIds: [] as string[],
    };
  }).sort((left, right) => {
    if (left.eventAt === null) return right.eventAt === null ? left.eventId.localeCompare(right.eventId) : 1;
    if (right.eventAt === null) return -1;
    return left.eventAt.localeCompare(right.eventAt) || left.eventId.localeCompare(right.eventId);
  });

  const dated = events.filter((event) => event.eventAt !== null);
  const timestampGroups = new Map<string, string[]>();
  for (const event of dated) {
    const ids = timestampGroups.get(event.eventAt!) ?? [];
    ids.push(event.eventId);
    timestampGroups.set(event.eventAt!, ids);
  }
  const timestamps = [...timestampGroups.keys()].sort();
  for (const event of dated) {
    const groupIndex = timestamps.indexOf(event.eventAt!);
    event.previousEventIds = groupIndex > 0 ? [...timestampGroups.get(timestamps[groupIndex - 1]!)!] : [];
    event.nextEventIds = groupIndex < timestamps.length - 1
      ? [...timestampGroups.get(timestamps[groupIndex + 1]!)!]
      : [];
  }

  return outputSchema.parse({
    schema: 'atlas.evidence-timeline-proposal.v1',
    status: 'PROPOSED',
    canonicalAuthority: false,
    orderSemantics: 'DISPLAY_ORDER_ONLY_NOT_CAUSAL',
    events,
  });
}

function emptyTimeline(): EvidenceTimelineProposalV1 {
  return outputSchema.parse({
    schema: 'atlas.evidence-timeline-proposal.v1',
    status: 'EMPTY',
    reason: 'NO_SOURCE_GROUNDED_EVENTS',
    canonicalAuthority: false,
    orderSemantics: 'DISPLAY_ORDER_ONLY_NOT_CAUSAL',
    events: [],
  });
}

function blockedTimeline(): EvidenceTimelineProposalV1 {
  return outputSchema.parse({
    schema: 'atlas.evidence-timeline-proposal.v1',
    status: 'BLOCKED',
    reason: 'INVALID_INPUT',
    canonicalAuthority: false,
    orderSemantics: 'DISPLAY_ORDER_ONLY_NOT_CAUSAL',
    events: [],
  });
}
