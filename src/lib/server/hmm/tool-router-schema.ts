import { z } from 'zod';
import { HMM_TOOL_STATES, TOOL_IDS } from './tool-router-types';

const scoreSchema = z.number().finite().min(0).max(1);

export const hmmToolStateSchema = z.enum(HMM_TOOL_STATES);
export const toolIdSchema = z.enum(TOOL_IDS);

export const toolObservationSchema = z.object({
  query: z.string().min(1),
  keywordScore: scoreSchema,
  astIntentScore: scoreSchema,
  semanticScore: scoreSchema,
  graphScore: scoreSchema,
  packetValidationScore: scoreSchema,
  priorToolSuccess: scoreSchema,
  latencyScore: scoreSchema,
  state: hmmToolStateSchema.optional(),
});

export const rankedToolSchema = z.object({
  tool: toolIdSchema,
  score: z.number().finite().min(0),
  state: hmmToolStateSchema,
  allowed: z.boolean(),
  reason: z.string().min(1),
});

export const toolRouterContractSchema = z.object({
  schema: z.literal('atlas.hmm_tool_router.v1'),
  states: z.array(hmmToolStateSchema),
  tools: z.array(toolIdSchema),
  rules: z.object({
    gemma4_requires_packet_validation_min: z.number().min(0).max(1),
    quarantine_blocks_synthesis: z.boolean(),
    rg_first_for_code_location: z.boolean(),
    rrf_final_ranking: z.boolean(),
  }),
  smoke_gates: z.object({
    all_tools_indexed: z.boolean(),
    schema_valid: z.boolean(),
    ranked_top_tool_exists: z.boolean(),
    quarantine_blocks_gemma: z.boolean(),
  }),
});

