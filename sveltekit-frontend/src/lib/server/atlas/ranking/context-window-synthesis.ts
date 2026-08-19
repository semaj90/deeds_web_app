import { createHash } from 'node:crypto';
import { z } from 'zod';
import { aceCodeKey, bifrostKey } from '$lib/server/cache-keys.js';

export const ContextWindowCandidateV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive(),
  score: z.number().finite().min(0).max(1),
  exactEvidence: z.boolean(),
  cacheHotness: z.number().finite().min(0).max(1),
  graphAuthority: z.number().finite().min(0).max(1),
  communityId: z.string().min(1).nullable(),
  contentRef: z.string().min(1),
}).strict();
export type ContextWindowCandidateV1 = z.infer<typeof ContextWindowCandidateV1Schema>;

export const ContextWindowBudgetV1Schema = z.object({
  totalTokens: z.number().int().positive(),
  reservedPromptTokens: z.number().int().nonnegative(),
  reservedToolTokens: z.number().int().nonnegative(),
  reservedOutputTokens: z.number().int().nonnegative(),
  maxWindows: z.number().int().positive().max(1024),
  maxWindowTokens: z.number().int().positive(),
  overlapTokens: z.number().int().nonnegative(),
  minExactEvidenceTokens: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  const reserved = value.reservedPromptTokens + value.reservedToolTokens + value.reservedOutputTokens;
  if (reserved >= value.totalTokens) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalTokens'], message: 'reserved tokens must leave positive retrieval capacity' });
  }
  if (value.overlapTokens >= value.maxWindowTokens) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['overlapTokens'], message: 'overlapTokens must be < maxWindowTokens' });
  }
});
export type ContextWindowBudgetV1 = z.infer<typeof ContextWindowBudgetV1Schema>;

export const ContextWindowInputV1Schema = z.object({
  schema: z.literal('atlas.context-window-input.v1'),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  topoClass: z.number().int().nonnegative(),
  clusterId: z.number().int().nonnegative().nullable(),
  resolvedDir: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  candidates: z.array(ContextWindowCandidateV1Schema).min(1),
  budget: ContextWindowBudgetV1Schema,
  producerRevision: z.string().min(1),
}).strict();
export type ContextWindowInputV1 = z.infer<typeof ContextWindowInputV1Schema>;

export const ContextWindowMemberV1Schema = ContextWindowCandidateV1Schema.extend({
  marginalUtility: z.number().finite().min(0).max(1),
  contextWindowUtility: z.number().finite().min(0).max(1),
}).strict();
export type ContextWindowMemberV1 = z.infer<typeof ContextWindowMemberV1Schema>;

export const ContextWindowV1Schema = z.object({
  windowId: z.string().min(1),
  sourceRef: z.string().min(1),
  startOrdinal: z.number().int().nonnegative(),
  endOrdinal: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive(),
  utility: z.number().finite().min(0).max(1),
  exactEvidenceTokens: z.number().int().nonnegative(),
  members: z.array(ContextWindowMemberV1Schema).min(1),
}).strict();
export type ContextWindowV1 = z.infer<typeof ContextWindowV1Schema>;

export const ContextCacheProposalV1Schema = z.object({
  key: z.string().min(1),
  owner: z.enum(['ACE', 'BIFROST']),
  action: z.enum(['READ', 'WARM']),
  trigger: z.boolean(),
  ttlClass: z.enum(['SESSION_QUERY', 'SOURCE_FEATURE']),
  sideEffectsAuthorized: z.literal(false),
  reasonCodes: z.array(z.string().min(1)).min(1),
}).strict();
export type ContextCacheProposalV1 = z.infer<typeof ContextCacheProposalV1Schema>;

