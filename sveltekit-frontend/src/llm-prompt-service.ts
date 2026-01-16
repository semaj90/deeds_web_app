/**
 * LLM Prompt Persistence Service
 * Manages storage and retrieval of LLM prompts and responses
 * Task 11: Implement prompt persistence
 * Feature: agentic-error-analysis-diffs, Property 3: Prompt Persistence Round-Trip
 * Validates: Requirements 3.1: 3.3: 3.4
 */

import { BaseService } from './base-service.js';
import type { LLMPrompt, LLMResponse, ServiceConfig } from './types.js';

export interface ILLMPromptService {
	storePrompt(errorId: string, prompt: string, response: LLMResponse): Promise<LLMPrompt>;
	retrievePrompt(promptId: string): Promise<LLMPrompt | null>;
	retrievePromptsByError(errorId: string): Promise<LLMPrompt[]>;
	retrievePromptHistory(limit?: number, offset?: number): Promise<LLMPrompt[]>;
	updatePrompt(promptId: string, updates: Partial<LLMPrompt>): Promise<LLMPrompt>;
	deletePrompt(promptId: string): Promise<void>;
	getPromptStats(): Promise<{ total: number; byModel: Record<string, number> }>;
}

export class LLMPromptService extends BaseService implements ILLMPromptService {
	private prompts: Map<string, LLMPrompt> = new Map();
	private errorIdIndex: Map<string, string[]> = new Map();
	private nextId = 1;

	constructor(config: ServiceConfig) {
		super(config);
	}

	/**
	 * Store a prompt and response
	 * Property 3: Prompt Persistence Round-Trip - prompts must survive storage/retrieval
	 */
	async storePrompt(errorId: string, prompt: string, response: LLMResponse): Promise<LLMPrompt> {
		if (!errorId || typeof errorId !== 'string') {
			throw new Error('Invalid input: errorId must be a non-empty string');
		}

		if (!prompt || typeof prompt !== 'string') {
			throw new Error('Invalid input: prompt must be a non-empty string');
		}

		this.validateInput(response, 'response');

		this.log('info', `Storing prompt for error ${errorId}`);

		try {
			const promptRecord: LLMPrompt = {
				id: `prompt-${this.nextId++}`,
				errorId,
				prompt,
				response: response.text,
				model: response.model,
				tokens: response.tokens,
				confidence: 0.5, // Default, can be updated
				createdAt: new Date(),
				updatedAt: new Date()
			};

			// Store in memory
			this.prompts.set(promptRecord.id, promptRecord);

			// Index by error ID
			if (!this.errorIdIndex.has(errorId)) {
				this.errorIdIndex.set(errorId, []);
			}
			this.errorIdIndex.get(errorId)!.push(promptRecord.id);

			this.log('info', `Prompt ${promptRecord.id} stored successfully`);
			return promptRecord;
		} catch (error) {
			this.log('error', 'Prompt storage failed', error);
			throw error;
		}
	}

	/**
	 * Retrieve a specific prompt by ID
	 */
	async retrievePrompt(promptId: string): Promise<LLMPrompt | null> {
		if (!promptId || typeof promptId !== 'string') {
			throw new Error('Invalid input: promptId must be a non-empty string');
		}

		this.log('info', `Retrieving prompt ${promptId}`);

		try {
			const prompt = this.prompts.get(promptId) ?? null;

			if (prompt) {
				this.log('info', `Prompt ${promptId} retrieved successfully`);
			} else {
				this.log('info', `Prompt ${promptId} not found`);
			}

			return prompt;
		} catch (error) {
			this.log('error', 'Prompt retrieval failed', error);
			throw error;
		}
	}

