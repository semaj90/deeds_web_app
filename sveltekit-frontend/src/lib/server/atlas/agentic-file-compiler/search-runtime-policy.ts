export type SemanticExecutor = 'QDRANT' | 'CUVS_EXACT' | 'CAGRA' | 'DISKANN' | 'TURBOVEC';

export interface SemanticSearchRequirements {
	representation: 'semantic_768';
	exactness: 'REQUIRED' | 'APPROXIMATE_ALLOWED';
	corpusResidency: 'GPU_HOT' | 'RAM_WARM' | 'NVME_COLD' | 'REMOTE_PERSISTENT';
	gpuAvailable: boolean;
	freeVramBytes: number;
	minFreeVramBytes: number;
	diskAnnAvailable: boolean;
	qdrantAvailable: boolean;
	cagraAvailable: boolean;
	cuVsExactAvailable: boolean;
	turboVecAvailable?: boolean;
	allowTurboVecChallenger?: boolean;
}

export interface SemanticExecutorDecision {
	lane: 'semantic';
	representation: 'semantic_768';
	executor: SemanticExecutor;
	reason: string;
	voteKey: 'semantic';
}

export function chooseSemanticExecutor(input: SemanticSearchRequirements): SemanticExecutorDecision {
	if (input.representation !== 'semantic_768') {
		throw new Error('Parent Atlas semantic runtime requires semantic_768');
	}
	if (input.exactness === 'REQUIRED') {
		if (!input.cuVsExactAvailable) throw new Error('exact semantic search required but cuVS exact is unavailable');
		return { lane: 'semantic', representation: 'semantic_768', executor: 'CUVS_EXACT', reason: 'exact oracle required', voteKey: 'semantic' };
	}
	if (
		input.corpusResidency === 'GPU_HOT' && input.gpuAvailable && input.cagraAvailable &&
		input.freeVramBytes >= input.minFreeVramBytes
	) {
		return { lane: 'semantic', representation: 'semantic_768', executor: 'CAGRA', reason: 'hot GPU shard available within VRAM envelope', voteKey: 'semantic' };
	}
	if (input.corpusResidency === 'NVME_COLD' && input.diskAnnAvailable) {
		return { lane: 'semantic', representation: 'semantic_768', executor: 'DISKANN', reason: 'cold NVMe corpus', voteKey: 'semantic' };
	}
	if (input.qdrantAvailable) {
		return { lane: 'semantic', representation: 'semantic_768', executor: 'QDRANT', reason: 'persistent semantic projection', voteKey: 'semantic' };
	}
	if (input.allowTurboVecChallenger && input.turboVecAvailable) {
		return { lane: 'semantic', representation: 'semantic_768', executor: 'TURBOVEC', reason: 'explicit challenger fallback', voteKey: 'semantic' };
	}
	if (input.cuVsExactAvailable) {
		return { lane: 'semantic', representation: 'semantic_768', executor: 'CUVS_EXACT', reason: 'exact fallback', voteKey: 'semantic' };
	}
	throw new Error('no semantic_768 executor satisfies runtime policy');
}
