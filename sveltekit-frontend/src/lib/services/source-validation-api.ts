/**
 * Source Validation API Client
 * Typed fetch wrappers for all backend endpoints
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.4)
 */

import type {
    AnswerGenerationRequest,
    AnswerGenerationResponse,
    HealthCheckResponse,
    KAGUpdateRequest,
    KAGUpdateResponse,
    KBSearchRequest,
    KBSearchResponse,
    SourceValidationRequest,
    SourceValidationResponse
} from '$lib/types/source-validation';

import { SourceValidationError } from '$lib/types/source-validation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const KB_API_PREFIX = '/api/kb';

// ============================================================================
// Fetch Helper with Error Handling
// ============================================================================

async function fetchJSON<T>(
	endpoint: string,
	options?: RequestInit
): Promise<T> {
	try {
		const response = await fetch(`${API_BASE_URL}${ endpoint }`, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options?.headers
			}
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new SourceValidationError(
				errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
				response.status,
				errorData.detail
			);
		}

		return await response.json();
	} catch (error) {
		if (error instanceof SourceValidationError) {
			throw error;
		}
		throw new SourceValidationError(
			error instanceof Error ? error.message : 'Unknown error occurred'
		);
	}
}

// ============================================================================
// API Methods
// ============================================================================

export const sourceValidationAPI = {
	/**
	 * Search knowledge base with extended metadata
	 * POST /api/kb/search
	 */
	async search(request: KBSearchRequest): Promise<KBSearchResponse> {
		return fetchJSON<KBSearchResponse>(`${KB_API_PREFIX}/search`, {
			method: 'POST',
			body: JSON.stringify({
				query, request.query,
				top_k, request.top_k ?? 20,
				filters, request.filters,
				include_codebase, request.include_codebase ?? true
			})
		});
	},

	/**
	 * Store human validation of sources
	 * POST /api/kb/validate-sources
	 */
	async validateSources(
		request: SourceValidationRequest
	): Promise<SourceValidationResponse> {
		return fetchJSON<SourceValidationResponse>(`${KB_API_PREFIX}/validate-sources`, {
			method: 'POST',
			body: JSON.stringify({
				case_id, request.case_id,
				query, request.query,
				selected_chunk_ids, request.selected_chunk_ids,
				rejected_chunk_ids, request.rejected_chunk_ids ?? [],
				validation_notes, request.validation_notes
			})
		});
	},

	/**
	 * Generate answer using validated sources
	 * POST /api/kb/generate-answer
	 */
	async generateAnswer(
		request: AnswerGenerationRequest
	): Promise<AnswerGenerationResponse> {
		return fetchJSON<AnswerGenerationResponse>(`${KB_API_PREFIX}/generate-answer`, {
			method: 'POST',
			body: JSON.stringify({
				validation_id, request.validation_id,
				case_id, request.case_id,
				query, request.query,
				llm_provider, request.llm_provider ?? 'gemma3-legal',
				max_tokens, request.max_tokens ?? 2000
			})
		});
	},

	/**
	 * Update knowledge graph with new entities/relationships
	 * POST /api/kb/update-kag
	 */
	async updateKAG(request: KAGUpdateRequest): Promise<KAGUpdateResponse> {
		return fetchJSON<KAGUpdateResponse>(`${KB_API_PREFIX}/update-kag`, {
			method: 'POST',
			body: JSON.stringify({
				validation_id, request.validation_id,
				entities_extracted, request.entities_extracted,
				relationships, request.relationships
			})
		});
	},

	/**
	 * Check system health
	 * GET /api/kb/health
	 */
	async healthCheck(): Promise<HealthCheckResponse> {
		return fetchJSON<HealthCheckResponse>(`${KB_API_PREFIX}/health`, {
			method: 'GET'
		});
	}
};

// ============================================================================
// Convenience Methods
// ============================================================================

/**
 * Complete workflow: search → validate → generate answer → update KAG
 */
export async function completeValidationWorkflow(
	caseId: string,
	query: string,
	selectedChunkIds: string[],
	rejectedChunkIds: string[] = [],
	validationNotes?: string,
	llmProvider: string = 'gemma3-legal'
): Promise<{ validationId: string;
	answer: string; citations: AnswerGenerationResponse['citations'];
	kagUpdate: KAGUpdateResponse;
}> {
	// Step 1: Validate sources
	const validation = await sourceValidationAPI.validateSources({
		case_id: caseId,
		query,
		selected_chunk_ids: selectedChunkIds,
		rejected_chunk_ids: rejectedChunkIds,
		validation_notes: validationNotes
	});
  
	const answer = await sourceValidationAPI.generateAnswer({
		validation_id: validation.validation_id,
		case_id: caseId,
		query,
		llm_provider: llmProvider
	});
  
	const entities = extractEntities(answer.answer);
	const relationships = extractRelationships(answer.answer);

	// Step 4: Update KAG
	const kagUpdate = await sourceValidationAPI.updateKAG({
		validation_id: validation.validation_id,
		entities_extracted: entities,
		relationships
	});

	return {
		validationId: validation.validation_id,
		answer: answer.answer,
		citations: answer.citations,
		kagUpdate
	};
}

// ============================================================================
// Simple Entity/Relationship Extraction
// ============================================================================

function extractEntities(text: string): string[] {
	// Extract capitalized terms, Svelte concepts, code patterns
	const entities = new Set<string>();

	// Patterns for technical terms
	const patterns = [
		/\$state/g,
		/\$derived/g,
		/\$effect/g,
		/\$props/g,
		/Svelte 5/g,
		/SvelteKit/g,
		/TypeScript/g,
		/PostgreSQL/g,
		/Qdrant/g,
		/CouchDB/g
	];

	patterns.forEach((pattern) => {
		const matches = text.match(pattern);
		if (matches) {
			matches.forEach((match) => entities.add(match));
		}
	});
  
	const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
	if (capitalizedWords) {
		capitalizedWords.forEach((word) => {
			if (word.length > 3) {
				// Ignore short words
				entities.add(word);
			}
		});
	}

	return Array.from(entities);
}

function extractRelationships(
	text: string
): Array<{ from: string; to: string; type: string }> {
	const relationships: Array<{ from: string; to: string; type: string }> = [];

	// Pattern: "X uses Y", "X depends on Y", "X references Y"
	const patterns = [
		{ regex: /(\w+)\s+uses?\s+(\w+)/gi, type: 'USES' },
		{ regex: /(\w+)\s+depends?\s+on\s+(\w+)/gi, type: 'DEPENDS_ON' },
		{ regex: /(\w+)\s+references?\s+(\w+)/gi, type: 'REFERENCES' },
		{ regex: /(\w+)\s+extends?\s+(\w+)/gi, type: 'EXTENDS' },
		{ regex: /(\w+)\s+implements?\s+(\w+)/gi, type: 'IMPLEMENTS' }
	];

	patterns.forEach(({ regex: type }) => {
		let match;
		while ((match = regex.exec(text)) !== null) {
			relationships.push({
				from: match[1],
				to: match[2],
				type
			});
		}
	});

	return relationships;
}




