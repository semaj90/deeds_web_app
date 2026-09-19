import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);

export const PREFILL_ROUTER_TENSOR_REVISION_V2 = 'atlas.retrieval-router-tensor.v2' as const;

export const PrefillRoutingDecisionV1Schema = z.object({
  schema: z.literal('atlas.prefill-routing-decision.v1'),
  requestId: z.string().min(1),
  workspaceRevision: revision,
  packetRevisionSetChecksum: sha256HexSchema,
  retrievalRouterTensorRevision: z.literal(PREFILL_ROUTER_TENSOR_REVISION_V2),
  compactTensorChecksum: sha256HexSchema,
  classifierRevision: revision,
  classifierOutputChecksum: sha256HexSchema,
  executorCapabilityRevision: revision,
  retrievalPlanChecksum: sha256HexSchema,
  candidateOrdinalMapChecksum: sha256HexSchema,
  status: z.enum(['PLANNED', 'BLOCKED_LINEAGE']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillRoutingDecisionV1 = z.infer<typeof PrefillRoutingDecisionV1Schema>;

function checksum(payload: unknown): string {
  return createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
}

/**
 * Creates the query-side routing decision envelope without selecting an
 * executor or asserting live lineage. The V2 tensor and executor-plan
 * revisions are explicit so legacy 154/224 contracts cannot masquerade as
 * the current control-plane input.
 */
export function buildPrefillRoutingDecisionV1(
  input: Omit<PrefillRoutingDecisionV1, 'schema' | 'checksumSha256'>,
): PrefillRoutingDecisionV1 {
  const payload = {
    schema: 'atlas.prefill-routing-decision.v1' as const,
    ...input,
  };
  return PrefillRoutingDecisionV1Schema.parse({
    ...payload,
    checksumSha256: checksum(payload),
  });
}
