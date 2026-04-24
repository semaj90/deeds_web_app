import type {
	ACEBudgetProfile,
	ACEBudgetTier,
	ACEContext,
	ACEParameterCompletion,
	ACEParameterSource,
	ACEPolicyAction,
	ACEPolicyDecision,
} from './types.js';
import { TOKEN_BUDGET } from './types.js';

export interface ToolExecutionPolicyContext {
	message?: string;
	caseId?: string;
	retrievalConfidence?: number | null;
	parameterHints?: Record<string, unknown>;
}

const WEB_FALLBACK_THRESHOLD = 0.58;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function scaleTokenBudget(multiplier: number): typeof TOKEN_BUDGET {
	const scaledEntries = Object.entries(TOKEN_BUDGET).map(([key, value]) => [
		key,
		Math.max(50, Math.round(value * multiplier)),
	]);
	return Object.fromEntries(scaledEntries) as typeof TOKEN_BUDGET;
}

function buildBudgetProfile(tier: ACEBudgetTier): ACEBudgetProfile {
	const multiplierByTier: Record<ACEBudgetTier, number> = {
		small: 0.72,
		medium: 0.88,
		large: 1,
		authority_heavy: 1.08,
		web_augmented: 1.04,
	};
	const allocations = scaleTokenBudget(multiplierByTier[tier]);

	const limitsByTier: Record<ACEBudgetTier, ACEBudgetProfile['limits']> = {
		small: {
			glossaryEntries: 2,
			kbChunkCount: 4,
			caseChunkCount: 4,
			mergedChunkCount: 5,
			chunkChars: 420,
			kagNeighborCount: 4,
			chatHistoryMessages: 4,
			chatMessageChars: 220,
			chatMemoryCount: 2,
			evidenceMetadataCount: 6,
			evidenceConnectionCount: 6,
			codebaseContextCount: 3,
		},
		medium: {
			glossaryEntries: 3,
			kbChunkCount: 6,
			caseChunkCount: 6,
			mergedChunkCount: 7,
			chunkChars: 520,
			kagNeighborCount: 6,
			chatHistoryMessages: 6,
			chatMessageChars: 280,
			chatMemoryCount: 3,
			evidenceMetadataCount: 10,
			evidenceConnectionCount: 10,
			codebaseContextCount: 4,
		},
		large: {
			glossaryEntries: 4,
			kbChunkCount: 8,
			caseChunkCount: 10,
			mergedChunkCount: 10,
			chunkChars: 600,
			kagNeighborCount: 10,
			chatHistoryMessages: 12,
			chatMessageChars: 400,
			chatMemoryCount: 6,
			evidenceMetadataCount: 15,
			evidenceConnectionCount: 20,
			codebaseContextCount: 8,
		},
		authority_heavy: {
			glossaryEntries: 5,
			kbChunkCount: 10,
			caseChunkCount: 8,
			mergedChunkCount: 10,
			chunkChars: 680,
			kagNeighborCount: 12,
			chatHistoryMessages: 8,
			chatMessageChars: 320,
			chatMemoryCount: 4,
			evidenceMetadataCount: 12,
			evidenceConnectionCount: 12,
			codebaseContextCount: 6,
		},
		web_augmented: {
			glossaryEntries: 4,
			kbChunkCount: 7,
			caseChunkCount: 7,
			mergedChunkCount: 8,
			chunkChars: 560,
			kagNeighborCount: 7,
			chatHistoryMessages: 6,
			chatMessageChars: 260,
			chatMemoryCount: 3,
			evidenceMetadataCount: 8,
			evidenceConnectionCount: 8,
			codebaseContextCount: 4,
		},
	};

	return {
		tier,
		allocations,
		limits: limitsByTier[tier],
	};
}

export function computeRetrievalConfidence(context: ACEContext): number {
	const kbTop = context.kbChunks[0]?.score ?? 0;
	const caseTop = context.caseChunks[0]?.score ?? 0;
	const ragTop = context.ragChunks[0]?.score ?? 0;
	const glossaryBoost = context.glossaryMatches?.length ? 0.12 : 0;
	const caseBoost = context.caseContext ? 0.1 : 0;
	const graphBoost = context.kagNeighbors.length ? Math.min(0.1, context.kagNeighbors.length * 0.015) : 0;
	return clamp(Math.max(kbTop, caseTop, ragTop) + glossaryBoost + caseBoost + graphBoost, 0.15, 0.98);
}

