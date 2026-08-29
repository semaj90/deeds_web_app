import { createHash } from 'node:crypto';
import { z } from 'zod';
import { structuralQueryResultV1Schema, type StructuralQueryResultV1 } from './structural-query-executor-v1.js';

const candidateEntrySchema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
}).strict();

export const structuralIdentityResolutionV1Schema = z.object({
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  status: z.enum(['RESOLVED_EXACT', 'UNRESOLVED_SOURCE', 'SOURCE_REVISION_MISMATCH', 'AMBIGUOUS_SOURCE', 'MIXED_WORKSPACE']),
  canonicalId: z.string().min(1).nullable(),
  packetKey: z.string().min(1).nullable(),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  workspaceRevision: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export const structuralIdentityBridgeResultV1Schema = z.object({
  schema: z.literal('atlas.structural-identity-bridge-result.v1'),
  queryResultChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  resolutions: z.array(structuralIdentityResolutionV1Schema),
  resolvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
  promotionEligible: z.literal(false),
}).strict();

export type StructuralIdentityResolutionV1 = z.infer<typeof structuralIdentityResolutionV1Schema>;
export type StructuralIdentityBridgeResultV1 = z.infer<typeof structuralIdentityBridgeResultV1Schema>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/**
 * Exact-only structural identity bridge. It never uses source basename,
 * normalized paths, content hashes, or the generic degraded lane fallback.
 */
export function resolveStructuralIdentityV1(input: {
  queryResult: StructuralQueryResultV1;
  workspaceRevision: string;
  candidateEntries: readonly z.input<typeof candidateEntrySchema>[];
}): StructuralIdentityBridgeResultV1 {
  const queryResult = structuralQueryResultV1Schema.parse(input.queryResult);
  const workspaceRevision = input.workspaceRevision.trim();
  if (!workspaceRevision) throw new Error('STRUCTURAL_IDENTITY_WORKSPACE_REVISION_REQUIRED');
  const entries = input.candidateEntries.map((entry) => candidateEntrySchema.parse(entry));
  const mixedWorkspace = entries.some((entry) => entry.workspaceRevision !== workspaceRevision);
  const resolutions = queryResult.matches.map((match) => {
    const exactSource = entries.filter((entry) => entry.sourceRef === match.sourceRef);
    const exact = exactSource.filter((entry) => entry.sourceRevision === match.sourceRevision && entry.workspaceRevision === workspaceRevision);
    let status: StructuralIdentityResolutionV1['status'];
    if (mixedWorkspace) status = 'MIXED_WORKSPACE';
    else if (exact.length === 1) status = 'RESOLVED_EXACT';
    else if (exact.length > 1) status = 'AMBIGUOUS_SOURCE';
    else if (exactSource.length > 0) status = 'SOURCE_REVISION_MISMATCH';
    else status = 'UNRESOLVED_SOURCE';
    const candidate = status === 'RESOLVED_EXACT' ? exact[0] : undefined;
    return structuralIdentityResolutionV1Schema.parse({
      observationId: match.observationId,
      sourceRef: match.sourceRef,
      sourceRevision: match.sourceRevision,
      status,
      canonicalId: candidate?.canonicalId ?? null,
      packetKey: candidate?.packetKey ?? null,
      candidateOrdinal: candidate?.candidateOrdinal ?? null,
      workspaceRevision: candidate?.workspaceRevision ?? null,
      evidenceRefs: [`structural-observation:${match.observationId}`],
    });
  });
  const result = {
    schema: 'atlas.structural-identity-bridge-result.v1' as const,
    queryResultChecksum: queryResult.resultChecksum,
    workspaceRevision,
    resolutions,
    resolvedCount: resolutions.filter((row) => row.status === 'RESOLVED_EXACT').length,
    rejectedCount: resolutions.filter((row) => row.status !== 'RESOLVED_EXACT').length,
    canonicalAuthority: false as const,
    promotionEligible: false as const,
  };
  return structuralIdentityBridgeResultV1Schema.parse(result);
}
