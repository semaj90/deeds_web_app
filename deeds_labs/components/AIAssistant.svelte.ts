import { ENV_CONFIG } from '$lib/config/env.js';

export class AIAssistant {
    isLoading = $state(false);
    response = $state('');

    private resolveOllamaEndpoint() {
        return ENV_CONFIG.OLLAMA_URL;
    }

    async queryOllama(prompt: string) {
        this.isLoading = true;
        try {
            const ollamaUrl = this.resolveOllamaEndpoint();
            const resp = await fetch(`${ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
model: 'gemma4-legal:latest',
                    prompt,
                    stream: false
                })
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            this.response = (data && (data.response ?? data.output)) ?? JSON.stringify(data) ?? '';
        } catch (error) {
            if (error instanceof Error) {
                this.response = `Error: ${error.message}`;
            } else {
                this.response = 'Error connecting to AI';
            }
        } finally {
            this.isLoading = false;
        }
    }
}
