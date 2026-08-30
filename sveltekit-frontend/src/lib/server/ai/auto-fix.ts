import { bifrostChat } from '../ollama.js';
import { LLM_MODEL_ID } from '../llm/runtime-contract.js';

export async function suggestFix(query: string, atlasCards: any[]) {
  const relevant = atlasCards.slice(0, 3);

  const prompt = `
Given known failures:
${JSON.stringify(relevant, null, 2)}

User encountered: ${query}

Suggest a fix based on the known failures above.
`;

  return bifrostChat(
    [{ role: 'user', content: prompt }],
    LLM_MODEL_ID,
    { temperature: 0.2, maxTokens: 512, timeoutMs: 30_000 }
  ).catch(() => "Could not generate fix from llama-server.");
}
