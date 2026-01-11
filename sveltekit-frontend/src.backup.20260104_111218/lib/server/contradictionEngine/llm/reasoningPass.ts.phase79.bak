import type { FactContradiction, UIContradiction } from '../types.js';

const GEMMA_ENDPOINT = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export async function runReasoningPass(
 factContradictions: FactContradiction[],
 uiContradictions: UIContradiction[],
 ragSuggestions?: Record<string, unknown>
): Promise<string> {
 const prompt = `
You are the Phoenix Wright Contradiction Engine.
Analyze both factual contradictions and UI contradictions.

Factual contradictions:
${JSON.stringify(factContradictions, null, 2)}

UI contradictions:
${JSON.stringify(uiContradictions, null, 2)}

RAG suggestions:
${JSON.stringify(ragSuggestions, null, 2)}

Produce:
- logical explanation
- severity (critical | warning | none)
- recommended fix steps
- specify which contradiction should trigger the iconic "OBJECTION!"
Use dramatic tone but be precise.
`;

 const response = await fetch(`${GEMMA_ENDPOINT}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt,
 stream: false,
 }),
 });

 const payload = await response.json();
 return payload.response ?? payload.output ?? '';
}
