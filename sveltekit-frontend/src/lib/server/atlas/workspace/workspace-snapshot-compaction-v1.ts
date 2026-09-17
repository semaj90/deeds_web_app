import { z } from 'zod';
import {
  appendWorkspaceEventV1,
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const WORKSPACE_COMPACTION_PLAN_SCHEMA = 'atlas.workspace-snapshot-compaction-plan.v1' as const;

const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const WorkspaceCompactionPolicyV1Schema = z
  .object({
    maxEventsSinceSnapshot: z.number().int().positive(),
    maxChangedSources: z.number().int().positive(),
    force: z.boolean().default(false),
  })
  .strict();
export type WorkspaceCompactionPolicyV1 = z.infer<typeof WorkspaceCompactionPolicyV1Schema>;

export const WorkspaceCompactionStatusV1Schema = z.enum([
  'NO_EVENTS',
  'NOT_DUE',
  'READY_FOR_EXPLICIT_COMPACTION',
  'EVENT_GAP',
  'REPLAY_MISMATCH',
]);
export type WorkspaceCompactionStatusV1 = z.infer<typeof WorkspaceCompactionStatusV1Schema>;

export const WorkspaceCompactionPlanV1Schema = z
  .object({
    schema: z.literal(WORKSPACE_COMPACTION_PLAN_SCHEMA),
    workspaceId: z.string().min(1),
    baseSnapshotRevision: z.string().min(1),
    currentHeadRevision: z.string().min(1),
    replayedHeadRevision: z.string().min(1).nullable(),
    lastEventSequence: z.string().regex(/^\d+$/),
    eventCountSinceSnapshot: z.number().int().nonnegative(),
    changedSourceCount: z.number().int().nonnegative(),
    eventStreamChecksum: checksum.nullable(),
    status: WorkspaceCompactionStatusV1Schema,
    due: z.boolean(),
    candidateSnapshotRevision: z.null(),
    canonicalAuthority: z.literal(false),
    promotionEligible: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type WorkspaceCompactionPlanV1 = z.infer<typeof WorkspaceCompactionPlanV1Schema>;

export const WorkspaceCompactionCutV1Schema = z.object({
  eventSequence: z.string().regex(/^\d+$/),
  eventId: z.string().uuid(),
  eventChecksum: checksum,
  workspaceHeadRevision: z.string().min(1),
}).strict();
export type WorkspaceCompactionCutV1 = z.infer<typeof WorkspaceCompactionCutV1Schema>;

export const WorkspaceHeadCompactionPlanV1Schema = z.object({
  schema: z.literal('atlas.workspace-head-compaction-plan.v1'),
  workspaceId: z.string().min(1),
  baseSnapshotRevision: z.string().min(1),
  cut: WorkspaceCompactionCutV1Schema.nullable(),
  eventRange: z.object({
    firstSequence: z.string().regex(/^\d+$/),
    lastSequence: z.string().regex(/^\d+$/),
    eventCount: z.number().int().nonnegative(),
    eventChainChecksum: checksum.nullable(),
  }).strict(),
  candidate: z.object({
    headStateRootChecksum: checksum.nullable(),
    candidateSnapshotRevision: checksum.nullable(),
  }).strict(),
  validation: z.object({
    sequenceContinuous: z.boolean(),
    predecessorChainValid: z.boolean(),
    replayDeterministic: z.boolean(),
    laterEventsIgnored: z.boolean(),
  }).strict(),
  status: z.enum(['NO_EVENTS', 'READY_FOR_EXPLICIT_COMPACTION', 'EVENT_GAP', 'REPLAY_MISMATCH', 'CUT_NOT_REACHABLE']),
  canonicalAuthority: z.literal(false),
  promotionEligible: z.literal(false),
  writesPerformed: z.literal(false),
  planChecksum: checksum,
}).strict();
export type WorkspaceHeadCompactionPlanV1 = z.infer<typeof WorkspaceHeadCompactionPlanV1Schema>;

function eventStreamChecksum(events: readonly WorkspaceEventV1[]): string | null {
  if (events.length === 0) return null;
  // The event checksums are already canonical event identities. This plan
  // reports their ordered stream without becoming a second hashing owner.
  return `sha256:${canonicalSha256V1({
    schema: 'atlas.workspace-event-stream.v1',
    events: events.map((event) => ({ sequence: event.sequence.toString(), eventChecksum: event.eventChecksum })),
  })}`;
}

function compactionPlanChecksum(input: Omit<WorkspaceHeadCompactionPlanV1, 'planChecksum'>): string {
  return `sha256:${canonicalSha256V1({ schema: 'atlas.workspace-head-compaction-plan-identity.v1', ...input })}`;
}

/**
 * Plan compaction through a high-water mark. Events after the cut are
 * intentionally ignored; the planner never reads the worktree or mutates the
 * event stream/head. A later head may continue advancing independently.
 */
export function planWorkspaceHeadCompactionV1(input: {
  baseHead: WorkspaceHeadV1;
  currentHead: WorkspaceHeadV1;
  events: readonly WorkspaceEventV1[];
  cutSequence: bigint;
}): WorkspaceHeadCompactionPlanV1 {
  const baseHead = WorkspaceHeadV1Schema.parse(input.baseHead);
  const currentHead = WorkspaceHeadV1Schema.parse(input.currentHead);
  const allEvents = input.events.map((event) => WorkspaceEventV1Schema.parse(event));
  if (input.cutSequence < baseHead.lastEventSequence || input.cutSequence > currentHead.lastEventSequence) {
    const empty = {
      schema: 'atlas.workspace-head-compaction-plan.v1' as const,
      workspaceId: currentHead.workspaceId,
      baseSnapshotRevision: currentHead.baseSnapshotRevision,
      cut: null,
      eventRange: { firstSequence: '0', lastSequence: '0', eventCount: 0, eventChainChecksum: null },
      candidate: { headStateRootChecksum: null, candidateSnapshotRevision: null },
      validation: { sequenceContinuous: false, predecessorChainValid: false, replayDeterministic: false, laterEventsIgnored: false },
      status: 'CUT_NOT_REACHABLE' as const,
      canonicalAuthority: false as const,
      promotionEligible: false as const,
      writesPerformed: false as const,
    };
    return WorkspaceHeadCompactionPlanV1Schema.parse({ ...empty, planChecksum: compactionPlanChecksum(empty) });
  }
  const prefix = allEvents.filter((event) => event.sequence <= input.cutSequence).sort((a, b) => Number(a.sequence - b.sequence));
  const laterEventsIgnored = allEvents.some((event) => event.sequence > input.cutSequence);
  let replayed = baseHead;
  let sequenceContinuous = true;
  let predecessorChainValid = true;
  for (const event of prefix) {
    if (event.workspaceId !== baseHead.workspaceId || event.sequence !== replayed.lastEventSequence + 1n) {
      sequenceContinuous = false;
      break;
    }
    if (event.previousHeadRevision !== replayed.workspaceHeadRevision) {
      predecessorChainValid = false;
      break;
    }
    try {
      replayed = appendWorkspaceEventV1(replayed, event);
    } catch {
      predecessorChainValid = false;
      break;
    }
  }
  const cutEvent = prefix[prefix.length - 1] ?? null;
  const valid = prefix.length > 0 && sequenceContinuous && predecessorChainValid
    && replayed.lastEventSequence === input.cutSequence
    && cutEvent?.eventChecksum === replayed.lastEventChecksum;
  const eventChainChecksum = valid ? eventStreamChecksum(prefix) : null;
  const headStateRootChecksum = valid ? replayed.deltaRootChecksum : null;
  const candidateSnapshotRevision = valid
    ? `sha256:${canonicalSha256V1({ schema: 'atlas.workspace-snapshot-candidate.v1', workspaceId: baseHead.workspaceId, baseSnapshotRevision: baseHead.baseSnapshotRevision, cutSequence: input.cutSequence.toString(), cutEventChecksum: cutEvent!.eventChecksum, headStateRootChecksum })}`
    : null;
  const cut = valid ? {
    eventSequence: input.cutSequence.toString(),
    eventId: cutEvent!.eventId,
    eventChecksum: cutEvent!.eventChecksum,
    workspaceHeadRevision: replayed.workspaceHeadRevision,
  } : null;
  const body = {
    schema: 'atlas.workspace-head-compaction-plan.v1' as const,
    workspaceId: baseHead.workspaceId,
    baseSnapshotRevision: baseHead.baseSnapshotRevision,
    cut,
    eventRange: {
      firstSequence: prefix[0]?.sequence.toString() ?? '0',
      lastSequence: prefix.at(-1)?.sequence.toString() ?? '0',
      eventCount: prefix.length,
      eventChainChecksum,
    },
    candidate: { headStateRootChecksum, candidateSnapshotRevision },
    validation: { sequenceContinuous, predecessorChainValid, replayDeterministic: valid, laterEventsIgnored },
    status: valid ? 'READY_FOR_EXPLICIT_COMPACTION' as const : (prefix.length === 0 ? 'NO_EVENTS' as const : 'REPLAY_MISMATCH' as const),
    canonicalAuthority: false as const,
    promotionEligible: false as const,
    writesPerformed: false as const,
  };
  return WorkspaceHeadCompactionPlanV1Schema.parse({ ...body, planChecksum: compactionPlanChecksum(body) });
}

/**
 * Read-only compaction eligibility. It never creates a snapshot, advances a
 * head, persists an event, or claims promotion authority.
 */
export function assessWorkspaceCompactionV1(input: {
  baseHead: WorkspaceHeadV1;
  currentHead: WorkspaceHeadV1;
  events: readonly WorkspaceEventV1[];
  policy: WorkspaceCompactionPolicyV1;
}): WorkspaceCompactionPlanV1 {
  const baseHead = WorkspaceHeadV1Schema.parse(input.baseHead);
  const currentHead = WorkspaceHeadV1Schema.parse(input.currentHead);
  const events = input.events.map((event) => WorkspaceEventV1Schema.parse(event));
  const policy = WorkspaceCompactionPolicyV1Schema.parse(input.policy);

  let replayed: WorkspaceHeadV1 = baseHead;
  let status: WorkspaceCompactionStatusV1 = 'NOT_DUE';
  for (const event of events) {
    if (event.workspaceId !== baseHead.workspaceId || event.sequence !== replayed.lastEventSequence + 1n) {
      status = 'EVENT_GAP';
      replayed = baseHead;
      break;
    }
    try {
      replayed = appendWorkspaceEventV1(replayed, event);
    } catch {
      status = 'REPLAY_MISMATCH';
      replayed = baseHead;
      break;
    }
  }

  const replayMatches =
    status !== 'EVENT_GAP' &&
    status !== 'REPLAY_MISMATCH' &&
    replayed.workspaceHeadRevision === currentHead.workspaceHeadRevision &&
    replayed.lastEventSequence === currentHead.lastEventSequence &&
    replayed.lastEventChecksum === currentHead.lastEventChecksum;
  if (!replayMatches && status === 'NOT_DUE') status = 'REPLAY_MISMATCH';

  const eventCount = currentHead.eventCountSinceSnapshot;
  const changedSourceCount = currentHead.changedSourceCount;
  const due =
    replayMatches &&
    (policy.force ||
      eventCount >= policy.maxEventsSinceSnapshot ||
      changedSourceCount >= policy.maxChangedSources);
  if (replayMatches && eventCount === 0) status = 'NO_EVENTS';
  else if (replayMatches && due) status = 'READY_FOR_EXPLICIT_COMPACTION';
  else if (replayMatches) status = 'NOT_DUE';

  return WorkspaceCompactionPlanV1Schema.parse({
    schema: WORKSPACE_COMPACTION_PLAN_SCHEMA,
    workspaceId: currentHead.workspaceId,
    baseSnapshotRevision: currentHead.baseSnapshotRevision,
    currentHeadRevision: currentHead.workspaceHeadRevision,
    replayedHeadRevision: replayMatches ? replayed.workspaceHeadRevision : null,
    lastEventSequence: currentHead.lastEventSequence.toString(),
    eventCountSinceSnapshot: eventCount,
    changedSourceCount,
    eventStreamChecksum: replayMatches ? eventStreamChecksum(events) : null,
    status,
    due,
    candidateSnapshotRevision: null,
    canonicalAuthority: false,
    promotionEligible: false,
    writesPerformed: false,
  });
}
