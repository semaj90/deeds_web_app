import {
  executeOrnithPromptPlanV1,
  ORNITH_MODEL_ID,
  type OrnithPromptPlanViewV1,
} from './ornith-prompt-plan-adapter.js';

export interface OrnithSynthesisNodeInputV1 {
  prompt_plan: unknown;
  prompt_segment_content: unknown[];
  step?: number;
  baseUrl?: string;
  expectedModel?: string;
  fetchImpl?: typeof fetch;
}

export interface OrnithSynthesisNodeResultV1 {
  synthesis?: string;
  error?: string;
  step: number;
}

/** LangGraph synthesis-node seam; execution only, with no persistence. */
export async function runOrnithSynthesisNodeV1(
  input: OrnithSynthesisNodeInputV1,
): Promise<OrnithSynthesisNodeResultV1> {
  try {
    const baseUrl = String(
      input.baseUrl ??
      process.env.TURBOQUANT_BASE_URL ??
      process.env.TURBOQUANT_URL ??
      'http://127.0.0.1:8090',
    ).replace(/\/v1\/?$/, '').replace(/\/$/, '');
    const result = await executeOrnithPromptPlanV1({
      baseUrl,
      expectedModel: input.expectedModel ?? (process.env.ORNITH_MODEL_ID?.trim() || ORNITH_MODEL_ID),
      promptPlan: input.prompt_plan as OrnithPromptPlanViewV1,
      segmentContent: input.prompt_segment_content as Array<{ ordinal: number; content: string }>,
      fetchImpl: input.fetchImpl,
    });
    return {
      synthesis: result.content,
      step: (input.step ?? 0) + 1,
    };
  } catch (error) {
    return {
      error: `Ornith prompt-plan synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      step: (input.step ?? 0) + 1,
    };
  }
}
