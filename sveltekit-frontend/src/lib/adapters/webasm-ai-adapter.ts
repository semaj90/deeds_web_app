/**
 * WebAssembly AI Adapter - Svelte 5 / SvelteKit 2
 * WebGPU with HTML/Canvas fallback
 */

import { browser } from '$app/environment';

export interface WebAssemblyAIConfig {
	ollamaEndpoint: string; pythonMiddlewareEndpoint: string; maxTokens: number; temperature: number; enableGPU: boolean; fallbackStrategy: 'ollama' | 'python' | 'auto';
}

export interface WebAssemblyAIResponse {
	content: string; metadata: { tokensGenerated: number; processingTime: number; confidence: number; method: 'ollama' | 'python' | 'fallback';
		modelUsed: string; fromCache: boolean; gpuAccelerated: boolean;
	};
}

export interface ConversationEntry {
	id: string; type: 'user' | 'assistant';
	content: string; timestamp: Date;
}

const defaultConfig: WebAssemblyAIConfig = {
	ollamaEndpoint: '/api/ai',
	pythonMiddlewareEndpoint: '/api/python-ai',
	maxTokens: 2048,
	temperature: 0.7,
	enableGPU: true,
	fallbackStrategy: 'auto'
};

export class WebAssemblyAIAdapter {
	private initialized = false;
	private config: WebAssemblyAIConfig;
	private currentModel = 'gemma3:2b';
	private gpuAvailable = false;
	private activeMethod: 'ollama' | 'python' | 'fallback' = 'fallback';

	constructor(config: Partial<WebAssemblyAIConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
	}

	async initialize(): Promise<boolean> {
		if (!browser) return false;
		if (this.initialized) return true;
		this.gpuAvailable = await this.detectGPU();
		this.activeMethod = await this.selectMethod();
		this.initialized = true;
		return true;
	}

	private async detectGPU(): Promise<boolean> {
		if (!browser) return false;
		try {
			if ('gpu' in navigator) {
				const gpu = navigator.gpu as GPU | undefined;
				if (gpu) {
					const adapter = await gpu.requestAdapter();
					if (adapter) return true;
				}
			}
			const canvas = document.createElement('canvas');
			return !!canvas.getContext('webgl2');
		} catch {
			return false;
		}
	}

	private async selectMethod(): Promise<'ollama' | 'python' | 'fallback'> {
		if (this.config.fallbackStrategy !== 'auto') return this.config.fallbackStrategy;
		try {
			const res = await fetch(this.config.ollamaEndpoint + '/health', { signal: AbortSignal.timeout(3000) });
			if (res.ok) return 'ollama';
		} catch { /* continue */ }
		try {
			const res = await fetch(this.config.pythonMiddlewareEndpoint + '/health', { signal: AbortSignal.timeout(3000) });
			if (res.ok) return 'python';
		} catch { /* continue */ }
		return 'fallback';
	}

	async sendMessage(message: string, options: { conversationHistory?: ConversationEntry[], temperature?: number, maxTokens?: number } = {}): Promise<WebAssemblyAIResponse> {
		if (!this.initialized) await this.initialize();
		const startTime = performance.now();
		const prompt = this.buildPrompt(message, options.conversationHistory || []);

		let response: WebAssemblyAIResponse;
		switch (this.activeMethod) {
			case 'ollama': response = await this.generateWithOllama(prompt, options); break;
			case 'python': response = await this.generateWithPython(prompt, options); break;
			default: response = this.generateFallback();
		}
		response.metadata.processingTime = performance.now() - startTime;
		return response;
	}

	private async generateWithOllama(prompt: string, options: { temperature?: number, maxTokens?: number }): Promise<WebAssemblyAIResponse> {
		const res = await fetch(this.config.ollamaEndpoint + '/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: this.currentModel, prompt, options: { num_predict: options.maxTokens || this.config.maxTokens, temperature: options.temperature || this.config.temperature }, stream: false })
		});
		if (!res.ok) throw new Error('Ollama error: ' + res.statusText);
		const data = await res.json();
		return { content: data.response || '', metadata: { tokensGenerated: Math.ceil((data.response || '').length / 4), processingTime: 0, confidence: 0.9, method: 'ollama', modelUsed: this.currentModel, fromCache: false, gpuAccelerated: this.gpuAvailable } };
	}

	private async generateWithPython(prompt: string, options: { temperature?: number, maxTokens?: number }): Promise<WebAssemblyAIResponse> {
		const res = await fetch(this.config.pythonMiddlewareEndpoint + '/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt, max_tokens: options.maxTokens || this.config.maxTokens, temperature: options.temperature || this.config.temperature, model: this.currentModel })
		});
		if (!res.ok) throw new Error('Python error: ' + res.statusText);
		const data = await res.json();
		return { content: data.text || data.response || '', metadata: { tokensGenerated: data.tokens_generated || Math.ceil((data.text || '').length / 4), processingTime: data.processing_time || 0, confidence: data.confidence || 0.85, method: 'python', modelUsed: this.currentModel, fromCache: data.from_cache || false, gpuAccelerated: this.gpuAvailable } };
	}

	private generateFallback(): WebAssemblyAIResponse {
		return { content: 'AI service is currently unavailable.', metadata: { tokensGenerated: 0, processingTime: 0, confidence: 0, method: 'fallback', modelUsed: 'none', fromCache: false, gpuAccelerated: false } };
	}

	private buildPrompt(message: string, history: ConversationEntry[]): string {
		let prompt = 'You are a helpful AI assistant.\n\n';
		for (const entry of history.slice(-10)) {
			prompt += entry.type.toUpperCase() + ': ' + entry.content + '\n';
		}
		prompt += 'USER: ' + message + '\nASSISTANT: ';
		return prompt;
	}

	getStatus(): { initialized: boolean; method: string; gpu: boolean } {
		return { initialized: this.initialized, method: this.activeMethod, gpu: this.gpuAvailable };
	}
}

export const webAssemblyAIAdapter = new WebAssemblyAIAdapter();



