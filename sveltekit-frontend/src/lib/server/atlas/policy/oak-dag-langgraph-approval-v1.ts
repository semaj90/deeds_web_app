import { createHash } from 'node:crypto';
import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const oakDagApprovalPayloadV1Schema = z.object({
  schema: z.literal('atlas.oak-dag-approval-payload.v1'),
  requestId: z.string().min(1),
  planId: z.string().min(1),
  planChecksum: sha256Hex,
  executionChecksum: sha256Hex,
  proposalChecksum: sha256Hex,
  evidenceChecksum: sha256Hex,
  affectedFiles: z.array(z.string().min(1)).max(100),
  validations: z.array(z.string().min(1)).max(100),
  mutationClass: z.enum(['PATCH_FILE', 'DATABASE', 'QDRANT', 'GRAPH', 'ARCHIVE', 'OTHER']),
  canonicalAuthority: z.literal(false),
}).strict();

export type OakDagApprovalPayloadV1 = z.infer<typeof oakDagApprovalPayloadV1Schema>;

export const oakDagApprovalDecisionV1Schema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  proposalChecksum: sha256Hex,
  reviewerNote: z.string().max(4000).nullable().default(null),
}).strict();

export type OakDagApprovalDecisionV1 = z.infer<typeof oakDagApprovalDecisionV1Schema>;

export function buildOakDagApprovalThreadIdV1(input: {
  requestId: string;
  planChecksum: string;
  proposalChecksum: string;
}): string {
  const digest = createHash('sha256')
    .update(`${input.requestId}\n${input.planChecksum}\n${input.proposalChecksum}`, 'utf8')
    .digest('hex');
  return `oak-approval:${digest}`;
}

/**
 * This is intentionally a pure approval boundary: it pauses and returns a
 * human decision, but it performs no mutation. Call it from its own LangGraph
 * node so resume/replay cannot repeat pre-approval side effects.
 */
export function requestOakDagApprovalV1(payload: OakDagApprovalPayloadV1): OakDagApprovalDecisionV1 {
  const parsedPayload = oakDagApprovalPayloadV1Schema.parse(payload);
  const resumed = interrupt(parsedPayload);
  return oakDagApprovalDecisionV1Schema.parse(resumed);
}

export function assertOakDagApprovalMatchesProposalV1(input: {
  payload: OakDagApprovalPayloadV1;
  decision: OakDagApprovalDecisionV1;
}): void {
  const payload = oakDagApprovalPayloadV1Schema.parse(input.payload);
  const decision = oakDagApprovalDecisionV1Schema.parse(input.decision);
  if (decision.proposalChecksum !== payload.proposalChecksum) {
    throw new Error('OAK_APPROVAL_PROPOSAL_CHECKSUM_MISMATCH');
  }
  if (decision.decision !== 'APPROVE') {
    throw new Error('OAK_APPROVAL_REJECTED');
  }
}
