import type { WikiCard, WikiGap } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// wiki-card-writer.ts
//
// Builds WikiCard documents from gap data and static definitions.
// WikiCards are the human-readable wiki layer stored in CouchDB.
// Each card groups related gaps, files, and symbols under a topic slug.
// ─────────────────────────────────────────────────────────────────────────────

const ACE_MULTI_LANE_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:ace-multi-lane-retrieval',
	type: 'wiki_page',
	title: 'ACE Multi-Lane Retrieval',
	summary:
		'ACE asks multiple retrieval lanes in parallel (hash, ngram, graph, ace_cache, Qdrant semantic) ' +
		'and merges them into one context packet for Gemma4. ' +
		'The multi-lane module exists in multi-lane-retrieval.ts but is not yet wired into context-assembler.ts.',
	files: [
		'src/lib/server/ace/context-assembler.ts',
		'src/lib/server/ace/multi-lane-retrieval.ts',
		'src/lib/server/ace/error-fingerprint.ts',
		'src/lib/server/ace/ngram-retrieval.ts',
		'src/lib/server/ace/graph-expander.ts',
	],
	symbols: ['multiLaneSearch', 'assembleACEContext', 'runAceCacheLane', 'skipVectorLane'],
	redisKeys: ['ace:topk:*:embeddinggemma:768', 'ace:error:fp:*'],
};

const ACE_CACHE_KEY_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:ace-cache-key-contract',
	type: 'wiki_page',
	title: 'ACE Cache Key Contract',
	summary:
		'context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768 after Qdrant rerank. ' +
		'retrieval-lanes.ts reads ace:query:{qHash}:embeddinggemma:768 — a different namespace. ' +
		'multi-lane-retrieval.ts reads ace:topk:* correctly but has no shared constant. ' +
		'No canonical aceTopkKey() helper ties these together: format drift causes silent 100% cache miss.',
	files: [
		'src/lib/server/ace/context-assembler.ts',
		'src/lib/server/ace/multi-lane-retrieval.ts',
	],
	symbols: ['aceTopkKey'],
	redisKeys: ['ace:topk:*:embeddinggemma:768'],
};

const ERROR_FINGERPRINT_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:error-fingerprint-pipeline',
	type: 'wiki_page',
	title: 'Error Fingerprint Pipeline',
	summary:
		'TypeScript/runtime errors are normalised into stable sha256 hashes and stored in error_fingerprints (Postgres) ' +
		'and cached in Redis under ace:error:fp:*. ' +
		'The multi-lane hash lane reads these to surface prior fixes. ' +
		'The Postgres table is defined but lacks a backfill pipeline from tsgo diagnostics.',
	files: [
		'src/lib/server/ace/error-fingerprint.ts',
		'src/lib/server/ace/multi-lane-retrieval.ts',
		'src/lib/server/db/schema-postgres.ts',
		'scripts/tsgo-diagnostics-to-jsonb.mjs',
	],
	symbols: ['fingerprintError', 'lookupErrorFingerprint', 'errorFingerprints', 'normalizeError'],
	redisKeys: ['ace:error:fp:*'],
};

