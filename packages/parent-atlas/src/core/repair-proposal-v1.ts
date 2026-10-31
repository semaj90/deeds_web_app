import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ref = z.string().trim().min(1).max(500);

const graphFeatureEvidenceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('EXCLUDED') }).strict(),
  z.object({
    mode: z.literal('ADMITTED'),
    graphSnapshotRevision: sha256,
    evidenceRefs: z.array(ref).min(1).max(32),
  }).strict(),
]);

export const repairProposalV1Schema = z.object({
  schema: z.literal('atlas.repair-proposal.v1'),
  proposalId: ref,
  executionId: ref,
  workspaceRevision: sha256,
  candidateSnapshotRevision: sha256,
  graphSnapshotRevision: sha256.nullable(),
  diagnosticEvidenceRefs: z.array(ref).min(1).max(32),
  candidates: z.array(z.object({
    functionId: ref,
    repositoryId: z.string().uuid(),
    sourceRef: ref,
    sourceRevision: sha256,
    candidateSnapshotRevision: sha256,
    rank: z.number().int().positive(),
    score: z.number().finite().min(0).max(1),
    evidenceRefs: z.array(ref).min(1).max(32),
    graphFeatures: graphFeatureEvidenceSchema,
  }).strict()).min(1).max(5),
  patchHypothesis: z.string().trim().min(1).max(2_000),
  proposedTestIds: z.array(ref).min(1).max(20),
  riskClass: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  mode: z.literal('PROPOSE_ONLY'),
  authorizationGranted: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: sha256,
}).strict().superRefine((proposal, ctx) => {
  const ids = proposal.candidates.map((candidate) => candidate.functionId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'DUPLICATE_FUNCTION_ID' });
  }
  const ranks = proposal.candidates.map((candidate) => candidate.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'CANDIDATE_RANKS_MUST_BE_CONTIGUOUS' });
  }
  for (const [index, candidate] of proposal.candidates.entries()) {
    if (candidate.candidateSnapshotRevision !== proposal.candidateSnapshotRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateSnapshotRevision'], message: 'STALE_CANDIDATE_SNAPSHOT' });
    }
    if (candidate.graphFeatures.mode === 'ADMITTED'
      && (proposal.graphSnapshotRevision === null || candidate.graphFeatures.graphSnapshotRevision !== proposal.graphSnapshotRevision)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'graphFeatures'], message: 'GRAPH_FEATURE_REVISION_MISMATCH' });
    }
  }
});

export type RepairProposalV1 = z.infer<typeof repairProposalV1Schema>;
type RepairProposalInputV1 = Omit<RepairProposalV1, 'schema' | 'checksum' | 'mode' | 'authorizationGranted' | 'canonicalAuthority' | 'writesPerformed'>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function buildRepairProposalV1(input: RepairProposalInputV1): RepairProposalV1 {
  const body = {
    schema: 'atlas.repair-proposal.v1' as const,
    ...input,
    mode: 'PROPOSE_ONLY' as const,
    authorizationGranted: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const checksum = `sha256:${createHash('sha256').update(stableJson(body), 'utf8').digest('hex')}`;
  return repairProposalV1Schema.parse({ ...body, checksum });
}

export function verifyRepairProposalV1(input: unknown): RepairProposalV1 {
  const proposal = repairProposalV1Schema.parse(input);
  const { checksum, ...body } = proposal;
  const expected = `sha256:${createHash('sha256').update(stableJson(body), 'utf8').digest('hex')}`;
  if (checksum !== expected) throw new Error('REPAIR_PROPOSAL_CHECKSUM_MISMATCH');
  return proposal;
}
