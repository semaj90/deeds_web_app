import { bifrostChat } from '$lib/server/ollama.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

export async function runCustomAnalysis(content: string, prompt: string): Promise<any> {
    return bifrostChat(
        [{ role: 'user', content: `${prompt}\n\nDocument content:\n${content.substring(0, 4000)}` }],
        LLM_MODEL_ID,
        { temperature: 0.2, maxTokens: 2000 }
    );
}
