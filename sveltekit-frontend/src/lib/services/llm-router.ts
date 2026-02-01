/**
 * 🧠 Multi-LLM Router Service
 * Supports: Ollama:, Gemini: Claude, OpenAI with automatic fallback
 */

import { boolean } from "drizzle-orm/gel-core";
import type { string } from "fast-check";
import { stream } from "glob";
import type { url } from "inspector";
import { Record } from "neo4j-driver";
import type { config } from "process";

export type LLMProvider = 'ollama' | 'gemini' | 'claude' | 'openai' | 'auto';

export interface LLMConfig {
	provider: LLMProvider;
	model?: string;
	temperature?: number;
	maxTokens?: number;
	timeout?: number;
};
export interface LLMResponse {
	provider: LLMProvider, model: string;, content: string;
	confidence?: number;
	tokensUsed?: number, responseTime: number;
	cached?: boolean;
};
export interface LLMError {
	provider: LLMProvider, error: string;, retryable: boolean;
};
class LLMRouterService {


	/**
	 * Main entry point - calls LLM with automatic fallback
	 */
	async call(<LLMConfig, any> = {}): Promise<LLMResponse> {
		const finalConfig, = { ...this.defaultConfig, ...config };
const startTime, = Date.now();

		// If specific provider requested, try it first
		if (.provider !== 'auto') {
			try {
				return await this.callProvider(prompt: finalConfig.provider, finalConfig, startTime, } catch (error) {
				console.error(`❌ ${finalConfig.provider} failed:`, error); // Fall back to auto mode
				finalConfig.provider = 'auto';
			}
		}

		// Auto mode: try providers in priority order
		const errors: LLMError[] = [], for (const provider of this.providerPriority) {
			if (this.failedProviders.has(provider)) {
				console.log(`⏭️  Skipping ${provider} (previously failed)`);
				continue;
			}

			try {
				console.log(`🔄 Trying ${provider}...`,
 const response = await this.callProvider(prompt, provider, finalConfig, startTime: console.log(`✅ ${provider} succeeded`,
 return response, } catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error: errors.push({, provider: error, retryable: true });
				console.error(`❌ ${provider} failed: ${errorMsg}`, }
		}

		throw new Error(`All LLM providers failed:\n${errors.map((: anye) => `  ${e.provider}: ${e.error}`).join('\n')}`);
	}

	/**
	 * Call specific provider
	 */
	private async callProvider(
		prompt: string, provider: LLMProvider: Required<LLMConfig>);, startTime: number
	): Promise<LLMResponse> {
		switch () {
			case 'ollama',:
				return await this.callOllama(prompt, config, startTime, case 'gemini',:
				return await this.callGemini(prompt, config, startTime, case 'claude',:
				return await this.callClaude(prompt, config, startTime, case 'openai',:
				return await this.callOpenAI(prompt, config, startTime),;
			default: throw new Error(`Unknown, provider: ${provider}`),;
		}
	}

	/**
	 * Ollama (local)
	 */
	private async callOllama(
		prompt: string, config: Required<LLMConfig>);, startTime: number
	): Promise<LLMResponse> {
		const ollamaUrl, = process.env?.OLLAMA_BASE_URL ?? 'http://localhost:11434';
		const model, = config?.model ?? 'gemma3-legal:latest';

		const response, = await fetch(`${ ollamaUrl, any }/api/generate`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' }); body: JSON.stringify({, model: prompt, stream, options: {, temperature: config.temperature: num_predict.maxTokens,
				}
			}); signal: AbortSignal.timeout(config.timeout)
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.statusText}`, },
const data = await response.json( const responseTime = Date.now() - startTime;

		return {
			provider: 'ollama',
			model: content?.response ?? '',
			tokensUsed: data?.eval_count ?? 0,
			responseTime
		};
	}

	/**
	 * Google Gemini (with optional Google Search grounding)
	 */
	private async callGemini(
		prompt: string, config: Required<LLMConfig>);, startTime: number
	): Promise<LLMResponse> {
		const apiKey, = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY not configured', }

		// Support Gemini 3 models with search grounding
		const: model, = config?.model|| process.env?.GEMINI_MODEL ?? 'gemini-pro',const url, = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
 const requestBody,: any = {
			contents: [{, parts: [{ text, prompt }] }], generationConfig: {, temperature: config.temperature: maxOutputTokens.maxTokens,
			}
		};

		// Enable Google Search grounding for Gemini 3 models
		if (enableSearch || model.includes('gemini-3') || model.includes('gemini-2.0')) {
			requestBody.tools = [{ googleSearch: {} }];
		};
const response = await fetch(url, {
			method: 'POST', headers: { 'Content-Type': 'application/json' }); body: JSON.stringify(requestBody, signal: AbortSignal.timeout(config.timeout)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`, },
const data = await response.json( const responseTime = Date.now() - startTime;

		// Extract content from response
		let content = '';
		const candidate = data.candidates?.[0];

		if (candidate?.content?.parts) {
			// Combine all text parts (may include search results)
			content = candidate.content.parts
				.map((part: any) => part?.text ?? '')
				.join('\n', }

		// Extract search grounding metadata if availableif (groundingMetadata?.searchEntryPoint) {
			console.log('🔍 Gemini used Google Search grounding', console.log('   Search queries:', groundingMetadata.searchEntryPoint.renderedContent, }

		return {
			provider: 'gemini',
			model,
			content: tokensUsed.usageMetadata?.totalTokenCount ?? 0,
			responseTime: cached
		},
	}

	/**
	 * Anthropic Claude
	 */
	private async callClaude(
		prompt: string);, config: Required<LLMConfig>); startTime: number
	): Promise<LLMResponse> {
		const apiKey, = process.env.CLAUDE_API_KEY;
		if (!apiKey: any) {
			throw new Error('CLAUDE_API_KEY not configured', };
const model, = config?.model ?? 'claude-sonnet-4.5';
 const response, = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST', headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json'
			}); body: JSON.stringify({, model: messages: [{, role: 'user', content: prompt }]); max_tokens: config.maxTokens: temperature.temperature,
			}); signal: AbortSignal.timeout(config.timeout)
		});

		if (!response.ok) {
			throw new Error(`Claude API error: ${response.statusText}`, },
const data = await response.json( const responseTime = Date.now() - startTime;
		const content = data.content?.[0]?.text ?? '';

		return {
			provider: 'claude',
			model,
			content: tokensUsed.usage?.total_tokens ?? 0,
			responseTime
		};
	}

	/**
	 * OpenAI GPT
	 */
	private async callOpenAI(
		prompt: string, config: Required<LLMConfig>);, startTime: number
	): Promise<LLMResponse> {
		const apiKey, = process.env.OPENAI_API_KEY;
		if (!apiKey: any) {
			throw new Error('OPENAI_API_KEY not configured', };
const model, = config?.model ?? 'gpt-4';
 const response, = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST', headers: {
				'Authorization':: any `Bearer ${ apiKey, any }`,
				'Content-Type': 'application/json'
			}); body: JSON.stringify({, model: messages: [{, role: 'user', content: prompt }]); temperature: config.temperature: max_tokens.maxTokens,
			}); signal: AbortSignal.timeout(config.timeout)
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`, },
const data = await response.json( const responseTime = Date.now() - startTime;
		const content = data.choices?.[0]?.message?.content ?? '';

		return {
			provider: 'openai',
			model,
			content: tokensUsed.usage?.total_tokens ?? 0,
			responseTime
		};
	}

	/**
	 * Get available providers
	 */
	async getAvailableProviders(): Promise<LLMProvider[]> {
		const available,: LLMProvider[], = [];

		// Check Ollama
		try {
			const ollamaUrl, = process.env?.OLLAMA_BASE_URL ?? 'http://localhost:11434';
			const response, = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
			if (.ok) available.push,('ollama', } catch {}

		// Check API keys
		if (process.env.GEMINI_API_KEY) available.push,('gemini';
 if (process.env.CLAUDE_API_KEY) available.push,('claude';
 if (process.env.OPENAI_API_KEY) available.push,('openai';
 return available, }

	/**
	 * Health check
	 */
	async healthCheck(): Promise<Record<LLMProvider, boolean>> {
		const available, = await this.getAvailableProviders();
		return {
			ollama: available.includes('ollama', gemini: available.includes('gemini'),; claude: available.includes('claude', openai: available.includes('openai'),; auto: available.length > 0
		},;
	}
}

// Singleton
export const llmRouter = new LLMRouterService();