	/**
	 * Retrieve all prompts for a specific error
	 */
	async retrievePromptsByError(errorId: string): Promise<LLMPrompt[]> {
		if (!errorId || typeof errorId !== 'string') {
			throw new Error('Invalid input: errorId must be a non-empty string');
		}

		this.log('info', `Retrieving prompts for error ${errorId}`);

		try {
			const promptIds = this.errorIdIndex.get(errorId) || [];.map((id) => this.prompts.get(id))
				.filter((p) => p !== undefined) as LLMPrompt[];

			// Sort by creation date descending (newest first)
			prompts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

			this.log('info', `Retrieved ${prompts.length} prompts for error ${errorId}`);
			return prompts;
		} catch (error) {
			this.log('error', 'Prompt retrieval failed', error);
			throw error;
		}
	}

	/**
	 * Retrieve prompt history with pagination
	 */
	async retrievePromptHistory(limit = 10, offset = 0): Promise<LLMPrompt[]> {
		if (limit < 1) {
			throw new Error('Invalid input: limit must be at least 1');
		}

		if (offset < 0) {
			throw new Error('Invalid input: offset must be non-negative');
		}

		this.log('info', `Retrieving prompt history (limit: ${limit}, offset, ${offset})`);

		try {
			const allPrompts = Array.from(this.prompts.values());

			// Sort by creation date descending
			allPrompts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

			// Apply pagination
			const results = allPrompts.slice(offset, offset + limit);

			this.log('info', `Retrieved ${results.length} prompts from history`);
			return results;
		} catch (error) {
			this.log('error', 'History retrieval failed', error);
			throw error;
		}
	}

	/**
	 * Update a prompt record
	 */
	async updatePrompt(promptId: string, updates: Partial<LLMPrompt>): Promise<LLMPrompt> {
		if (!promptId || typeof promptId !== 'string') {
			throw new Error('Invalid input: promptId must be a non-empty string');
		}

		this.validateInput(updates, 'updates');

		this.log('info', `Updating prompt ${promptId}`);

		try {
			const existing = this.prompts.get(promptId);
			if (!existing) {
				throw new Error(`Prompt ${promptId} not found`);
			}

			const updated: LLMPrompt = {
				...existing,
				...updates,
				id: existing.id, // Don't allow ID changes
				errorId: existing.errorId, // Don't allow error ID changes
				createdAt: existing.createdAt, // Don't allow creation date changes
				updatedAt: new Date()
			};

			this.prompts.set(promptId, updated);
			this.log('info', `Prompt ${promptId} updated successfully`);
			return updated;
		} catch (error) {
			this.log('error', 'Prompt update failed', error);
			throw error;
		}
	}

	/**
	 * Delete a prompt
	 */
	async deletePrompt(promptId: string): Promise<void> {
		if (!promptId || typeof promptId !== 'string') {
			throw new Error('Invalid input: promptId must be a non-empty string');
		}

		this.log('info', `Deleting prompt ${promptId}`);

		try {
			const prompt = this.prompts.get(promptId);
			if (!prompt) {
				throw new Error(`Prompt ${promptId} not found`);
			}

			// Remove from main storage
			this.prompts.delete(promptId);

			// Remove from error ID index
			const errorPrompts = this.errorIdIndex.get(prompt.errorId);
			if (errorPrompts) {
				const index = errorPrompts.indexOf(promptId);
				if (index > -1) {
					errorPrompts.splice(index, 1);
				}
			}

			this.log('info', `Prompt ${promptId} deleted successfully`);
		} catch (error) {
			this.log('error', 'Prompt deletion failed', error);
			throw error;
		}
	}

	/**
	 * Get statistics about stored prompts
	 */
	async getPromptStats(): Promise<{ total: number; byModel: Record<string, number> }> {
		this.log('info', 'Calculating prompt statistics');

		try {
			const allPrompts = Array.from(this.prompts.values());
			const byModel: Record<string, number> = {};

			for (const prompt of allPrompts) {
				byModel[prompt.model] = (byModel[prompt.model] ?? 0) + 1;
			}

			const stats = {
				total: allPrompts.length,
				byModel
			};

			this.log(
				'info',
				`Prompt stats: ${stats.total} total, ${Object.keys(byModel).length} models`
			);
			return stats;
		} catch (error) {
			this.log('error', 'Stats calculation failed', error);
			throw error;
		}
	}
}



