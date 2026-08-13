import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PolicyDecisionReceiptPayloadV1 } from '$lib/server/queue/event-fabric.js';
import type { ClusterAcePacket } from './cluster-ace-packet.js';

const DEFAULT_POLICY_VERSION = 'ace.cluster-packet.consumer.v1';
const DEFAULT_SELECTION_THRESHOLD = 0.62;
const DEFAULT_PROMOTION_THRESHOLD = 0.8;
const DEFAULT_HALFLIFE_MS = 7 * 24 * 60 * 60 * 1000;

export const clusterPacketRuntimeSignalsSchema = z.object({
  now: z.date().optional(),
  cacheHot: z.boolean().optional(),
  retrievalFrequency: z.number().finite().nonnegative().optional(),
  executionSuccessRate: z.number().finite().min(0).max(1).optional(),
});

export const clusterPacketPolicySchema = z.object({
  version: z.string().min(1).default(DEFAULT_POLICY_VERSION),
  selectionThreshold: z.number().finite().min(0).max(1).default(DEFAULT_SELECTION_THRESHOLD),
  promotionThreshold: z.number().finite().min(0).max(1).default(DEFAULT_PROMOTION_THRESHOLD),
  halfLifeMs: z.number().finite().positive().optional(),
  weights: z.object({
    authority: z.number().finite().min(0).max(1).default(0.35),
    recency: z.number().finite().min(0).max(1).default(0.2),
    retrievalFrequency: z.number().finite().min(0).max(1).default(0.15),
    executionSuccessRate: z.number().finite().min(0).max(1).default(0.15),
    cacheHot: z.number().finite().min(0).max(1).default(0.05),
    topFileCount: z.number().finite().min(0).max(1).default(0.05),
    summaryRichness: z.number().finite().min(0).max(1).default(0.05),
  }).default({}),
});

export type ClusterPacketRuntimeSignals = z.infer<typeof clusterPacketRuntimeSignalsSchema>;
export type ClusterPacketPolicy = z.infer<typeof clusterPacketPolicySchema>;

export interface ClusterPacketConsumerFeatures {
  packetKey: string;
  representationId: string;
  clusterId: number;
  authorityScore?: number;
  topFileCount: number;
  summaryChars: number;
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision?: string;
  ageMs?: number;
  cacheHot?: boolean;
  retrievalFrequency?: number;
  executionSuccessRate?: number;
}

export interface ClusterPacketPolicyDecision {
  packetKey: string;
  selected: boolean;
  promote: boolean;
  score: number;
  reasons: string[];
  policyVersion: string;
}

