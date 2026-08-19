import { z } from 'zod';
import {
  ExecuteCompiledAstQueryInputV1Schema,
  ExecuteCompiledAstQueryResultV1Schema,
  executeCompiledAstQuery,
} from './compiled-ast-query-executor.js';
import {
  TsMorphSemanticEnrichmentResultV1Schema,
  enrichAstCandidateWithTsMorph,
} from './ts-morph-semantic-enrichment.js';

/**
 * Read-only structural→semantic pipeline for TypeScript-family queries.
 *
 * ast-grep nominates exact syntax candidates. ts-morph enriches only the
 * selected Top-K rows. Neither layer claims canonical Tree-sitter identity,
 * adds a second AST vote, or writes source.
 */

export const AstQuerySemanticPipelineInputV1Schema = z.object({
  schema: z.literal('atlas.ast-query-semantic-pipeline-input.v1'),
  structural: ExecuteCompiledAstQueryInputV1Schema,
  tsConfigFilePath: z.string().min(1).nullable(),
  semanticEngineRevision: z.string().min(1),
  semanticTopK: z.number().int().positive().max(10_000),
  producerRevision: z.string().min(1),
}).strict();
export type AstQuerySemanticPipelineInputV1 = z.infer<typeof AstQuerySemanticPipelineInputV1Schema>;

export const AstQuerySemanticPipelineRowV1Schema = z.object({
  structuralRank: z.number().int().positive(),
  structuralScoreMilli: z.number().int().nonnegative(),
  semantic: TsMorphSemanticEnrichmentResultV1Schema,
}).strict();
export type AstQuerySemanticPipelineRowV1 = z.infer<typeof AstQuerySemanticPipelineRowV1Schema>;

export const AstQuerySemanticPipelineFailureV1Schema = z.object({
  structuralRank: z.number().int().positive(),
  candidateName: z.string().min(1),
  sourceRef: z.string().min(1),
  errorTag: z.enum([
    'TS_MORPH_IDENTIFIER_NOT_FOUND',
    'TS_MORPH_FILE_PATH_MISMATCH',
    'TS_MORPH_ENRICHMENT_ERROR',
  ]),
  message: z.string().min(1),
}).strict();
export type AstQuerySemanticPipelineFailureV1 = z.infer<typeof AstQuerySemanticPipelineFailureV1Schema>;

export const AstQuerySemanticPipelineResultV1Schema = z.object({
  schema: z.literal('atlas.ast-query-semantic-pipeline-result.v1'),
  structural: ExecuteCompiledAstQueryResultV1Schema,
  requestedSemanticTopK: z.number().int().positive(),
  attemptedSemanticCandidates: z.number().int().nonnegative(),
  enrichedSemanticCandidates: z.number().int().nonnegative(),
  rows: z.array(AstQuerySemanticPipelineRowV1Schema),
  failures: z.array(AstQuerySemanticPipelineFailureV1Schema),
  structuralRankingPreserved: z.literal(true),
  semanticEnrichmentMayNotReorderCandidates: z.literal(true),
  treeSitterCanonicalJoinStillRequired: z.literal(true),
  exactPromotionRequired: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AstQuerySemanticPipelineResultV1 = z.infer<typeof AstQuerySemanticPipelineResultV1Schema>;

function classifyError(error: unknown): AstQuerySemanticPipelineFailureV1['errorTag'] {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('TS_MORPH_IDENTIFIER_NOT_FOUND:')) return 'TS_MORPH_IDENTIFIER_NOT_FOUND';
  if (message.startsWith('TS_MORPH_FILE_PATH_MISMATCH:')) return 'TS_MORPH_FILE_PATH_MISMATCH';
  return 'TS_MORPH_ENRICHMENT_ERROR';
}

export async function runAstQuerySemanticPipeline(
  value: AstQuerySemanticPipelineInputV1,
): Promise<AstQuerySemanticPipelineResultV1> {
  const input = AstQuerySemanticPipelineInputV1Schema.parse(value);
  const structural = await executeCompiledAstQuery(input.structural);
  const selected = structural.topK.rows.slice(0, Math.min(input.semanticTopK, structural.topK.rows.length));
  const rows: AstQuerySemanticPipelineRowV1[] = [];
  const failures: AstQuerySemanticPipelineFailureV1[] = [];

  for (const row of selected) {
    try {
      const semantic = enrichAstCandidateWithTsMorph({
        schema: 'atlas.ts-morph-semantic-enrichment-input.v1',
        candidate: row.candidate,
        code: input.structural.extraction.code,
        filePath: input.structural.extraction.filePath,
        tsConfigFilePath: input.tsConfigFilePath,
        semanticEngineRevision: input.semanticEngineRevision,
        producerRevision: input.producerRevision,
      });
      rows.push(AstQuerySemanticPipelineRowV1Schema.parse({
        structuralRank: row.rank,
        structuralScoreMilli: row.scoreMilli,
        semantic,
      }));
    } catch (error) {
      failures.push(AstQuerySemanticPipelineFailureV1Schema.parse({
        structuralRank: row.rank,
        candidateName: row.candidate.name,
        sourceRef: row.candidate.sourceRef,
        errorTag: classifyError(error),
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return AstQuerySemanticPipelineResultV1Schema.parse({
    schema: 'atlas.ast-query-semantic-pipeline-result.v1',
    structural,
    requestedSemanticTopK: input.semanticTopK,
    attemptedSemanticCandidates: selected.length,
    enrichedSemanticCandidates: rows.length,
    rows,
    failures,
    structuralRankingPreserved: true,
    semanticEnrichmentMayNotReorderCandidates: true,
    treeSitterCanonicalJoinStillRequired: true,
    exactPromotionRequired: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