const CODEBASE_RELATIONSHIP_SPINE_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:codebase-relationship-spine',
	type: 'wiki_page',
	title: 'Codebase Relationship Spine',
	summary:
		'The relationship spine extracts 7 semantic edge types (EXPORTS_SYMBOL, READS/WRITES_REDIS_KEY, ' +
		'QUERIES_TABLE, QUERIES_QDRANT_COLLECTION, QUERIES_NEO4J_LABEL, HAS_AGENTS_SCOPE) from every TS/Svelte ' +
		'source file and persists them in Postgres code_relations + Neo4j. ' +
		'These edges feed the ACE multi-lane retrieval spine (symbol lookup, graph expansion, LLMS.md walk-up) ' +
		'and are the primary input for the gap analyzer and wiki card pipeline. ' +
		'The pipeline: workspace-metadata-extractor → codebase-scanner-v2 → relationship-extractor → ' +
		'pg-neo4j-sync → codebase-neo4j-sync → graph-centrality/community-graph → ' +
		'som-topology-pipeline/gpu-graph-analysis → memory/runs/<run_id>/relationship_map.json.',
	files: [
		'src/lib/server/graph/relationship-extractor.ts',
		'src/lib/server/graph/codebase-scanner-v2.ts',
		'src/lib/server/graph/workspace-metadata-extractor.ts',
		'src/lib/server/graph/codebase-neo4j-sync.ts',
		'src/lib/server/graph/pg-neo4j-sync.ts',
		'src/lib/server/graph/graph-intel.ts',
		'src/lib/server/graph/graph-centrality.ts',
		'src/lib/server/graph/community-graph.ts',
		'src/lib/server/graph/gpu-graph-analysis.ts',
		'src/lib/server/graph/som-topology-pipeline.ts',
		'src/lib/server/graph/hypergraph-4d.ts',
		'scripts/graph/build-codebase-relationships.mjs',
		'src/lib/server/ace/context-assembler.ts',
		'src/lib/server/ace/types.ts',
	],
	symbols: [
		'extractSemanticRelations',
		'extractAllSemanticRelations',
		'SemanticEdge',
		'SemanticRelationType',
		'collectScanTargets',
		'KNOWN_TABLES',
		'KNOWN_QDRANT_COLLECTIONS',
		'KNOWN_NEO4J_LABELS',
		'buildClusterContext',
		'ClusterContextPacket',
		'clusterContext',
	],
	redisKeys: [
		'code:graph:node:*',
		'code:index:manifest',
		'code:index:tag:*',
		'ace:topo:*',
	],
};

const TURBOQUANT_KV_CACHE_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:turboquant-kv-cache-compression',
	type: 'wiki_page',
	title: 'TurboQuant KV Cache Compression',
	summary:
		'TurboQuant (arXiv 2504.19874, Zandieh et al.) is a data-oblivious online vector quantization ' +
		'algorithm: randomly rotate vectors, quantize coordinates with scalar codebooks, then add a ' +
		'1-bit QJL residual for unbiased inner-product estimation. ' +
		'For the RTX 3060 Ti (8GB) stack, turbo3 KV quantization alone is sufficient: ' +
		'llama-server -m gemma4-legal-vlm.gguf --mmproj mmproj-BF16.gguf -ctk turbo3 -ctv turbo4 -fa on -ngl 99 -c 4096 ' +
		'yields ~5.7GB total (5.3GB model + 192MB KV) leaving 2.3GB free for batching. ' +
		'MLA-style latent compression is not needed for this GPU budget. ' +
		'TurboQuant flags in llama-server must be verified via --help before use — flag names are build-specific.',
	files: [
		'src/lib/server/ai/gemma4-agent.ts',
		'src/lib/server/ai/openai-facade.ts',
		'src/lib/server/ace/context-assembler.ts',
		'scripts/startup-plan.mjs',
	],
	symbols: ['turboQuantChat', 'bifrostChat', 'PLANNER_MODEL', 'TOOL_MODEL'],
	redisKeys: [],
};

const LLM_SYNTHESIS_CLUSTER_TAGS_CARD: Omit<WikiCard, 'gaps' | 'updatedAt'> = {
	id: 'wiki:llm-synthesis-qdrant-cluster-tags',
	type: 'wiki_page',
	title: 'LLM Synthesis ↔ Qdrant Cluster Tag Pipeline',
	summary:
		'The TRACE DAG has an llm_synthesis step that is supposed to synthesise ranked evidence using ' +
		'Qdrant cluster metadata (som_cluster, tags, topo_class, cluster_key) to produce a cluster-aware ' +
		'domain summary. Currently it is a hardcoded stub. Five gaps block the full pipeline: ' +
		'(1) llm_synthesis stub must be replaced with a real turboQuantChat call that reads cluster tags; ' +
		'(2) synthesis-memory-archiver.ts must be wired to write synthesis outputs to synthesis_memory_768; ' +
		'(3) cluster_key composite field (topo_class:som_cluster) must be added to dual-embedder ingest; ' +
		'(4) writeAuthorityScoresToQdrant nightly job must be scheduled so applyKarpathyBoost uses cached scores; ' +
		'(5) RerankBreakdown should be written back to Qdrant payloads to close the ACE hit feedback loop.',
	files: [
		'src/lib/server/agents/trace-subagent-orchestrator.ts',
		'src/lib/server/agents/synthesis-memory-archiver.ts',
		'src/lib/server/indexer/dual-embedder.ts',
		'src/lib/server/vector/qdrant-manager.ts',
		'src/lib/server/graph/neo4j-gds.ts',
		'src/lib/server/ace/context-assembler.ts',
		'src/lib/server/config/vector-config.ts',
	],
	symbols: [
		'runAndPersistStub',
		'archiveSynthesisMemory',
		'writeAuthorityScoresToQdrant',
		'applyKarpathyBoost',
		'RerankBreakdown',
		'recordChunkHits',
		'cluster_key',
	],
	redisKeys: [],
};

