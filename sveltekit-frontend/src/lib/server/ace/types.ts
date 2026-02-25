/**
 * ACE (Agentic Contextual Engineering) — Core Types
 *
 * Defines the data structures for adaptive prompt assembly,
 * self-evaluation, and tag generation.
 */

export interface ACEUserProfile {
	userId: string;
	topIntents: string[];
	preferredTone: 'formal' | 'concise' | 'explanatory';
	avgLatencyMs: number;
	cacheHitRate: number;
	recentQueries: Array<{ hash: string; preview: string }>;
	practiceAreas: string[];
	jurisdiction: string | null;
	experienceLevel: string | null;
}

export interface ACEContext {
	/** User behavioral profile from analytics */
	userProfile: ACEUserProfile | null;
	/** Case context string (from DB load) */
	caseContext: string | null;
	/** RAG chunks from Qdrant vector search */
	ragChunks: Array<{ content: string; score: number; source: string }>;
	/** KAG graph neighbors from Neo4j or PostgreSQL */
	kagNeighbors: Array<{ nodeId: string; title: string; relationship: string; score?: number }>;
	/** Chat history (recent turns) */
	chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
	/** NER-extracted entities from the current query */
	entities: {
		statutes: string[];
		cases: string[];
		persons: string[];
		organizations: string[];
		dates: string[];
	};
	/** Practice area template (auto-selected or user-specified) */
	practiceTemplate: string | null;
	/** Auto-generated tags for the current query */
	queryTags: string[];
}

export interface ACEPrompt {
	/** Complete system prompt with all context */
	systemPrompt: string;
	/** Assembled context window for injection */
	contextWindow: string;
	/** Max tokens allocated for this prompt */
	maxTokenBudget: number;
	/** Confidence factors for each context source */
	confidenceFactors: Record<string, number>;
	/** Self-prompt instructions appended for quality control */
	selfPromptInstructions: string | null;
	/** Which inference backend to prefer */
	preferredBackend: 'tensorrt' | 'ollama' | 'auto';
}

export interface SelfEvaluation {
	/** Overall quality score 0-1 */
	quality: number;
	/** How complete the answer is 0-1 */
	completeness: number;
	/** Estimated factual accuracy 0-1 */
	accuracy: number;
	/** Improvement suggestions */
	suggestions: string[];
	/** Whether to retry with correction prompt */
	shouldRetry: boolean;
	/** Time taken for evaluation in ms */
	evalMs: number;
}

export interface GeneratedTag {
	label: string;
	category: 'statute' | 'case_law' | 'entity' | 'practice_area' | 'topic' | 'jurisdiction';
	confidence: number;
	source: 'regex' | 'ner' | 'llm' | 'manual';
}

/** Token budget allocation per context source */
export const TOKEN_BUDGET = {
	system: 200,
	caseContext: 300,
	ragChunks: 600,
	kagNeighbors: 200,
	chatHistory: 400,
	userProfile: 100,
	selfPrompt: 100,
	total: 1900
} as const;
