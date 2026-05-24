import { ENV } from '$lib/server/env.server.js';

export async function compareDocuments(document1: string, document2: string): Promise<any> {
    const ollamaUrl = ENV.OLLAMA_BASE_URL;
    const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
	model: "gemma4-rotorquant:latest",
            prompt: `Compare the two legal documents and provide differences, risks, and recommendations.

Document 1:
${document1.substring(0, 2000)}

Document 2:
${document2.substring(0, 2000)}`,
            options: {
	temperature: 0.2, num_predict: 2000 }
        })
    });
    const data = await res.json();
    return data.response;
}