// ── Static card registry ─────────────────────────────────────────────────────

const CARD_REGISTRY = [
	{ card: ACE_MULTI_LANE_CARD, gapIds: ['gap_ace_001', 'gap_ace_002'] },
	{ card: ACE_CACHE_KEY_CARD, gapIds: ['gap_ace_003'] },
	{ card: ERROR_FINGERPRINT_CARD, gapIds: ['gap_ace_004'] },
	{
		card: CODEBASE_RELATIONSHIP_SPINE_CARD,
		gapIds: ['gap_rel_001', 'gap_rel_002', 'gap_rel_003', 'gap_rel_004', 'gap_rel_005', 'gap_rel_006'],
	},
	{
		card: LLM_SYNTHESIS_CLUSTER_TAGS_CARD,
		gapIds: ['gap_synth_001', 'gap_synth_002', 'gap_synth_003', 'gap_synth_004', 'gap_synth_005'],
	},
	{ card: TURBOQUANT_KV_CACHE_CARD, gapIds: [] },
];

// ── Public API ───────────────────────────────────────────────────────────────

export function buildWikiCards(gaps: WikiGap[]): WikiCard[] {
	const now = new Date().toISOString();
	const openGapIds = new Set(gaps.filter((g) => g.status === 'open').map((g) => g.id));

	return CARD_REGISTRY.map(({ card, gapIds }) => {
		// Only include gap IDs that actually exist in this report
		const resolvedGaps = gapIds.filter((id) => gaps.some((g) => g.id === id));
		const hasOpenGap = resolvedGaps.some((id) => openGapIds.has(id));

		return {
			...card,
			gaps: resolvedGaps,
			// Mark card summary if all its gaps are fixed
			summary: hasOpenGap ? card.summary : `[All gaps resolved] ${card.summary}`,
			updatedAt: now,
		} satisfies WikiCard;
	});
}

export function formatCardMarkdown(card: WikiCard, gaps: WikiGap[]): string {
	const cardGaps = gaps.filter((g) => card.gaps.includes(g.id));
	const openGaps = cardGaps.filter((g) => g.status === 'open');

	const lines: string[] = [
		`# ${card.title}`,
		'',
		card.summary,
		'',
		'## Files',
		...card.files.map((f) => `- \`${f}\``),
		'',
		'## Symbols',
		...card.symbols.map((s) => `- \`${s}\``),
		'',
	];

	if (card.redisKeys.length > 0) {
		lines.push('## Redis Keys', ...card.redisKeys.map((k) => `- \`${k}\``), '');
	}

	if (cardGaps.length > 0) {
		lines.push(`## Gaps (${openGaps.length} open / ${cardGaps.length} total)`);
		for (const gap of cardGaps) {
			const icon = gap.status === 'open' ? '🔴' : '✅';
			const sev = gap.severity;
			lines.push(``, `### ${icon} [${sev}] ${gap.id}: ${gap.title}`);
			lines.push(`**Summary**: ${gap.summary}`);
			lines.push(`**Why**: ${gap.why}`);
			lines.push(`**Patch**: ${gap.patch}`);
			if (gap.affectedFiles.length > 0) {
				lines.push(`**Files**: ${gap.affectedFiles.map((f) => `\`${f}\``).join(', ')}`);
			}
		}
		lines.push('');
	}

	lines.push(`_Updated: ${card.updatedAt}_`);
	return lines.join('\n');
}
