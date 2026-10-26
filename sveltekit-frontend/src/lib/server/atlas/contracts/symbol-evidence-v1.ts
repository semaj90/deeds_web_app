import { z } from 'zod';

export const SYMBOL_EVIDENCE_SCHEMA = 'atlas.symbol-evidence.v1' as const;

export const SymbolEvidenceV1Schema = z
  .object({
    schema: z.literal(SYMBOL_EVIDENCE_SCHEMA),

    // Preserve upstream provenance
    upstreamChunkId: z.string().min(1),
    nativeSymbolId: z.string().nullable(),
    treeNodeId: z.string().nullable(),
    packetKey: z.string().nullable(),

    sourceRef: z
      .object({
        repositoryId: z.string().min(1),
        normalizedPath: z.string().min(1),
        contentSha256: z.string().min(1),
        startByte: z.number().int().nonnegative(),
        endByte: z.number().int().nonnegative(),
      })
      .refine((ref) => ref.endByte > ref.startByte, {
        message: 'SOURCE_REF_END_BYTE_MUST_EXCEED_START_BYTE',
        path: ['endByte'],
      }),

    ast: z.object({
      nodeType: z.string().min(1),
      symbolKind: z.string().min(1),
      name: z.string().min(1),
      signature: z.string().nullable(),
      parentAstPath: z.string().nullable(),
      parseError: z.boolean(),
    }),

    evidenceStatus: z.enum(['PROVEN', 'PARTIAL', 'REJECTED']),
  })
  .strict();

export type SymbolEvidenceV1 = z.infer<typeof SymbolEvidenceV1Schema>;

/**
 * Eligibility bitmask flags.
 * Bitmasks gate candidate admissibility before ranking;
 * they do not extract or replace symbol truth.
 */
export const AST_DEFINED = 1 << 0;   // 0b0001
export const SOURCE_PROVEN = 1 << 1; // 0b0010
export const SEMANTIC_HIT = 1 << 2;  // 0b0100
export const GRAPH_LINKED = 1 << 3;  // 0b1000

export const ELIGIBILITY_MASK = AST_DEFINED | SOURCE_PROVEN; // 0b0011

/**
 * Checks whether a candidate satisfies hard eligibility predicates.
 * Hard eligibility requires both AST_DEFINED and SOURCE_PROVEN.
 * Semantic and graph signals modulate ranking scores, not eligibility.
 */
export function isCandidateEligible(mask: number): boolean {
  return (mask & ELIGIBILITY_MASK) === ELIGIBILITY_MASK;
}
