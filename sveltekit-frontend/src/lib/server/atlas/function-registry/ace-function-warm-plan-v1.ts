import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  verifyFunctionRegistrySnapshotV1,
  type FunctionRegistrySnapshotV1,
} from './function-registry-snapshot-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);

const candidateSchema = z.object({
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceContentHash: sha256,
  registrySnapshotChecksum: sha256,
}).strict();

export const AceFunctionWarmPlanV1Schema = z.object({
  schema: z.literal('atlas.ace-function-warm-plan.v1'),
  status: z.enum(['PROPOSAL_ONLY', 'BLOCKED']),
  workspaceRevision: z.string().min(1).nullable(),
  contextManifestChecksum: sha256.nullable(),
  registrySnapshotChecksum: sha256.nullable(),
  candidates: z.array(candidateSchema).max(32),
  residency: z.object({
    requested: z.literal(true),
    candidateTier: z.literal('L1'),
    ttlSeconds: z.number().int().min(1).max(900),
  }).strict().nullable(),
  reason: z.enum(['CONTEXT_NOT_ADMITTED', 'REGISTRY_SNAPSHOT_INVALID', 'NO_ADMITTED_FUNCTIONS']).nullable(),
  canonicalAuthority: z.literal(false),
  cacheWritesPerformed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  receiptChecksum: sha256,
}).strict().superRefine((plan, context) => {
  if (plan.status === 'PROPOSAL_ONLY' && (plan.reason !== null || plan.residency === null)) {
    context.addIssue({ code: 'custom', message: 'PROPOSAL_REQUIRES_RESIDENCY_AND_NO_REASON' });
  }
  if (plan.status === 'BLOCKED' && (plan.reason === null || plan.residency !== null || plan.candidates.length > 0)) {
    context.addIssue({ code: 'custom', message: 'BLOCKED_PLAN_MUST_NOT_PROPOSE_CANDIDATES' });
  }
});

export type AceFunctionWarmPlanV1 = z.infer<typeof AceFunctionWarmPlanV1Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function finish(input: Omit<AceFunctionWarmPlanV1, 'receiptChecksum'>): AceFunctionWarmPlanV1 {
  return AceFunctionWarmPlanV1Schema.parse({ ...input, receiptChecksum: checksum(input) });
}

export function buildAceFunctionWarmPlanV1(input: {
  snapshot: unknown;
  contextAdmission: {
    status: 'ADMITTED' | 'BLOCKED';
    manifestChecksum: string | null;
    admittedPacketKeys: readonly string[];
  };
  maxCandidates?: number;
  ttlSeconds?: number;
}): AceFunctionWarmPlanV1 {
  const snapshot = input.snapshot;
  const maxCandidates = input.maxCandidates ?? 8;
  const ttlSeconds = input.ttlSeconds ?? 900;
  const blocked = (
    reason: 'CONTEXT_NOT_ADMITTED' | 'REGISTRY_SNAPSHOT_INVALID' | 'NO_ADMITTED_FUNCTIONS',
  ) => finish({
    schema: 'atlas.ace-function-warm-plan.v1',
    status: 'BLOCKED',
    workspaceRevision: null,
    contextManifestChecksum: null,
    registrySnapshotChecksum: null,
    candidates: [],
    residency: null,
    reason,
    canonicalAuthority: false,
    cacheWritesPerformed: false,
    retrievalVoteAdded: false,
  });

  if (input.contextAdmission.status !== 'ADMITTED'
    || !sha256.safeParse(input.contextAdmission.manifestChecksum).success) {
    return blocked('CONTEXT_NOT_ADMITTED');
  }
  if (!verifyFunctionRegistrySnapshotV1(snapshot)) return blocked('REGISTRY_SNAPSHOT_INVALID');
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 32
    || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) {
    return blocked('REGISTRY_SNAPSHOT_INVALID');
  }

  const registry = snapshot as FunctionRegistrySnapshotV1;
  const admittedKeys = new Set(input.contextAdmission.admittedPacketKeys.filter((key) => typeof key === 'string'));
  const candidates = registry.entries
    .filter((entry) => admittedKeys.has(entry.packetKey))
    .slice(0, maxCandidates)
    .map((entry) => ({
      packetKey: entry.packetKey,
      symbolVersionId: entry.symbolVersionId,
      sourceRevision: entry.sourceRevision,
      workspaceRevision: entry.workspaceRevision,
      sourceContentHash: entry.sourceContentHash,
      registrySnapshotChecksum: registry.snapshotChecksum,
    }));

  if (candidates.length === 0) return blocked('NO_ADMITTED_FUNCTIONS');

  return finish({
    schema: 'atlas.ace-function-warm-plan.v1',
    status: 'PROPOSAL_ONLY',
    workspaceRevision: registry.workspaceRevision,
    contextManifestChecksum: input.contextAdmission.manifestChecksum,
    registrySnapshotChecksum: registry.snapshotChecksum,
    candidates,
    residency: { requested: true, candidateTier: 'L1', ttlSeconds },
    reason: null,
    canonicalAuthority: false,
    cacheWritesPerformed: false,
    retrievalVoteAdded: false,
  });
}

export function verifyAceFunctionWarmPlanV1(value: unknown): boolean {
  const parsed = AceFunctionWarmPlanV1Schema.safeParse(value);
  if (!parsed.success) return false;
  const { receiptChecksum, ...content } = parsed.data;
  return checksum(content) === receiptChecksum;
}
