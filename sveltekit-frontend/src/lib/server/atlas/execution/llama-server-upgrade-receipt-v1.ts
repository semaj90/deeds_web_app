import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const LlamaServerUpgradeReceiptV1Schema = z.object({
  schema: z.literal('atlas.llama-server-upgrade-receipt.v1'),
  endpoint: z.literal('http://127.0.0.1:8090'),
  currentModelId: z.string().min(1),
  currentModelChecksum: z.string().min(1).nullable(),
  candidateBinaryRevision: z.string().min(1).nullable(),
  candidateModelChecksum: z.string().min(1).nullable(),
  requiredReplayGates: z.array(z.enum(['HEALTH', 'MODELS', 'PROPS', 'CHAT', 'TOOLS', 'SYNTHESIS'])).min(1),
  status: z.enum(['REVIEW_ONLY', 'BLOCKED_MISSING_CHECKSUM', 'READY_FOR_EXPLICIT_REVIEW']),
  rollback: z.object({
    endpointPreserved: z.literal(true),
    currentBinaryPreserved: z.literal(true),
    currentModelPreserved: z.literal(true),
    disableCandidateOnly: z.literal(true),
  }).strict(),
  upgradeAuthorized: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type LlamaServerUpgradeReceiptV1 = z.infer<typeof LlamaServerUpgradeReceiptV1Schema>;

export function buildLlamaServerUpgradeReceiptV1(input: {
  currentModelId: string;
  currentModelChecksum?: string | null;
  candidateBinaryRevision?: string | null;
  candidateModelChecksum?: string | null;
}): LlamaServerUpgradeReceiptV1 {
  const body = {
    schema: 'atlas.llama-server-upgrade-receipt.v1' as const,
    endpoint: 'http://127.0.0.1:8090' as const,
    currentModelId: input.currentModelId,
    currentModelChecksum: input.currentModelChecksum ?? null,
    candidateBinaryRevision: input.candidateBinaryRevision ?? null,
    candidateModelChecksum: input.candidateModelChecksum ?? null,
    requiredReplayGates: ['HEALTH', 'MODELS', 'PROPS', 'CHAT', 'TOOLS', 'SYNTHESIS'] as const,
    status: input.currentModelChecksum && input.candidateBinaryRevision && input.candidateModelChecksum
      ? 'READY_FOR_EXPLICIT_REVIEW' as const
      : 'BLOCKED_MISSING_CHECKSUM' as const,
    rollback: {
      endpointPreserved: true as const,
      currentBinaryPreserved: true as const,
      currentModelPreserved: true as const,
      disableCandidateOnly: true as const,
    },
    upgradeAuthorized: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return LlamaServerUpgradeReceiptV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}
