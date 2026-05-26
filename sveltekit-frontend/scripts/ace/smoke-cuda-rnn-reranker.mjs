import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rerankChunksCudaExperimental } from '../../src/lib/server/retrieval/cuda-rnn-reranker.ts';

const outDir = join(process.cwd(), 'logs', 'ace-cuda-rnn-reranker');
await mkdir(outDir, { recursive: true });

const sample = [
	{
		content: 'Statute citation and authority chain match.',
		score: 0.68,
		source: 'chunk-a',
		authorityScore: 0.9,
		clusterHotness: 0.8,
		manifold4Proximity: 0.7,
		sectionScore: 0.85,
		lengthScore: 0.55,
	},
	{
		content: 'Weak retrieval result with sparse context.',
		score: 0.41,
		source: 'chunk-b',
		authorityScore: 0.3,
		clusterHotness: 0.2,
		manifold4Proximity: 0.35,
		sectionScore: 0.4,
		lengthScore: 0.3,
	},
	{
		content: 'Cluster summary with legal evidence focus.',
		score: 0.59,
		source: 'chunk-c',
		authorityScore: 0.7,
		clusterHotness: 0.6,
		manifold4Proximity: 0.66,
		sectionScore: 0.7,
		lengthScore: 0.48,
	},
];

const prev = process.env.ENABLE_CUDA_RANKER;

try {
	process.env.ENABLE_CUDA_RANKER = '0';
	const disabled = await rerankChunksCudaExperimental(sample, {
		queryLength: 128,
		candidateCount: sample.length,
		sectionHintCount: 2,
		graphNeighborCount: 1,
		authorityAvailable: true,
		clusterAvailable: true,
		manifoldAvailable: true,
		pipeline: 'ace',
	});

	process.env.ENABLE_CUDA_RANKER = '1';
	const enabled = await rerankChunksCudaExperimental(sample, {
		queryLength: 128,
		candidateCount: sample.length,
		sectionHintCount: 2,
		graphNeighborCount: 1,
		authorityAvailable: true,
		clusterAvailable: true,
		manifoldAvailable: true,
		pipeline: 'ace',
	});

	const report = {
		disabled: disabled === null,
		enabled: enabled != null,
		enabledSource: enabled?.source ?? null,
		enabledDegraded: enabled?.degraded ?? null,
		order: enabled?.chunks.map((c) => c.source) ?? [],
		scores: enabled?.scores ?? [],
	};

	await writeFile(join(outDir, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');

	if (!report.disabled) {
		throw new Error('cuda reranker smoke expected disabled path to return null');
	}
	if (!report.enabled || !report.order.length) {
		throw new Error('cuda reranker smoke expected enabled path to return ranked chunks');
	}

	console.log('[ace:cuda-reranker:smoke] OK', JSON.stringify(report));
} finally {
	if (prev === undefined) {
		delete process.env.ENABLE_CUDA_RANKER;
	} else {
		process.env.ENABLE_CUDA_RANKER = prev;
	}
}
