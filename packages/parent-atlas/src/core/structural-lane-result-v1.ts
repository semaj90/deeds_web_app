import { createHash } from 'node:crypto';
import { z } from 'zod';
import { structuralQueryResultV1Schema, type StructuralQueryResultV1 } from './structural-query-executor-v1.js';
import { structuralIdentityBridgeResultV1Schema, type StructuralIdentityBridgeResultV1 } from './structural-identity-bridge-v1.js';

const laneHitSchema = z.object({
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().positive(),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  canonicalId: z.string().min(1).nullable(),
  packetKey: z.string().min(1).nullable(),
  identityStatus: z.enum(['RESOLVED_EXACT', 'UNRESOLVED_SOURCE', 'SOURCE_REVISION_MISMATCH', 'AMBIGUOUS_SOURCE', 'MIXED_WORKSPACE']),
  structuralRank: z.number().int().positive(),
  confidence: z.number().finite().min(0).max(1),
  matchReason: z.array(z.string().min(1)).min(1),
}).strict();

export const structuralLaneResultV1Schema = z.object({
  schema: z.literal('atlas.structural-lane-result.v1'),
  lane: z.literal('structural_cst_ast'),
  queryResultChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityBridgeChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  hits: z.array(laneHitSchema),
  laneChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  scoreSemantics: z.literal('LANE_LOCAL_DIAGNOSTIC_ONLY'),
  fusionReady: z.literal(false),
  canonicalAuthority: z.literal(false),
  promotionEligible: z.literal(false),
}).strict();

export type StructuralLaneResultV1 = z.infer<typeof structuralLaneResultV1Schema>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Builds diagnostics only; SearchRuntime/RRF must perform any later fusion. */
export function buildStructuralLaneResultV1(input: {
  queryResult: StructuralQueryResultV1;
  identityBridge: StructuralIdentityBridgeResultV1;
}): StructuralLaneResultV1 {
  const queryResult = structuralQueryResultV1Schema.parse(input.queryResult);
  const identityBridge = structuralIdentityBridgeResultV1Schema.parse(input.identityBridge);
  if (identityBridge.queryResultChecksum !== queryResult.resultChecksum) throw new Error('STRUCTURAL_LANE_QUERY_IDENTITY_CHECKSUM_MISMATCH');
  if (identityBridge.resolutions.length !== queryResult.matches.length) throw new Error('STRUCTURAL_LANE_MATCH_RESOLUTION_COUNT_MISMATCH');
  const hits = queryResult.matches.map((match, index) => {
    const resolution = identityBridge.resolutions[index]!;
    return {
      observationId: match.observationId,
      sourceRef: match.sourceRef,
      sourceRevision: match.sourceRevision,
      byteStart: match.byteStart,
      byteEnd: match.byteEnd,
      candidateOrdinal: resolution.candidateOrdinal,
      canonicalId: resolution.canonicalId,
      packetKey: resolution.packetKey,
      identityStatus: resolution.status,
      structuralRank: match.rank,
      confidence: match.confidence,
      matchReason: match.matchReason,
    };
  });
  return structuralLaneResultV1Schema.parse({
    schema: 'atlas.structural-lane-result.v1',
    lane: 'structural_cst_ast',
    queryResultChecksum: queryResult.resultChecksum,
    identityBridgeChecksum: digest(identityBridge.resolutions),
    workspaceRevision: identityBridge.workspaceRevision,
    sourceRevision: queryResult.sourceRevision,
    hits,
    laneChecksum: digest(hits),
    scoreSemantics: 'LANE_LOCAL_DIAGNOSTIC_ONLY',
    fusionReady: false,
    canonicalAuthority: false,
    promotionEligible: false,
  });
}
