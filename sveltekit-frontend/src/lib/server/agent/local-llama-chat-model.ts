import { ChatOpenAI } from '@langchain/openai';
import { ENV } from '$lib/server/env.server.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

/**
 * Shared OpenAI-compatible local llama-server model boundary for LangGraph
 * agents. Agent-specific code may choose temperature, but must not duplicate
 * the endpoint, local auth, or model identity wiring.
 */
export function createLocalLlamaChatModel(temperature = 0.3): ChatOpenAI {
  const baseUrl = (ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');

  return new ChatOpenAI({
    apiKey: 'local',
    configuration: { baseURL: `${baseUrl}/v1` },
    model: LLM_MODEL_ID,
    temperature,
  });
}
