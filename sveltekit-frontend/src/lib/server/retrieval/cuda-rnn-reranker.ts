import { rewardScoreGPU, isPytorchGpuAvailable } from '$lib/server/gpu/pytorch-graph.js';

export interface CudaRnnSignals {
	queryLength?: number;
	candidateCount?: number;
	sectionHintCount?: number;
	graphNeighborCount?: number;
	authorityAvailable?: boolean;
	clusterAvailable?: boolean;
	manifoldAvailable?: boolean;
	pipeline?: 'legal' | 'kb' | 'codebase' | 'ace' | 'other';
}

export interface CudaRnnChunkLike {
	content: string;
	score: number;
	source: string;
	authorityScore?: number;
	clusterHotness?: number;
	manifold4Proximity?: number;
	sectionScore?: number;
	citationDensity?: number;
	lengthScore?: number;
	[key: string]: unknown;
}

export interface CudaRnnRerankResult<T extends CudaRnnChunkLike = CudaRnnChunkLike> {
	chunks: T[];
	scores: number[];
	source: 'gpu' | 'cpu';
	degraded: boolean;
	degradedReason?: string;
}

const FEATURE_DIM = 6;

function clamp01(value: number | undefined, fallback = 0.5): number {
	if (!Number.isFinite(value ?? Number.NaN)) return fallback;
	return Math.min(1, Math.max(0, Number(value)));
}

function isEnabled(): boolean {
	return /^(1|true|yes|on)$/i.test(process.env.ENABLE_CUDA_RANKER ?? '');
}

function buildQueryVector(signals: CudaRnnSignals): Float32Array {
	const queryLength = Math.max(1, Number(signals.queryLength ?? 0));
	const candidateCount = Math.max(1, Number(signals.candidateCount ?? 1));
	const sectionHintCount = Math.max(0, Number(signals.sectionHintCount ?? 0));
	const graphNeighborCount = Math.max(0, Number(signals.graphNeighborCount ?? 0));

	const authorityBias = signals.authorityAvailable ? 0.85 : 0.45;
	const clusterBias = signals.clusterAvailable ? 0.8 : 0.5;
	const manifoldBias = signals.manifoldAvailable ? 0.75 : 0.5;
	const sectionBias = sectionHintCount > 0 ? Math.min(1, 0.5 + sectionHintCount * 0.12) : 0.5;
	const graphBias = graphNeighborCount > 0 ? Math.min(1, 0.45 + graphNeighborCount * 0.08) : 0.4;
	const tightness = Math.min(1, 0.35 + candidateCount / 16 + queryLength / 1024);

	return new Float32Array([
		1,
		authorityBias,
		clusterBias,
		manifoldBias,
		sectionBias,
		Math.min(1, (graphBias + tightness) / 2),
	]);
}

function buildChunkVector(chunk: CudaRnnChunkLike): Float32Array {
	const retrieval = clamp01(chunk.score, 0.5);
	const authority = clamp01(chunk.authorityScore, 0.45);
	const cluster = clamp01(chunk.clusterHotness, 0.5);
	const manifold = clamp01(chunk.manifold4Proximity, 0.5);
	const section = clamp01(chunk.sectionScore, 0.5);
	const citation = clamp01(chunk.citationDensity, 0.25);
	const lengthScore = clamp01(chunk.lengthScore, Math.min(1, chunk.content.length / 2400));
	return new Float32Array([retrieval, authority, cluster, manifold, section, (citation + lengthScore) / 2]);
}

function flattenVectors(vectors: Float32Array[]): Float32Array {
	const out = new Float32Array(vectors.length * FEATURE_DIM);
	for (let i = 0; i < vectors.length; i++) {
		out.set(vectors[i], i * FEATURE_DIM);
	}
	return out;
}

function normalizeScore(score: number): number {
	return Math.min(1, Math.max(0, (score + 1) / 2));
}

export function isCudaRnnRankerEnabled(): boolean {
	return isEnabled();
}

export function buildCudaRnnSignals(input: Partial<CudaRnnSignals>): CudaRnnSignals {
	return {
		queryLength: input.queryLength ?? 0,
		candidateCount: input.candidateCount ?? 0,
		sectionHintCount: input.sectionHintCount ?? 0,
		graphNeighborCount: input.graphNeighborCount ?? 0,
		authorityAvailable: input.authorityAvailable ?? false,
		clusterAvailable: input.clusterAvailable ?? false,
		manifoldAvailable: input.manifoldAvailable ?? false,
		pipeline: input.pipeline ?? 'other',
	};
}

export async function rerankChunksCudaExperimental<T extends CudaRnnChunkLike>(
	chunks: T[],
	signals: Partial<CudaRnnSignals> = {}
): Promise<CudaRnnRerankResult<T> | null> {
	if (!isCudaRnnRankerEnabled() || chunks.length <= 1) return null;

	const querySignals = buildCudaRnnSignals({
		queryLength: signals.queryLength,
		candidateCount: chunks.length,
		sectionHintCount: signals.sectionHintCount,
		graphNeighborCount: signals.graphNeighborCount,
		authorityAvailable: signals.authorityAvailable,
		clusterAvailable: signals.clusterAvailable,
		manifoldAvailable: signals.manifoldAvailable,
		pipeline: signals.pipeline,
	});

	const queryVector = buildQueryVector(querySignals);
	const candidateVectors = chunks.map((chunk) => buildChunkVector(chunk));
	const gen = flattenVectors(candidateVectors);
	const ref = new Float32Array(chunks.length * FEATURE_DIM);
	for (let i = 0; i < chunks.length; i++) ref.set(queryVector, i * FEATURE_DIM);

	const reward = rewardScoreGPU(gen, ref, chunks.length, FEATURE_DIM);
	const rewardScores = Array.from(reward.scores, (score) => normalizeScore(score));
	const combined = chunks
		.map((chunk, idx) => {
			const gpuScore = rewardScores[idx] ?? 0.5;
			const authority = clamp01(chunk.authorityScore, 0.5);
			const finalScore =
				0.66 * clamp01(chunk.score, 0.5) +
				0.22 * gpuScore +
				0.12 * authority;
			return {
				...chunk,
				score: finalScore,
				__cudaScore: gpuScore,
			};
		})
		.sort((a, b) => b.score - a.score);

	return {
		chunks: combined,
		scores: rewardScores,
		source: reward.source,
		degraded: reward.source !== 'gpu' || !isPytorchGpuAvailable(),
		degradedReason: reward.source !== 'gpu' ? 'cpu_fallback' : undefined,
	};
}
