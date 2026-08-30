import { bifrostChat } from '$lib/server/ollama.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

export async function compareDocuments(document1: string, document2: string): Promise<any> {
    return bifrostChat(
        [{
            role: 'user',
            content: `Compare the two legal documents and provide differences, risks, and recommendations.

Document 1:
${document1.substring(0, 2000)}

Document 2:
${document2.substring(0, 2000)}`
        }],
        LLM_MODEL_ID,
        { temperature: 0.2, maxTokens: 2000 }
    );
}
