import { z } from 'zod';

import { publicProcedure, router } from '../init.js';
import {
  runSemanticSearchWorkflow,
  SemanticSearchWorkflowRequestSchema,
  SemanticSearchWorkflowResultSchema,
} from '$lib/server/retrieval/semantic-search-workflow.js';

export const searchRouter = router({
  semanticSearch: publicProcedure
    .input(
      SemanticSearchWorkflowRequestSchema.extend({
        query: z.string().trim().min(1).max(16_000),
        topK: z.number().int().min(1).max(50).default(20),
        withGraphExpansion: z.boolean().default(true),
        includeWorkflowPreamble: z.boolean().default(true),
        includeAcePacket: z.boolean().default(true),
        compareRustShadow: z.boolean().default(true),
      }).strict(),
    )
    .output(SemanticSearchWorkflowResultSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await runSemanticSearchWorkflow(input, {
          userId: ctx.userId !== null ? String(ctx.userId) : null,
          caseId: ctx.sessionId,
        });
      } catch (error) {
        return {
          query: input.query,
          topK: input.topK,
          workflowState: 'FAILED' as const,
          workflowDag: [
            {
              name: 'validate_request',
              status: 'failed' as const,
              durationMs: 0,
              detail: error instanceof Error ? error.message : 'Search workflow failed',
            },
          ],
          preamble: null,
          topPacketKeys: [],
          packets: [],
          metadata: {
            query: input.query,
            candidatesRetrieved: 0,
            candidatesFused: 0,
            candidatesScored: 0,
            candidatesReranked: 0,
            candidatesPostProcessed: 0,
            durationMs: 0,
            stages: {
              retrieve: 0,
              fuse: 0,
              score: 0,
              hydrate: 0,
              rerank: 0,
              postProcess: 0,
            },
          },
          provenance: {
            retrievalSources: [],
            fusionMethod: 'rrf',
            rerankModel: 'none',
            rerankerUsed: false,
            promotionAttempted: false,
          },
          ace: null,
          shadow: null,
          error: error instanceof Error ? error.message : 'Search workflow failed',
        };
      }
    }),
});
