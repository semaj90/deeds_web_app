import { z } from 'zod';
import { resolvedEvidenceRefV1Schema, type ResolvedEvidenceRefV1 } from './evidence-resource-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const KNOWLEDGE_CLAIM_STATE_VALUES = ['VERIFIED', 'STALE', 'UNRESOLVED', 'CONFLICTED', 'RETRACTED'] as const;

export const atlasKnowledgeClaimV1Schema = z
  .object({
    schema: z.literal('atlas.knowledge-claim.v1').default('atlas.knowledge-claim.v1'),
    claimId: id,
    statement: z.string().trim().min(1),
    evidenceRefs: z.array(resolvedEvidenceRefV1Schema).min(1),
    claimRevision: revision,
    claimChecksum: sha256Hex,
    state: z.enum(KNOWLEDGE_CLAIM_STATE_VALUES),
    canonicalAuthority: z.literal(false).default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const evidence of value.evidenceRefs) {
      const key = `${evidence.resource.resourceKey}:${evidence.evidenceVersion}`;
      if (keys.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: `Duplicate evidence ${key}` });
      keys.add(key);
    }
  });

export type AtlasKnowledgeClaimV1 = z.infer<typeof atlasKnowledgeClaimV1Schema>;

function canonicalEvidence(evidenceRefs: readonly ResolvedEvidenceRefV1[]): ResolvedEvidenceRefV1[] {
  return [...evidenceRefs].sort((left, right) => {
    const a = `${left.resource.resourceKey}:${left.evidenceVersion}`;
    const b = `${right.resource.resourceKey}:${right.evidenceVersion}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export function buildAtlasKnowledgeClaimV1(
  input: Omit<AtlasKnowledgeClaimV1, 'schema' | 'claimChecksum' | 'canonicalAuthority'>,
): AtlasKnowledgeClaimV1 {
  const evidenceRefs = canonicalEvidence(input.evidenceRefs);
  const checksumBody = { claimId: input.claimId, statement: input.statement, evidenceRefs };
  const body = {
    schema: 'atlas.knowledge-claim.v1' as const,
    claimId: input.claimId,
    statement: input.statement,
    evidenceRefs,
    claimRevision: input.claimRevision,
    claimChecksum: sha256HexV1(checksumBody),
    state: input.state,
    canonicalAuthority: false as const,
  };
  return atlasKnowledgeClaimV1Schema.parse(body);
}

export function knowledgeClaimSetChecksumV1(claims: readonly AtlasKnowledgeClaimV1[]): string {
  return sha256HexV1(
    [...claims]
      .sort((left, right) => (left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0))
      .map((claim) => ({ claimId: claim.claimId, claimRevision: claim.claimRevision, claimChecksum: claim.claimChecksum, state: claim.state })),
  );
}
