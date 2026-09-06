import { z } from 'zod';
import { atlasEvidenceResourceV1Schema, type AtlasEvidenceResourceV1, type ResolvedEvidenceRefV1 } from './evidence-resource-v1.js';
import { AtlasEvidenceResolverRegistryV1, createPhaseScopedEvidenceResolverV1 } from './evidence-resolver-v1.js';
import { atlasKnowledgeClaimV1Schema, buildAtlasKnowledgeClaimV1, knowledgeClaimSetChecksumV1, type AtlasKnowledgeClaimV1 } from './knowledge-claim-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);

const addOrUpdateSchema = z.object({
  mutationId: id,
  operation: z.enum(['ADD', 'UPDATE']),
  claimId: id,
  statement: z.string().trim().min(1),
  claimRevision: revision,
  evidenceResources: z.array(atlasEvidenceResourceV1Schema).min(1),
}).strict();

const confirmSchema = z.object({ mutationId: id, operation: z.literal('CONFIRM'), claimId: id }).strict();
const retractSchema = z.object({ mutationId: id, operation: z.literal('RETRACT'), claimId: id, claimRevision: revision }).strict();

export const knowledgeClaimMutationV1Schema = z.discriminatedUnion('operation', [addOrUpdateSchema, confirmSchema, retractSchema]);
export type KnowledgeClaimMutationV1 = z.infer<typeof knowledgeClaimMutationV1Schema>;

export interface KnowledgeClaimMutationBatchResultV1 {
  claims: AtlasKnowledgeClaimV1[];
  receipt: {
    schema: 'atlas.knowledge-claim-mutation-receipt.v1';
    mutationCount: number;
    beforeClaimSetChecksum: string;
    afterClaimSetChecksum: string;
    mutationSetChecksum: string;
    writesPerformed: false;
  };
}

function uniqueResources(resources: readonly AtlasEvidenceResourceV1[]): void {
  const keys = new Set<string>();
  for (const resource of resources) {
    if (keys.has(resource.resourceKey)) throw new Error(`DUPLICATE_EVIDENCE_RESOURCE:${resource.resourceKey}`);
    keys.add(resource.resourceKey);
  }
}

export async function applyKnowledgeClaimMutationsV1(
  existingInput: readonly AtlasKnowledgeClaimV1[],
  mutationInput: readonly KnowledgeClaimMutationV1[],
  registry: AtlasEvidenceResolverRegistryV1,
): Promise<KnowledgeClaimMutationBatchResultV1> {
  const existing = existingInput.map((claim) => atlasKnowledgeClaimV1Schema.parse(claim));
  const mutations = mutationInput.map((mutation) => knowledgeClaimMutationV1Schema.parse(mutation));
  const byId = new Map(existing.map((claim) => [claim.claimId, claim]));
  const mutationIds = new Set<string>();
  const targetedClaims = new Set<string>();

  for (const mutation of mutations) {
    if (mutationIds.has(mutation.mutationId)) throw new Error(`DUPLICATE_MUTATION_ID:${mutation.mutationId}`);
    mutationIds.add(mutation.mutationId);
    if (targetedClaims.has(mutation.claimId)) throw new Error(`MULTIPLE_MUTATIONS_FOR_CLAIM:${mutation.claimId}`);
    targetedClaims.add(mutation.claimId);
    const current = byId.get(mutation.claimId);
    if (mutation.operation === 'ADD' && current) throw new Error(`ADD_TARGET_ALREADY_EXISTS:${mutation.claimId}`);
    if (mutation.operation !== 'ADD' && !current) throw new Error(`MUTATION_TARGET_NOT_FOUND:${mutation.claimId}`);
    if (mutation.operation === 'ADD' || mutation.operation === 'UPDATE') uniqueResources(mutation.evidenceResources);
  }

  const resolver = createPhaseScopedEvidenceResolverV1(registry);
  const prepared = new Map<string, ResolvedEvidenceRefV1[]>();

  for (const mutation of mutations) {
    if (mutation.operation !== 'ADD' && mutation.operation !== 'UPDATE') continue;
    const current = byId.get(mutation.claimId);
    const resolved: ResolvedEvidenceRefV1[] = [];
    for (const resource of mutation.evidenceResources) {
      const previous = current?.evidenceRefs.find((entry) => entry.resource.resourceKey === resource.resourceKey)?.evidenceVersion;
      const result = await resolver.resolve(resource, previous);
      if (!result) throw new Error(`EVIDENCE_UNRESOLVED:${resource.resourceKey}`);
      if (result.evidence.resource.resourceKey !== resource.resourceKey) throw new Error(`EVIDENCE_RESOURCE_MISMATCH:${resource.resourceKey}`);
      resolved.push(result.evidence);
    }
    prepared.set(mutation.mutationId, resolved);
  }

  const next = new Map(byId);
  for (const mutation of mutations) {
    const current = next.get(mutation.claimId);
    if (mutation.operation === 'ADD' || mutation.operation === 'UPDATE') {
      next.set(
        mutation.claimId,
        buildAtlasKnowledgeClaimV1({
          claimId: mutation.claimId,
          statement: mutation.statement,
          evidenceRefs: prepared.get(mutation.mutationId) ?? [],
          claimRevision: mutation.claimRevision,
          state: 'VERIFIED',
        }),
      );
    } else if (mutation.operation === 'CONFIRM') {
      if (!current) throw new Error(`MUTATION_TARGET_NOT_FOUND:${mutation.claimId}`);
      next.set(mutation.claimId, current);
    } else {
      if (!current) throw new Error(`MUTATION_TARGET_NOT_FOUND:${mutation.claimId}`);
      next.set(
        mutation.claimId,
        buildAtlasKnowledgeClaimV1({
          claimId: current.claimId,
          statement: current.statement,
          evidenceRefs: current.evidenceRefs,
          claimRevision: mutation.claimRevision,
          state: 'RETRACTED',
        }),
      );
    }
  }

  const claims = [...next.values()].sort((left, right) => (left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0));
  return {
    claims,
    receipt: {
      schema: 'atlas.knowledge-claim-mutation-receipt.v1',
      mutationCount: mutations.length,
      beforeClaimSetChecksum: knowledgeClaimSetChecksumV1(existing),
      afterClaimSetChecksum: knowledgeClaimSetChecksumV1(claims),
      mutationSetChecksum: sha256HexV1(mutations),
      writesPerformed: false,
    },
  };
}
