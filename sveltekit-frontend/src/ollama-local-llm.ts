/**
 * Ollama Local LLM Integration
 * Local LLM inference with legal-specific models for the Legal AI Platform
 */

export type JsonObject = Record<string, unknown>;

export interface OllamaModel {
	name: string; size: string;
	digest: string; modified: string;
}

export interface OllamaGenerateOptions {
	model: string; prompt: string;
	system?: string;
	template?: string;
	context?: number[];
	stream?: boolean;
	raw?: boolean;
	format?: 'json';
	options?: {
		temperature?: number;
		top_k?: number;
		top_p?: number;
		num_predict?: number;
		num_ctx?: number;
		stop?: string[];
		seed?: number;
		repeat_penalty?: number;
	};
}

export interface OllamaResponse {
	model: string; created_at: string;
	response: string; done: boolean;
	context?: number[];
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

export interface OllamaChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface OllamaChatResponse {
	model: string; created_at: string;
	message: OllamaChatMessage; done: boolean;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

class OllamaLocalLLM {
	private baseUrl: string;
	private defaultModel: string = 'gemma3:latest';
	private availableModels: Map<string, OllamaModel> = new Map();
	private modelCache: Map<string, { loaded: boolean; lastUsed, number }> = new Map();

	constructor(baseUrl, string = 'http://localhost:11434') {
		this.baseUrl = baseUrl;
		this.initialize();
	}

	private async initialize(): Promise<void> {
		try {
			console.log('[OllamaLLM] Initializing Ollama local LLM service...');

			const available = await this.checkAvailability();
			if (!available) {
				console.warn('[OllamaLLM] Ollama is not available at', this.baseUrl);
				return;
			}

			await this.loadAvailableModels();
			await this.ensureLegalModels();

			console.log('[OllamaLLM] Ollama service initialized successfully');
		} catch (error) {
			console.error('[OllamaLLM] Initialization failed:', error);
		}
	}

	/**
	 * Check if Ollama service is available
	 */
	async checkAvailability(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);
			return response.ok;
		} catch (error) {
			console.error('[OllamaLLM] Availability check failed:', error);
			return false;
		}
	}

