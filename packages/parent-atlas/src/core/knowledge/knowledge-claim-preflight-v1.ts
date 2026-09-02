import { z } from 'zod';
import { AtlasEvidenceResolverRegistryV1, createPhaseScopedEvidenceResolverV1 } from './evidence-resolver-v1.js';
import { atlasKnowledgeClaimV1Schema, type AtlasKnowledgeClaimV1 } from './knowledge-claim-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

export const KNOWLEDGE_CLAIM_ISSUE_KIND_VALUES = [
  'SOURCE_REVISION_CHANGED',
  'SOURCE_MISSING',
  'SPAN_UNRESOLVED',
  'SYMBOL_VERSION_CHANGED',
  'ONTOLOGY_REVISION_CHANGED',
  'EVIDENCE_CHECKSUM_CHANGED',
  'EVIDENCE_VERSION_CHANGED',
] as const;

export const knowledgeClaimPreflightIssueV1Schema = z.object({
  claimId: z.string().min(1),
  evidenceResourceKey: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(KNOWLEDGE_CLAIM_ISSUE_KIND_VALUES),
}).strict();

export type KnowledgeClaimPreflightIssueV1 = z.infer<typeof knowledgeClaimPreflightIssueV1Schema>;

export interface KnowledgeClaimPreflightV1 {
  schema: 'atlas.knowledge-claim-preflight.v1';
  claimCount: number;
  verified: number;
  stale: number;
  unresolved: number;
  conflicted: number;
  issues: KnowledgeClaimPreflightIssueV1[];
  preflightChecksum: string;
  writesPerformed: false;
}

export async function runKnowledgeClaimPreflightV1(
  claimsInput: readonly AtlasKnowledgeClaimV1[],
  registry: AtlasEvidenceResolverRegistryV1,
): Promise<KnowledgeClaimPreflightV1> {
  const claims = claimsInput.map((claim) => atlasKnowledgeClaimV1Schema.parse(claim));
  const resolver = createPhaseScopedEvidenceResolverV1(registry);
  const issues: KnowledgeClaimPreflightIssueV1[] = [];
  const unresolvedClaims = new Set<string>();
  const staleClaims = new Set<string>();
  const conflictedClaims = new Set(claims.filter((claim) => claim.state === 'CONFLICTED').map((claim) => claim.claimId));

  for (const claim of claims) {
    if (claim.state === 'RETRACTED') continue;
    for (const evidence of claim.evidenceRefs) {
      const current = await resolver.resolve(evidence.resource, evidence.evidenceVersion);
      if (!current) {
        issues.push({ claimId: claim.claimId, evidenceResourceKey: evidence.resource.resourceKey, kind: evidence.resource.namespace === 'SOURCE' ? 'SOURCE_MISSING' : 'SPAN_UNRESOLVED' });
        unresolvedClaims.add(claim.claimId);
        continue;
      }
      const next = current.evidence;
      const add = (kind: KnowledgeClaimPreflightIssueV1['kind']) => {
        issues.push({ claimId: claim.claimId, evidenceResourceKey: evidence.resource.resourceKey, kind });
        staleClaims.add(claim.claimId);
      };
      if (evidence.sourceRevision !== next.sourceRevision) add('SOURCE_REVISION_CHANGED');
      if (evidence.symbolVersionId !== next.symbolVersionId) add('SYMBOL_VERSION_CHANGED');
      if (evidence.contentChecksum !== next.contentChecksum) add('EVIDENCE_CHECKSUM_CHANGED');
      if (evidence.evidenceVersion !== next.evidenceVersion) add('EVIDENCE_VERSION_CHANGED');
      if (evidence.authorityRevision !== next.authorityRevision && evidence.resource.namespace === 'ONTOLOGY') add('ONTOLOGY_REVISION_CHANGED');
    }
  }

  issues.sort((left, right) => left.claimId.localeCompare(right.claimId) || left.kind.localeCompare(right.kind) || left.evidenceResourceKey.localeCompare(right.evidenceResourceKey));
  const active = claims.filter((claim) => claim.state !== 'RETRACTED');
  const verified = active.filter((claim) => !unresolvedClaims.has(claim.claimId) && !staleClaims.has(claim.claimId) && !conflictedClaims.has(claim.claimId)).length;
  const body = {
    schema: 'atlas.knowledge-claim-preflight.v1' as const,
    claimCount: active.length,
    verified,
    stale: [...staleClaims].filter((id) => !unresolvedClaims.has(id)).length,
    unresolved: unresolvedClaims.size,
    conflicted: conflictedClaims.size,
    issues,
    writesPerformed: false as const,
  };
  return { ...body, preflightChecksum: sha256HexV1(body) };
}
