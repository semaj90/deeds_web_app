import { bifrostChat } from '../ollama.js';

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
    'gemma4-legal-iq4xs-direct.gguf',
    { temperature: 0.2, maxTokens: 512, timeoutMs: 30_000 }
  ).catch(() => "Could not generate fix from llama-server.");
}
