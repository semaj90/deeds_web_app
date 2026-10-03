import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  prepareOrnithPromptPlanV1,
  type OrnithPromptPlanViewV1,
} from '@deeds/atlas-core/langgraph/ornith-prompt-plan-adapter';

export interface ExecuteMastraPromptPlanInputV1 {
  baseUrl: string;
  resolvedModel: string;
  promptPlan: OrnithPromptPlanViewV1;
  segmentContent: Array<{ ordinal: number; content: string }>;
  fetchImpl?: typeof fetch;
}

export interface MastraPromptPlanExecutionReceiptV1 {
  schema: 'atlas.mastra-prompt-plan-execution-receipt.v1';
  content: string;
  model: string;
  requestId: string;
  contextManifestChecksum: string;
  promptPlanChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
  durableStatePersisted: false;
}

/** Executes only a previously compiled and checksum-validated PromptPlan. */
export async function executeMastraPromptPlanV1(
  input: ExecuteMastraPromptPlanInputV1,
): Promise<MastraPromptPlanExecutionReceiptV1> {
  const prepared = prepareOrnithPromptPlanV1({
    promptPlan: input.promptPlan,
    segmentContent: input.segmentContent,
  });
  const modelId = input.resolvedModel.trim();
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  if (!modelId || !baseUrl) throw new Error('MASTRA_PROMPT_PLAN_MODEL_CONFIGURATION_MISSING');

  const provider = createOpenAICompatible({
    name: 'atlas-llama-server',
    baseURL: `${baseUrl}/v1`,
    fetch: input.fetchImpl,
    transformRequestBody: (body) => ({
      ...body,
      temperature: 0,
      top_p: 1,
      max_tokens: prepared.reservedOutputTokens,
      stream: false,
      cache_prompt: true,
      reasoning_effort: 'none',
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  const agent = new Agent({
    id: 'atlas-admitted-prompt-plan',
    name: 'Atlas admitted PromptPlan executor',
    instructions: '',
    model: provider.chatModel(modelId),
    tools: {},
    maxRetries: 0,
  });

  const messages = prepared.messages.map((message) => message.role === 'system'
    ? { role: 'system' as const, content: message.content }
    : { role: 'user' as const, content: message.content });
  const result = await agent.generate(messages, {
    model: provider.chatModel(modelId),
    modelSettings: { temperature: 0, topP: 1, maxOutputTokens: prepared.reservedOutputTokens },
    maxSteps: 1,
  });
  if (/<\/?think\b/i.test(result.text)) throw new Error('MASTRA_PROMPT_PLAN_HIDDEN_REASONING_MARKER_REJECTED');

  return {
    schema: 'atlas.mastra-prompt-plan-execution-receipt.v1',
    content: result.text,
    model: modelId,
    requestId: prepared.requestId,
    contextManifestChecksum: prepared.contextManifestChecksum,
    promptPlanChecksum: prepared.promptPlanChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
    durableStatePersisted: false,
  };
}
