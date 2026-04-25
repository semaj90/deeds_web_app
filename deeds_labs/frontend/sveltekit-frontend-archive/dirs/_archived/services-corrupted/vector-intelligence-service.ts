/**
 * Vector Intelligence Service
 * Provides semantic search, recommendations, and analysis for legal documents
 */

// === Types ===

export interface VectorSearchResult {
	id: string;
	content: string;
	score: number;
	metadata?: Record<string, unknown>;
	source?: string;
	documentId?: string;
}

export interface IntelligenceRecommendation {
	id: string;
	title: string;
	description: string;
	relevanceScore: number;
	type: 'document' | 'case' | 'statute' | 'citation';
	metadata?: Record<string, unknown>;
}

export interface SemanticAnalysisResult {
	summary: string;
	entities: string[];
	topics: string[];
	sentiment: number;
	confidence: number;
	keyTerms: string[];
}

export interface VectorIntelligenceState {
	isSearching: boolean;
	isAnalyzing: boolean;
	lastQuery: string | null;
	results: VectorSearchResult[];
	recommendations: IntelligenceRecommendation[];
	error: string | null;
}

// === Service ===

class VectorIntelligenceService {
	private baseUrl: string;

	constructor(baseUrl = '/api/vector') {
		this.baseUrl = baseUrl;
	}

	async search(query: string, options?: { limit?: number; threshold?: number }): Promise<VectorSearchResult[]> {
		const res = await fetch(`${this.baseUrl}/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, ...options }),
		});
		if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
		const data = await res.json();
		return data.results ?? [];
	}

	async getRecommendations(documentId: string, limit = 5): Promise<IntelligenceRecommendation[]> {
		const res = await fetch(`${this.baseUrl}/recommendations?documentId=${documentId}&limit=${limit}`);
		if (!res.ok) throw new Error(`Recommendations failed: ${res.statusText}`);
		const data = await res.json();
		return data.recommendations ?? [];
	}

	async analyze(content: string): Promise<SemanticAnalysisResult> {
		const res = await fetch(`${this.baseUrl}/analyze`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content }),
		});
		if (!res.ok) throw new Error(`Analysis failed: ${res.statusText}`);
		return await res.json();
	}
}

export const vectorIntelligenceService = new VectorIntelligenceService();
