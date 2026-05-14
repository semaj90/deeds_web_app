import { generateChunkId, generateFileId, generateDirectoryId, generateSummaryId } from './chunk-id.js';
import type { WikiNote, DirectoryNote } from './karpathy-wiki.js';
import { generateSummaryLenses } from './summary-lens-generator.js';
import { triageAuditHotspots, generateAuditVerdict } from './audit-triage.js';
import { getTensorAnalysis } from '../tensor/tensor-analysis-cache.js';

export type KarpathyHookInput = {
	repoRoot: string;
	runId: string;
	source: 'rg' | 'awk' | 'graphify' | 'ast' | 'watcher';
	files: Array<{
		filePath: string;
		language?: string;
		content: string;
		contentHash: string;
		imports?: string[];
		exports?: string[];
		symbols?: string[];
		route?: string;
		audit?: Record<string, any>;
		graph?: {
			fanIn?: number;
			fanOut?: number;
			pageRank?: number;
			community?: string;
		};
	}>;
};

export type KarpathyHookOutput = {
	runId: string;
	chunks: any[];
	summaries: any[];
	qdrantPayloads: any[];
	neo4jEdges: any[];
	libtorchRows: any[];
	wikiNotes: any[];
	stats: {
		filesSeen: number;
		chunksCreated: number;
		summariesCreated: number;
		qdrantPayloads: number;
		neo4jEdges: number;
		wikiNotes: number;
		libtorchRows: number;
	};
};

/**
 * Karpathy Hook: The bridge between raw search and structured memory.
 * Orchestrates metadata envelopes, vector payloads, graph edges, and GPU topology.
 */
export async function processKarpathyHook(input: KarpathyHookInput): Promise<KarpathyHookOutput> {
	const output: KarpathyHookOutput = {
		runId: input.runId,
		chunks: [],
		summaries: [],
		qdrantPayloads: [],
		neo4jEdges: [],
		libtorchRows: [],
		wikiNotes: [],
		stats: {
			filesSeen: 0,
			chunksCreated: 0,
			summariesCreated: 0,
			qdrantPayloads: 0,
			neo4jEdges: 0,
			wikiNotes: 0,
			libtorchRows: 0,
		}
	};

	for (const file of input.files) {
		output.stats.filesSeen++;
		const fileId = generateFileId(file.filePath);
		const dirPath = file.filePath.split(/[/\\]/).slice(0, -1).join('/');
		const dirId = generateDirectoryId(dirPath);

		// 1. Create file-level metadata envelope
		const lineCount = file.content.split('\n').length;
		const integrationDensity = file.graph?.fanIn ?? 0;

		const fileMetadata = {
			id: fileId,
			type: 'file',
			path: file.filePath,
			hash: file.contentHash,
			meta: {
				imports: file.imports,
				exports: file.exports,
				symbols: file.symbols,
				route: file.route,
				audit: file.audit,
				graph: file.graph,
				lineCount,
				integrationDensity
			}
		};

		// 2. Neo4j Edges
		output.neo4jEdges.push({
			source: dirId,
			target: fileId,
			type: 'CONTAINS'
		});

		if (file.route) {
			output.neo4jEdges.push({
				source: fileId,
				target: `route:${file.route}`,
				type: 'SERVES_ROUTE'
			});
		}

		// 3. Chunking & Tier 1 (Cheap Summary)
		const lines = file.content.split('\n');
		const chunkId = generateChunkId({
			repoName: 'deeds-web',
			filePath: file.filePath,
			content: file.content,
			startLine: 1,
			endLine: lines.length
		});

		// Tier 1: Deterministic "Cheap" summary
		const firstHeading = lines.find(l => l.trim().startsWith('#')) || '';
		const functionNames = file.symbols?.filter(s => s.match(/^[A-Z_]+$/) === null) || []; // Heuristic
		const cheapSummary = `File: ${file.filePath}. Heading: ${firstHeading}. Functions: ${functionNames.slice(0, 5).join(', ')}`;

		const chunk = {
			id: chunkId,
			fileId,
			content: file.content,
			cheapSummary,
			tags: file.audit ? Object.keys(file.audit) : []
		};
		output.chunks.push(chunk);
		output.stats.chunksCreated++;

		// 4. Qdrant Payload
		output.qdrantPayloads.push({
			id: chunk.id,
			vector_type: 'chunk',
			payload: {
				path: file.filePath,
				dir: dirPath,
				tags: chunk.tags,
				hash: file.contentHash,
				tier: 1,
				summary: cheapSummary
			}
		});
		output.stats.qdrantPayloads++;

		// 5. LibTorch Export Row
		const tensor = await getTensorAnalysis(chunkId, file.contentHash).catch(() => null);
		output.libtorchRows.push({
			stableKey: chunk.id,
			filePath: file.filePath,
			directoryPath: dirPath,
			tags: chunk.tags,
			manifold4: tensor?.manifold4,
			topoByte: tensor?.topoByte
		});
		output.stats.libtorchRows++;

		// 6. High-value summary triggers (Tier 2)
		const isHighValue = 
			(file.graph?.pageRank && file.graph.pageRank > 0.5) || 
			(file.audit?.score && file.audit.score < 0.4) || // Audit failure
			file.route || // Active route
			file.filePath.includes('AGENTS.md'); // Policy file

		if (isHighValue) {
			// Trigger Tier 2: Gemma4 summary lenses
			const lenses = ['purpose', 'retrieval_role', 'api_surface', 'risk', 'dependencies'];
			const summaries = await generateSummaryLenses({
				chunkId: fileId,
				targetType: 'file',
				content: file.content,
				lenses,
				gpuCluster: tensor?.somCluster ?? undefined,
				manifold4: tensor?.manifold4,
			});
			
			for (const s of summaries) {
				if (s.success) {
					output.summaries.push({ 
						chunkId: fileId, 
						lensType: s.lensType,
						content: s.summaryText
					});
					output.stats.summariesCreated++;
				}
			}
		}
	}

	// 7. Directory-level aggregation (Post-process)
	const hotspots = await triageAuditHotspots(input.files);

	for (const spot of hotspots) {
		const wikiNote: DirectoryNote = {
			type: 'directory',
			path: spot.path,
			summary: generateAuditVerdict(spot),
			dominantTags: spot.dominantWarnings,
			fileCount: input.files.filter(f => (f.filePath.split(/[/\\]/).slice(0, -1).join('/') || '.') === spot.path).length,
			auditScore: spot.avgScore,
			warnings: spot.dominantWarnings,
			representativeFiles: spot.criticalFiles,
			generatedAt: new Date().toISOString(),
			version: 1
		};
		output.wikiNotes.push(wikiNote);
		output.stats.wikiNotes++;
	}

	return output;
}
