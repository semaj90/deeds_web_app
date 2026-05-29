import { ENV } from '../env.server.js';

export async function suggestFix(query: string, atlasCards: any[]) {
  const relevant = atlasCards.slice(0, 3);

  const prompt = `
Given known failures:
${JSON.stringify(relevant, null, 2)}

User encountered: ${query}

Suggest a fix based on the known failures above.
`;

  const ollamaUrl = ENV.OLLAMA_BASE_URL;

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-rotorquant:latest',
      prompt: prompt,
      stream: false
    })
  });

  if (!res.ok) {
    return "Could not generate fix from Ollama.";
  }

  const json = await res.json();
  return json.response;
}