function selectBudgetTier(query: string, context: ACEContext, retrievalConfidence: number): ACEBudgetTier {
	const normalizedQuery = query.toLowerCase();
	const authorityHeavy = /statute|citation|precedent|case law|authority|constitutional|section\s+\d+/i.test(normalizedQuery);
	const hasWeb = Boolean(context.webSearchContext);
	const hasBroadContext = Boolean(context.caseContext) || context.caseChunks.length > 4 || context.evidenceMetadata?.length;

	if (hasWeb || retrievalConfidence < WEB_FALLBACK_THRESHOLD) return 'web_augmented';
	if (authorityHeavy || context.kagNeighbors.length >= 6) return 'authority_heavy';
	if (retrievalConfidence >= 0.78 && !hasBroadContext) return 'small';
	if (retrievalConfidence >= 0.62) return 'medium';
	return 'large';
}

export function determineACEPolicy(query: string, context: ACEContext): ACEPolicyDecision {
	const retrievalConfidence = computeRetrievalConfidence(context);
	const reasons: string[] = [];
	const missingParameters: string[] = [];
	let action: ACEPolicyAction = 'answer_direct';

	if (!context.caseContext && /this case|current case|for this matter|our filing/i.test(query)) {
		missingParameters.push('caseId');
		reasons.push('query references a case-specific answer without attached case context');
	}

	if (missingParameters.length > 0) {
		action = 'fill_parameters';
	} else if (retrievalConfidence < WEB_FALLBACK_THRESHOLD) {
		action = 'call_web_search';
		reasons.push('local retrieval confidence is low enough to justify external fallback');
	} else if (retrievalConfidence < 0.7 || context.kagNeighbors.length > 0) {
		action = 'expand_retrieval';
		reasons.push('local context exists but benefits from broader retrieval budget');
	}

	if (context.glossaryMatches?.length) {
		reasons.push(`glossary matches available (${context.glossaryMatches.length})`);
	}
	if (context.caseChunks.length) {
		reasons.push(`case evidence chunks available (${context.caseChunks.length})`);
	}
	if (context.kagNeighbors.length) {
		reasons.push(`graph neighbors available (${context.kagNeighbors.length})`);
	}

	const confidence = clamp(retrievalConfidence + (missingParameters.length === 0 ? 0.08 : -0.08), 0.2, 0.96);
	const budget = buildBudgetProfile(selectBudgetTier(query, context, retrievalConfidence));

	return {
		action,
		confidence,
		retrievalConfidence,
		reasons,
		missingParameters,
		allowWebSearch: retrievalConfidence < WEB_FALLBACK_THRESHOLD,
		budget,
	};
}

function addCompletion(
	completion: ACEParameterCompletion,
	key: string,
	value: unknown,
	source: ACEParameterSource,
	confidence: number
): void {
	completion.args[key] = value;
	completion.sources[key] = source;
	completion.confidence[key] = confidence;
	completion.filled[key] = true;
}

export function completeToolParameters(
	toolName: string,
	args: Record<string, unknown>,
	context: ToolExecutionPolicyContext = {}
): ACEParameterCompletion {
	const completion: ACEParameterCompletion = {
		args: { ...args },
		sources: {},
		confidence: {},
		missing: [],
		filled: {},
	};

	const requiredByTool: Record<string, string[]> = {
		glossary_search: ['query'],
		rag_search: ['query'],
		web_search: ['query'],
		graph_expand: ['caseId'],
		authority_drill: ['query'],
		case_search: ['query'],
	};

	const required = requiredByTool[toolName] ?? [];

	if (required.includes('query') && !completion.args.query) {
		const hintedQuery = context.parameterHints?.query;
		if (typeof hintedQuery === 'string' && hintedQuery.trim()) {
			addCompletion(completion, 'query', hintedQuery.trim(), 'parameter_hint', 0.78);
		} else if (context.message?.trim()) {
			addCompletion(completion, 'query', context.message.trim(), 'user_message', 0.92);
		}
	}

	if (required.includes('caseId') && !completion.args.caseId) {
		const hintedCaseId = context.parameterHints?.caseId;
		if (typeof hintedCaseId === 'string' && hintedCaseId.trim()) {
			addCompletion(completion, 'caseId', hintedCaseId.trim(), 'parameter_hint', 0.84);
		} else if (context.caseId?.trim()) {
			addCompletion(completion, 'caseId', context.caseId.trim(), 'active_case', 0.95);
		}
	}

	for (const key of required) {
		if (!completion.args[key]) completion.missing.push(key);
	}

	return completion;
}

export function shouldUseWebSearchFallback(retrievalConfidence?: number | null): boolean {
	if (retrievalConfidence == null) return true;
	return retrievalConfidence < WEB_FALLBACK_THRESHOLD;
}