export interface ClusterPacketDecisionReceipt {
  decisionId: string;
  packetKey: string;
  representationId: string;
  requestId: string;
  selected: boolean;
  promoted: boolean;
  score: number;
  policyVersion: string;
  featureSnapshot: ClusterPacketConsumerFeatures;
  resultingStateHash: string;
  createdAt: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function parseAuthorityScore(packet: ClusterAcePacket): number | undefined {
  const summaryRecord = (packet.payload as Record<string, unknown> | undefined)?.summaryRecord as Record<string, unknown> | undefined;
  const authority = (summaryRecord?.authority ?? null) as Record<string, unknown> | null;
  if (!authority) return undefined;
  const raw = Number(
    authority.clusterAuthorityScore ??
    authority.cluster_authority_score ??
    authority.score ??
    0
  );
  return Number.isFinite(raw) ? clamp01(raw) : undefined;
}

function parseTopFiles(packet: ClusterAcePacket): string[] {
  const summaryRecord = (packet.payload as Record<string, unknown> | undefined)?.summaryRecord as Record<string, unknown> | undefined;
  const payloadFiles = Array.isArray(summaryRecord?.filePaths) ? summaryRecord.filePaths : [];
  const topologyFiles = Array.isArray((packet.topology as Record<string, unknown> | undefined)?.filePaths)
    ? (packet.topology as Record<string, unknown>).filePaths
    : [];
  const files = payloadFiles.length > 0 ? payloadFiles : topologyFiles;
  return [...new Set(files.map((entry) => String(entry ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseAgeMs(packet: ClusterAcePacket, now: Date): number | undefined {
  const createdAt = new Date(packet.created_at);
  if (Number.isNaN(createdAt.getTime())) return undefined;
  return Math.max(0, now.getTime() - createdAt.getTime());
}

function recencyScore(ageMs: number | undefined, halfLifeMs: number): number {
  if (ageMs == null) return 0.5;
  const normalizedHalfLife = Math.max(1, halfLifeMs);
  return clamp01(Math.exp(-ageMs / normalizedHalfLife));
}

function retrievalScore(retrievalFrequency?: number): number {
  if (retrievalFrequency == null || retrievalFrequency <= 0) return 0;
  return clamp01(Math.log1p(retrievalFrequency) / Math.log1p(20));
}

function topFileScore(topFileCount: number): number {
  return clamp01(topFileCount / 12);
}

function summaryRichness(summaryChars: number): number {
  return clamp01(summaryChars / 1200);
}

export function deriveClusterPacketConsumerFeatures(
  packet: ClusterAcePacket,
  runtime: ClusterPacketRuntimeSignals = {}
): ClusterPacketConsumerFeatures {
  const parsedRuntime = clusterPacketRuntimeSignalsSchema.parse(runtime);
  const now = parsedRuntime.now ?? new Date();
  const topFiles = parseTopFiles(packet);
  return {
    packetKey: packet.packet_key,
    representationId: packet.representation_id,
    clusterId: packet.cluster_id,
    authorityScore: parseAuthorityScore(packet),
    topFileCount: topFiles.length,
    summaryChars: packet.summary.trim().length,
    workspaceRevision: packet.workspace_revision,
    sourceRevision: packet.source_revision,
    graphRevision: packet.graph_revision ?? undefined,
    ageMs: parseAgeMs(packet, now),
    cacheHot: parsedRuntime.cacheHot,
    retrievalFrequency: parsedRuntime.retrievalFrequency,
    executionSuccessRate: parsedRuntime.executionSuccessRate,
  };
}

export function scoreClusterPacketConsumer(
  features: ClusterPacketConsumerFeatures,
  policy: ClusterPacketPolicy = clusterPacketPolicySchema.parse({})
): number {
  const parsedPolicy = clusterPacketPolicySchema.parse(policy);
  const w = parsedPolicy.weights;
  const authority = clamp01(features.authorityScore ?? 0.5);
  const recency = recencyScore(features.ageMs, parsedPolicy.halfLifeMs ?? DEFAULT_HALFLIFE_MS);
  const retrieval = retrievalScore(features.retrievalFrequency);
  const execution = clamp01(features.executionSuccessRate ?? 0.5);
  const cacheHot = features.cacheHot ? 1 : 0;
  const topFiles = topFileScore(features.topFileCount);
  const summary = summaryRichness(features.summaryChars);

  const score =
    authority * w.authority +
    recency * w.recency +
    retrieval * w.retrievalFrequency +
    execution * w.executionSuccessRate +
    cacheHot * w.cacheHot +
    topFiles * w.topFileCount +
    summary * w.summaryRichness;

  return Number(clamp01(score).toFixed(6));
}

export function decideClusterPacketConsumer(
  packet: ClusterAcePacket,
  opts: {
    requestId: string;
    runtime?: ClusterPacketRuntimeSignals;
    policy?: Partial<ClusterPacketPolicy>;
  }
): {
  features: ClusterPacketConsumerFeatures;
  decision: ClusterPacketPolicyDecision;
  receipt: ClusterPacketDecisionReceipt;
} {
  const policy = clusterPacketPolicySchema.parse(opts.policy ?? {});
  const features = deriveClusterPacketConsumerFeatures(packet, opts.runtime);
  const score = scoreClusterPacketConsumer(features, policy);
  const selected = score >= policy.selectionThreshold;
  const promote = selected && score >= policy.promotionThreshold;
  const reasons = [
    `authority:${(features.authorityScore ?? 0.5).toFixed(3)}`,
    `recency:${recencyScore(features.ageMs, policy.halfLifeMs ?? DEFAULT_HALFLIFE_MS).toFixed(3)}`,
    `retrieval:${retrievalScore(features.retrievalFrequency).toFixed(3)}`,
    `execution:${clamp01(features.executionSuccessRate ?? 0.5).toFixed(3)}`,
    `cacheHot:${features.cacheHot ? '1' : '0'}`,
    `topFiles:${features.topFileCount}`,
    `summaryChars:${features.summaryChars}`,
  ];

  const decision: ClusterPacketPolicyDecision = {
    packetKey: features.packetKey,
    selected,
    promote,
    score,
    reasons,
    policyVersion: policy.version,
  };

  const featureSnapshot = {
    ...features,
    score,
    selected,
    promote,
    policyVersion: policy.version,
  };

  const receipt: ClusterPacketDecisionReceipt = {
    decisionId: `sha256:${sha256(stableStringify({
      requestId: opts.requestId,
      packetKey: features.packetKey,
      representationId: features.representationId,
      policyVersion: policy.version,
      selected,
      promote,
      score,
      featureSnapshot,
    })).slice(0, 24)}`,
    packetKey: features.packetKey,
    representationId: features.representationId,
    requestId: opts.requestId,
    selected,
    promoted: promote,
    score,
    policyVersion: policy.version,
    featureSnapshot,
    resultingStateHash: `sha256:${sha256(stableStringify({
      packetKey: features.packetKey,
      representationId: features.representationId,
      selected,
      promote,
      score,
      policyVersion: policy.version,
      featureSnapshot,
    })).slice(0, 24)}`,
    createdAt: (opts.runtime?.now ?? new Date()).toISOString(),
  };

  return { features, decision, receipt };
}

export function toPolicyDecisionReceiptPayload(
  receipt: ClusterPacketDecisionReceipt,
  extra: {
    decidedBy?: string;
    recommendationEventId?: string;
    sourceEvidenceRefs?: string[];
  } = {}
): PolicyDecisionReceiptPayloadV1 {
  return {
    decisionId: receipt.decisionId,
    recommendationEventId: extra.recommendationEventId,
    decision: receipt.promoted ? 'applied' : receipt.selected ? 'accepted' : 'rejected',
    decidedBy: extra.decidedBy ?? 'cluster-packet-consumer',
    decisionReason: [
      `packetKey=${receipt.packetKey}`,
      `score=${receipt.score.toFixed(6)}`,
      `policyVersion=${receipt.policyVersion}`,
    ].join(' | '),
    policyRevision: receipt.policyVersion,
    resultingStateHash: receipt.resultingStateHash,
    sourceEvidenceRefs: extra.sourceEvidenceRefs ?? [receipt.packetKey],
    metadata: {
      requestId: receipt.requestId,
      representationId: receipt.representationId,
      selected: receipt.selected,
      promoted: receipt.promoted,
      score: receipt.score,
      featureSnapshot: receipt.featureSnapshot,
    },
  };
}