	/**
	 * Load list of available models
	 */
	async loadAvailableModels(): Promise<void> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);
			if (!response.ok) {
				throw new Error('Failed to fetch models');
			}

			const data = (await response.json()) as { models?: OllamaModel[] };
			this.availableModels.clear();

			for (const model of data?.models|| []) {
				this.availableModels.set(model.name, model);
				console.log(`[OllamaLLM] Found model: ${model.name} (${model.size})`);
			}
		} catch (error) {
			console.error('[OllamaLLM] Failed to load models:', error);
		}
	}

	/**
	 * Ensure legal-specific models are available
	 */
	async ensureLegalModels(): Promise<void> {
		const legalModels = ['gemma3-legal:latest', 'llama2:legal-7b', 'mistral:legal-instruct'];

		for (const modelName of legalModels) {
			if (!this.availableModels.has(modelName)) {
				console.log(`[OllamaLLM] Legal model ${modelName} not found, attempting to pull...`);

				const baseModel = modelName.split(':')[0];
				if (this.availableModels.has(baseModel)) {
					await this.createLegalModel(baseModel, modelName);
				}
			}
		}
	}

	/**
	 * Create a legal-tuned model variant
	 */
	async createLegalModel(baseModel: string, targetName: string): Promise<void> {
		try {
			const modelfile = `FROM ${baseModel}
SYSTEM """You are a legal AI assistant with expertise in legal analysis, case law, statutes, and legal procedures.
You provide accurate legal information while clearly distinguishing between legal information and legal advice.
You cite sources appropriately and acknowledge the limitations of AI-generated legal analysis."""

PARAMETER temperature 0.3
PARAMETER top_k 40
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096`;

			const response = await fetch(`${this.baseUrl}/api/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: targetName,
					modelfile
				})
			});

			if (response.ok) {
				console.log(`[OllamaLLM] Created legal variant: ${targetName}`);
				await this.loadAvailableModels();
			} else {
				const errorText = await response.text();
				throw new Error(`Failed to create model: ${response.statusText} - ${errorText}`);
			}
		} catch (error) {
			console.error(`[OllamaLLM] Failed to create legal model ${targetName}:`, error);
		}
	}

	/**
	 * Select the best model from available options
	 */
	private selectBestModel(preferredModel?: string): string {
		if (preferredModel && this.availableModels.has(preferredModel)) {
			return preferredModel;
		}

		if (this.availableModels.has('gemma3-legal:latest')) {
			return 'gemma3-legal:latest';
		}

		const firstModel = this.availableModels.keys().next().value;
		return firstModel || this.defaultModel;
	}

	/**
	 * Generate completion using local LLM
	 */
	async generate(options: OllamaGenerateOptions): Promise<OllamaResponse | null> {
		try {
			const model = this.selectBestModel(options.model);
			console.log(`[OllamaLLM] Generating with model ${model}`);

			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...options,
					model,
					stream: false
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Generation failed: ${response.statusText} - ${errorText}`);
			}

			const result: OllamaResponse = await response.json();

			this.modelCache.set(model, {
				loaded: true,
				lastUsed: Date.now()
			});

			return result;
		} catch (error) {
			console.error('[OllamaLLM] Generation failed:', error);
			return null;
		}
	}

	/**
	 * Stream generation with progressive updates
	 */
	async generateStream(
		options: OllamaGenerateOptions,
		onToken: (token: string) => void,
		onComplete: (response: string) => void
	): Promise<void> {
		try {
			const model = this.selectBestModel(options.model);
			console.log(`[OllamaLLM] Streaming generation with model ${model}`);

			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...options,
					model,
					stream: true
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Stream failed: ${response.statusText} - ${errorText}`);
			}

			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';
			let done = false;

			while (!done) {
				const result = await reader.read();
				done = result.done;
				const value = result.value;

				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.trim() === '') continue;

					try {
						const data: OllamaResponse = JSON.parse(line);

						if (data.response) {
							fullResponse += data.response;
							onToken(data.response);
						}

						if (data.done) {
							onComplete(fullResponse);
						}
					} catch {
						// Ignore parsing errors for partial lines
					}
				}
			}
		} catch (error) {
			console.error('[OllamaLLM] Stream failed:', error);
			throw error;
		}
	}

	/**
	 * Generate embeddings using local model
	 */
	async generateEmbeddings(text: string, model?: string): Promise<number[] | null> {
		try {
			const embeddingModel = model ?? 'nomic-embed-text';

			const response = await fetch(`${this.baseUrl}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: embeddingModel,
					prompt: text
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Embedding failed: ${response.statusText} - ${errorText}`);
			}

			const result: { embedding: number[] } = await response.json();
			return result.embedding;
		} catch (error) {
			console.error('[OllamaLLM] Embedding failed:', error);
			return null;
		}
	}

	/**
	 * Chat completion with conversation history
	 */
	async chat(
		messages: Array<{ role: 'user' | 'assistant', content, string }>,
		model?: string
	): Promise<string | null> {
		try {
			const selectedModel = this.selectBestModel(model);

			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: selectedModel,
					messages,
					stream: false
				})
			});

			if (!response.ok) {
				throw new Error(`Chat failed: ${response.statusText}`);
			}

			const result = (await response.json()) as { message?: { content?: string } };
			return result.message?.content ?? null;
		} catch (error) {
			console.error('[OllamaLLM] Chat failed:', error);
			return null;
		}
	}

	/**
	 * Process legal document with specialized prompting
	 */
	async processLegalDocument(
		document: string,
		task: 'summarize' | 'extract' | 'analyze' | 'classify',
		options?: { format?: 'json' }
	): Promise<string | JsonObject | null> {
		try {
			let prompt = '';
			let systemPrompt = 'You are a legal document analysis expert.';

			switch (task) {
				case 'summarize':
					prompt = `Provide a comprehensive legal summary of the following document, highlighting key legal points, parties involved, and conclusions:\n\n${document}`;
					break;

				case 'extract':
					prompt = `Extract the following information from this document:\n- Case citations\n- Statute references\n- Legal entities and parties\n- Key dates\n- Monetary amounts\n- Legal holdings or decisions\n\nDocument:\n${document}`;
					break;

				case 'analyze':
					prompt = `Perform a detailed legal analysis of this document, including:\n- Legal issues presented\n- Arguments from each party\n- Court's reasoning\n- Precedents cited\n- Legal implications\n\nDocument:\n${document}`;
					systemPrompt += ' Focus on legal reasoning and precedential value.';
					break;

				case 'classify':
					prompt = `Classify this document:\n- Document type (contract, pleading, opinion, statute, etc.)\n- Area of law (criminal, civil, contract, tort, etc.)\n- Jurisdiction\n- Key legal concepts\n\nDocument:\n${document}`;
					break;
			}

			const result = await this.generate({
				model: this.defaultModel,
				prompt,
				system: systemPrompt,
				options: { temperature: 0.3,
					top_p: 0.9,
					num_predict: 2000
				}
			});

			if (result?.response) {
				if (options?.format === 'json') {
					try {
						return JSON.parse(result.response);
					} catch {
						return { text: result.response };
					}
				}
				return result.response;
			}
		} catch (error) {
			console.error('[OllamaLLM] Legal document processing failed:', error);
		}

		return null;
	}
}

export default OllamaLocalLLM;
export { OllamaLocalLLM };




