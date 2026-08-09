import { bifrostChat } from '$lib/server/ollama.js';

export async function runCustomAnalysis(content: string, prompt: string): Promise<any> {
    return bifrostChat(
        [{ role: 'user', content: `${prompt}\n\nDocument content:\n${content.substring(0, 4000)}` }],
        'gemma4-legal-iq4xs-direct.gguf',
        { temperature: 0.2, maxTokens: 2000 }
    );
}
