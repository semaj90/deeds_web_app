import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const VerifiedContextToolInput = z.object({
  query: z.string().trim().min(1).max(16_000),
  topK: z.number().int().min(1).max(10).default(5),
}).strict();

const VerifiedContextToolOutput = z.discriminatedUnion('status', [
  z.object({
    schema: z.literal('atlas.verified-context-result.v1'),
    status: z.literal('ADMITTED'),
    requestId: z.string().min(1),
    contextPacketRef: z.string().min(1),
    contextPacketDigest: z.string().regex(/^[a-f0-9]{64}$/),
    contextManifestChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    promptPlanChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    promptPlan: z.unknown(),
    receipt: z.unknown(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  }).strict(),
  z.object({
    schema: z.literal('atlas.verified-context-result.v1'),
    status: z.literal('REFUSED'),
    requestId: z.string().min(1),
    refusalCode: z.string().min(1),
    firstFailingBoundary: z.string().min(1),
    receipt: z.unknown(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  }).strict(),
]).superRefine((result, context) => {
  if (result.status !== 'ADMITTED' || typeof result.receipt !== 'object' || result.receipt === null) return;
  const readback = (result.receipt as { mastraReadback?: unknown }).mastraReadback;
  if (typeof readback !== 'object' || readback === null || (readback as { status?: unknown }).status !== 'PROMPT_PLAN_DIGEST_MATCH') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'mastraReadback'], message: 'MASTRA_READBACK_NOT_VERIFIED' });
  }
});

export interface VerifiedContextToolServiceV1 {
  execute(actorId: string | null, request: { requestId: string; query: string; topK: number }): Promise<z.infer<typeof VerifiedContextToolOutput>>;
  verifyMastraReadback(result: z.infer<typeof VerifiedContextToolOutput>): z.infer<typeof VerifiedContextToolOutput>;
}

const VerifiedContextRequestContextV1 = z.object({
  actorId: z.string().min(1),
  requestId: z.string().min(1),
}).strict();

export function createVerifiedContextToolV1(service: VerifiedContextToolServiceV1) {
  return createTool({
    id: 'atlas.verified_context',
    description: 'Return only a server-verified context packet reference and digest, or a fail-closed refusal.',
    inputSchema: VerifiedContextToolInput,
    outputSchema: VerifiedContextToolOutput,
    requestContextSchema: VerifiedContextRequestContextV1,
    execute: async (input, context) => {
      const requestContext = context?.requestContext;
      if (!requestContext) {
        return {
          schema: 'atlas.verified-context-result.v1' as const,
          status: 'REFUSED' as const,
          requestId: 'unbound',
          refusalCode: 'MASTRA_REQUEST_CONTEXT_REQUIRED',
          firstFailingBoundary: 'WORKSPACE_AUTHORITY',
          receipt: { canonicalAuthority: false, writesPerformed: false },
          canonicalAuthority: false as const,
          writesPerformed: false as const,
        };
      }
      const actorId = requestContext.get('actorId');
      const requestId = requestContext.get('requestId');
      if (typeof actorId !== 'string' || !actorId.trim() || typeof requestId !== 'string' || !requestId.trim()) {
        return {
          schema: 'atlas.verified-context-result.v1' as const,
          status: 'REFUSED' as const,
          requestId: typeof requestId === 'string' && requestId ? requestId : 'unbound',
          refusalCode: 'MASTRA_AUTHORITY_CONTEXT_INVALID',
          firstFailingBoundary: 'WORKSPACE_AUTHORITY',
          receipt: { canonicalAuthority: false, writesPerformed: false },
          canonicalAuthority: false as const,
          writesPerformed: false as const,
        };
      }
      let result: z.infer<typeof VerifiedContextToolOutput>;
      try {
        result = await service.execute(actorId, { ...input, requestId });
      } catch {
        return {
          schema: 'atlas.verified-context-result.v1' as const,
          status: 'REFUSED' as const,
          requestId,
          refusalCode: 'VERIFIED_CONTEXT_SERVICE_FAILED',
          firstFailingBoundary: 'VERIFIED_CONTEXT_SERVICE',
          receipt: { canonicalAuthority: false, writesPerformed: false },
          canonicalAuthority: false as const,
          writesPerformed: false as const,
        };
      }
      let readback: z.infer<typeof VerifiedContextToolOutput>;
      try {
        readback = service.verifyMastraReadback(result);
      } catch {
        return {
          schema: 'atlas.verified-context-result.v1' as const,
          status: 'REFUSED' as const,
          requestId,
          refusalCode: 'MASTRA_READBACK_FAILED',
          firstFailingBoundary: 'MASTRA_READBACK',
          receipt: { canonicalAuthority: false, writesPerformed: false },
          canonicalAuthority: false as const,
          writesPerformed: false as const,
        };
      }
      const verified = VerifiedContextToolOutput.safeParse(readback);
      if (!verified.success) {
        return {
          schema: 'atlas.verified-context-result.v1' as const,
          status: 'REFUSED' as const,
          requestId,
          refusalCode: 'MASTRA_READBACK_NOT_VERIFIED',
          firstFailingBoundary: 'MASTRA_READBACK',
          receipt: { reason: 'OUTPUT_CONTRACT_INVALID', canonicalAuthority: false, writesPerformed: false },
          canonicalAuthority: false as const,
          writesPerformed: false as const,
        };
      }
      return verified.data;
    },
  });
}