export const ContextWindowPlanV1Schema = z.object({
  schema: z.literal('atlas.context-window-plan.v1'),
  requestId: z.string().min(1),
  queryHash: z.string().regex(/^[a-f0-9]{16}$/),
  availableTokens: z.number().int().positive(),
  selectedTokens: z.number().int().nonnegative(),
  unusedTokens: z.number().int().nonnegative(),
  windows: z.array(ContextWindowV1Schema),
  selectedPacketKeys: z.array(z.string().min(1)),
  droppedPacketKeys: z.array(z.string().min(1)),
  cacheProposals: z.array(ContextCacheProposalV1Schema),
  exactEvidenceFloorSatisfied: z.boolean(),
  deterministic: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ContextWindowPlanV1 = z.infer<typeof ContextWindowPlanV1Schema>;

function hash16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function utility(candidate: ContextWindowCandidateV1, selectedCommunities: Set<string>): number {
  const exact = candidate.exactEvidence ? 1 : 0;
  const novelty = candidate.communityId && selectedCommunities.has(candidate.communityId) ? 0.25 : 1;
  return clamp01(
    (candidate.score * 0.48)
    + (candidate.graphAuthority * 0.16)
    + (candidate.cacheHotness * 0.08)
    + (exact * 0.20)
    + (novelty * 0.08),
  );
}

function buildSourceWindows(
  candidates: readonly ContextWindowCandidateV1[],
  budget: ContextWindowBudgetV1,
): ContextWindowV1[] {
  const bySource = new Map<string, ContextWindowCandidateV1[]>();
  for (const candidate of candidates) {
    const bucket = bySource.get(candidate.sourceRef) ?? [];
    bucket.push(candidate);
    bySource.set(candidate.sourceRef, bucket);
  }

  const windows: ContextWindowV1[] = [];
  for (const [sourceRef, rows] of [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => a.ordinal - b.ordinal || a.packetKey.localeCompare(b.packetKey));
    let start = 0;
    while (start < rows.length) {
      let tokens = 0;
      let end = start;
      const members: ContextWindowMemberV1[] = [];
      const communities = new Set<string>();
      while (end < rows.length) {
        const row = rows[end];
        if (members.length && tokens + row.tokenCount > budget.maxWindowTokens) break;
        const marginalUtility = utility(row, communities);
        members.push(ContextWindowMemberV1Schema.parse({ ...row, marginalUtility, contextWindowUtility: marginalUtility }));
        tokens += row.tokenCount;
        if (row.communityId) communities.add(row.communityId);
        end += 1;
      }
      if (!members.length) {
        const row = rows[start];
        members.push(ContextWindowMemberV1Schema.parse({ ...row, marginalUtility: utility(row, communities), contextWindowUtility: utility(row, communities) }));
        tokens = row.tokenCount;
        end = start + 1;
      }
      const exactEvidenceTokens = members.reduce((sum, row) => sum + (row.exactEvidence ? row.tokenCount : 0), 0);
      const weightedUtility = members.reduce((sum, row) => sum + row.contextWindowUtility * row.tokenCount, 0) / tokens;
      windows.push(ContextWindowV1Schema.parse({
        windowId: `ctx:${hash16(`${sourceRef}\0${members[0].ordinal}\0${members[members.length - 1].ordinal}`)}`,
        sourceRef,
        startOrdinal: members[0].ordinal,
        endOrdinal: members[members.length - 1].ordinal,
        tokenCount: tokens,
        utility: weightedUtility,
        exactEvidenceTokens,
        members,
      }));

      if (end >= rows.length) break;
      let overlap = 0;
      let nextStart = end;
      while (nextStart > start && overlap < budget.overlapTokens) {
        nextStart -= 1;
        overlap += rows[nextStart].tokenCount;
      }
      start = Math.max(start + 1, nextStart);
    }
  }
  return windows;
}

export function buildTokenAwareContextPlan(value: ContextWindowInputV1): ContextWindowPlanV1 {
  const input = ContextWindowInputV1Schema.parse(value);
  const availableTokens = input.budget.totalTokens
    - input.budget.reservedPromptTokens
    - input.budget.reservedToolTokens
    - input.budget.reservedOutputTokens;

  const windows = buildSourceWindows(input.candidates, input.budget)
    .sort((a, b) => {
      const aDensity = a.utility / Math.max(1, a.tokenCount);
      const bDensity = b.utility / Math.max(1, b.tokenCount);
      return bDensity - aDensity || b.exactEvidenceTokens - a.exactEvidenceTokens || b.utility - a.utility || a.windowId.localeCompare(b.windowId);
    });

  const chosen: ContextWindowV1[] = [];
  const selectedPackets = new Set<string>();
  let selectedTokens = 0;
  let exactEvidenceTokens = 0;

  // Pass 1: protect exact evidence when the caller reserves an evidence floor.
  for (const window of windows.filter((row) => row.exactEvidenceTokens > 0)) {
    if (chosen.length >= input.budget.maxWindows) break;
    if (exactEvidenceTokens >= input.budget.minExactEvidenceTokens) break;
    if (selectedTokens + window.tokenCount > availableTokens) continue;
    if (window.members.some((member) => selectedPackets.has(member.packetKey))) continue;
    chosen.push(window);
    selectedTokens += window.tokenCount;
    exactEvidenceTokens += window.exactEvidenceTokens;
    for (const member of window.members) selectedPackets.add(member.packetKey);
  }

  // Pass 2: fill remaining capacity by deterministic utility-per-token ordering.
  for (const window of windows) {
    if (chosen.some((row) => row.windowId === window.windowId)) continue;
    if (chosen.length >= input.budget.maxWindows) break;
    if (selectedTokens + window.tokenCount > availableTokens) continue;
    const newMembers = window.members.filter((member) => !selectedPackets.has(member.packetKey));
    if (newMembers.length !== window.members.length) continue;
    chosen.push(window);
    selectedTokens += window.tokenCount;
    exactEvidenceTokens += window.exactEvidenceTokens;
    for (const member of window.members) selectedPackets.add(member.packetKey);
  }

  chosen.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.startOrdinal - b.startOrdinal || a.windowId.localeCompare(b.windowId));
  const selectedPacketKeys = [...selectedPackets].sort((a, b) => a.localeCompare(b));
  const droppedPacketKeys = input.candidates.map((row) => row.packetKey).filter((key) => !selectedPackets.has(key)).sort((a, b) => a.localeCompare(b));
  const sourceRefs = [...new Set(chosen.map((row) => row.sourceRef))].sort((a, b) => a.localeCompare(b));

  const cacheProposals: ContextCacheProposalV1[] = [
    ContextCacheProposalV1Schema.parse({
      key: aceCodeKey.forQuery(input.queryText, input.topoClass, input.resolvedDir ?? undefined),
      owner: 'ACE',
      action: 'READ',
      trigger: true,
      ttlClass: 'SESSION_QUERY',
      sideEffectsAuthorized: false,
      reasonCodes: ['REUSE_QUERY_TOPOLOGY_CONTEXT_WHEN_PRESENT'],
    }),
    ContextCacheProposalV1Schema.parse({
      key: bifrostKey.query(input.queryText),
      owner: 'BIFROST',
      action: 'WARM',
      trigger: selectedPacketKeys.length > 0,
      ttlClass: 'SESSION_QUERY',
      sideEffectsAuthorized: false,
      reasonCodes: ['CACHE_SUCCESSFUL_CONTEXT_MANIFEST_AFTER_VALIDATION'],
    }),
    ...sourceRefs.map((sourceRef) => ContextCacheProposalV1Schema.parse({
      key: bifrostKey.source(sourceRef),
      owner: 'BIFROST',
      action: 'WARM',
      trigger: true,
      ttlClass: 'SOURCE_FEATURE',
      sideEffectsAuthorized: false,
      reasonCodes: ['WARM_SELECTED_SOURCE_NEIGHBORHOOD_AFTER_VALIDATION'],
    })),
  ];

  return ContextWindowPlanV1Schema.parse({
    schema: 'atlas.context-window-plan.v1',
    requestId: input.requestId,
    queryHash: hash16(input.queryText),
    availableTokens,
    selectedTokens,
    unusedTokens: availableTokens - selectedTokens,
    windows: chosen,
    selectedPacketKeys,
    droppedPacketKeys,
    cacheProposals,
    exactEvidenceFloorSatisfied: exactEvidenceTokens >= input.budget.minExactEvidenceTokens,
    deterministic: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
