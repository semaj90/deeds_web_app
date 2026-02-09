/**
 * TypeScript Types for Source Validation RAG
 * Mirrors Pydantic models from backend/api/source_validation_api.py
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.4)
 */

// ============================================================================
// Request Types
// ============================================================================

export interface KBSearchRequest {
	query: string;
	top_k?: number; // Default: 20
	filters?: Record<string, any>;
	include_codebase?: boolean; // Default: true
}

export interface SourceValidationRequest {
	case_id: string;
	query: string;
	selected_chunk_ids: string[];
	rejected_chunk_ids?: string[];
	validation_notes?: string;
}

export interface AnswerGenerationRequest {
	validation_id: string;
	case_id: string;
	query: string;
	llm_provider?: string; // Default: "gemma3-legal"
	max_tokens?: number; // Default: 2000
}

export interface KAGUpdateRequest {
	validation_id: string;
	entities_extracted: string[];
	relationships: Array<{
	from: string;
		to: string;
	type: string;
	}>;
}

// ============================================================================
// Response Types
// ============================================================================

export interface KBSearchResult {
	chunk_id: string;
	source_file: string;
	content: string;
	snippet_preview: string; // First 200 chars
	confidence_score: number; // 0.0 - 1.0
	source_type: 'documentation' | 'code' | 'error_fix' | 'community';
	metadata: Record<string, any>;
}

export interface KBSearchResponse {
	query: string;
	results: KBSearchResult[];
	total_found: number;
	search_timestamp: string; // ISO 8601 datetime
}

export interface SourceValidationResponse {
	validation_id: string;
	approved_chunks: KBSearchResult[];
	timestamp: string; // ISO 8601 datetime
	ready_for_answer: boolean;
}

export interface CitationMetadata {
	chunk_id: string;
	source_file: string;
	snippet: string;
	used_in_answer: boolean;
	confidence: number;
}

export interface AnswerGenerationResponse {
	answer: string;
	citations: CitationMetadata[];
	validation_id: string;
	llm_provider: string;
	timestamp: string; // ISO 8601 datetime
}

export interface KAGUpdateResponse {
	status: 'success' | 'error';
	entities_stored: number;
	relationships_stored: number;
	validation_id: string;
}

export interface HealthCheckResponse {
	status: 'healthy' | 'unhealthy';
	qdrant?: {
	collection: string;
		vectors: number;
	};
	couchdb?: Record<string, any>;
	error?: string;
	timestamp: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface ValidationUIState {
	// Search phase
	searchQuery: string;
	searchResults: KBSearchResult[];
	isSearching: boolean;
	searchError: string | null;

	// Validation phase
	selectedChunks: Set<string>;
	rejectedChunks: Set<string>;
	validationNotes: string;
	validationId: string | null;
	isValidating: boolean;
	validationError: string | null;

	// Answer phase
	generatedAnswer: string | null;
	citations: CitationMetadata[];
	isGenerating: boolean;
	generationError: string | null;

	// KAG phase
	extractedEntities: string[];
	extractedRelationships: Array<{ from: string, to: string; type: string }>;
	isUpdatingKAG: boolean;
	kagError: string | null;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface SourceValidatorProps {
	caseId: string;
	chunks?: any[];
	isLoading?: boolean;
	onValidate?: (selectedIds: string[]) => void;
	onCancel?: () => void;
	onValidationComplete?: (validationId: string, approvedChunks: KBSearchResult[]) => void;
	initialQuery?: string;
	query?: string;
}

export interface AnswerGeneratorProps {
	validationId: string;
	caseId: string;
	query: string;
	onAnswerGenerated?: (answer: string, citations: CitationMetadata[]) => void;
	llmProvider?: string;
}

export interface CitationInspectorProps {
	citation: CitationMetadata;
	isOpen: boolean;
	onClose: () => void;
}

export interface ProvenanceGraphProps {
	validationId: string;
	entities: string[];
	relationships: Array<{ from: string, to: string; type: string }>;
	width?: number;
	height?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type SourceType = 'documentation' | 'code' | 'error_fix' | 'community';

export interface SourceTypeMetadata {
	label: string;
	color: string;
	icon: string;
	description: string;
}

export const SOURCE_TYPE_CONFIG: Record<SourceType, SourceTypeMetadata> = {
	documentation: {
	label: 'Documentation',
		color: 'blue',
		icon: '📖',
		description: 'Official documentation and guides'
	},
	code: {
	label: 'Code',
		color: 'green',
		icon: '💻',
		description: 'Source code files from codebase'
	},
	error_fix: {
	label: 'Error Fix',
		color: 'yellow',
		icon: '🔧',
		description: 'Previously resolved error fixes'
	},
	community: {
	label: 'Community',
		color: 'purple',
		icon: '👥',
		description: 'Community discussions and Q&A'
	}
};

// ============================================================================
// Validation Helpers
// ============================================================================

export function isHighConfidence(score: number): boolean {
	return score >= 0.9;
}

export function isMediumConfidence(score: number): boolean {
	return score >= 0.7&& score < 0.9;
}

export function isLowConfidence(score: number): boolean {
	return score < 0.7;
}

export function getConfidenceLabel(score: number): string {
	if (isHighConfidence(score)) return 'High';
	if (isMediumConfidence(score)) return 'Medium';
	return 'Low';
}

export function getConfidenceColor(score: number): string {
	if (isHighConfidence(score)) return 'green';
	if (isMediumConfidence(score)) return 'yellow';
	return 'red';
}

// ============================================================================
// API Error Types
// ============================================================================

export interface APIError {
	detail: string;
	status?: number;
}

export class SourceValidationError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly detail?: string
	) {
		super(message);
		this.name = 'SourceValidationError';
	}
}




