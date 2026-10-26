import { z } from 'zod';

import { protectedProcedure, publicProcedure, router } from '../init.js';
import {
  runSemanticSearchWorkflow,
  SemanticSearchWorkflowRequestSchema,
  SemanticSearchWorkflowResultSchema,
} from '$lib/server/retrieval/semantic-search-workflow.js';
import { refuseVerifiedContextV1, VerifiedContextRequestV1Schema, VerifiedContextResponseV1Schema } from '$lib/server/atlas/execution/verified-context-service-v1.js';

export const searchRouter = router({
  verifiedContext: protectedProcedure
    .input(VerifiedContextRequestV1Schema.omit({ requestId: true }))
    .output(VerifiedContextResponseV1Schema)
    .query(async ({ input, ctx }) => {
      const request = { ...input, requestId: ctx.requestId };
      if (!ctx.verifiedContextService) return refuseVerifiedContextV1(ctx.requestId, 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED');
      try {
        return await ctx.verifiedContextService.execute(String(ctx.userId), request);
      } catch (error) {
        return refuseVerifiedContextV1(
          ctx.requestId,
          error instanceof Error ? error.message : 'VERIFIED_CONTEXT_REQUEST_FAILED',
          'REQUEST_VALIDATION',
        );
      }
    }),

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
          contextManifestShadow: {},
          shadow: null,
          graphExpansionStatus: 'BLOCKED_TRUSTED_WORKSPACE_REVISION_MISSING' as const,
          error: error instanceof Error ? error.message : 'Search workflow failed',
        };
      }
    }),
});
