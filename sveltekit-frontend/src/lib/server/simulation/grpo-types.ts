/**
 * GRPO Strategy Wizard Types
 *
 * Group Relative Policy Optimization "thinking" chain types.
 * Multi-step reasoning: RAG → KAG → Semantic → LLM Synthesis
 * producing 4 strategic recommendations with who/what/why/how taxonomy.
 */

export interface StrategyRecommendation {
	/** Wizard persona name (e.g., "Legal Strategist", "Evidence Analyst") */
	role: string;
	/** Target party — who this strategy involves (witness, defendant, judge, jury) */
	who: string;
	/** Specific legal action or argument to pursue */
	what: string;
	/** Legal reasoning grounded in retrieved canon/precedent */
	why: string;
	/** Step-by-step execution plan */
	how: string;
	/** LLM self-evaluation confidence 0–1 */
	confidence: number;
	/** Canon chunk IDs backing this recommendation */
	canonRefs: string[];
	/** Which search layers contributed evidence */
	sources: ('rag' | 'kag' | 'semantic')[];
}

export interface SearchTimings {
	rag_ms: number;
	kag_ms: number;
	semantic_ms: number;
	synthesis_ms: number;
	total_ms: number;
}

export interface StrategyResult {
	recommendations: StrategyRecommendation[];
	/** Chain-of-thought reasoning trace from the LLM */
	thinking: string;
	searchTimings: SearchTimings;
}
