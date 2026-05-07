import { createHash } from 'node:crypto';
import type { WikiGap, GapReport, GapSeverity, GapType } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// wiki-gap-analyzer.ts
//
// Programmatic gap detection for the ACE/TRACE retrieval spine.
// Each gap check is a pure async function that reads source files or runs
// static analysis — no LLM required. The result is a canonical GapReport
// that can be written to CouchDB, Redis, and Neo4j.
//
// Gaps tracked here:
//   gap_ace_001 — multiLaneSearch not called by context-assembler
//   gap_ace_002 — skipVectorLane declared but never enforced
//   gap_ace_003 — ace:topk writer/reader key namespace shared but no canonical import
//   gap_ace_004 — error_fingerprints backfill script not yet created
//   gap_wiki_001 — retrieval-lanes.ts redis_ace lane reads ace:query:* (wrong key prefix)
//   gap_wiki_002 — error_fingerprints not as Drizzle table in schema-postgres.ts
//   gap_wiki_003 — multi-lane-retrieval.ts has no paired test file
//   gap_rel_001  — relationship-extractor.ts TypeScript source does not exist
//   gap_rel_002  — code_relations table not in Drizzle schema
//   gap_rel_003  — no test file for extract-code-relations pipeline
//   gap_synth_001 — llm_synthesis TRACE subagent is a hardcoded stub
//   gap_synth_002 — synthesis output has no write-back path to synthesis_memory_768
//   gap_synth_003 — cluster_key composite field absent from codebase_chunks_768 payload
//   gap_synth_004 — graphAuthorityScore nightly job has no scheduler wiring
//   gap_synth_005 — RerankBreakdown not persisted to Qdrant payload after scoring
//   gap_rel_004  — llm_synthesis does not inject Qdrant cluster tag context
//   gap_rel_005  — relationship_map.json artifact not written per run
//   gap_rel_006  — graph analysis ingest.jsonl not wired to ACE KAG notes
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_VERSION = '1.0.0';

function runId(): string {
	return createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 12);
}

// ── Gap definitions ──────────────────────────────────────────────────────────

// ── Score computation ────────────────────────────────────────────────────────
// gap_score = 0.30×centrality + 0.25×callers + 0.20×retrieval_impact + 0.15×test_missing + 0.10×severity

function computeGapScore(opts: {
	severity: GapSeverity;
	affectedFiles: string[];
	affectedMcpTools: string[];
	hasTestGap: boolean;
	centrality?: number;     // 0–1 from PageRank; 0 if unknown
}): number {
	const severityScore = opts.severity === 'HIGH' ? 1.0 : opts.severity === 'MED' ? 0.6 : 0.2;
	const callersScore = Math.min(opts.affectedFiles.length / 8, 1.0);
	const retrievalImpact = opts.affectedMcpTools.length > 0 ? 1.0 : 0.5;
	const testMissing = opts.hasTestGap ? 1.0 : 0.0;
	const centrality = opts.centrality ?? 0;

	return (
		0.30 * centrality +
		0.25 * callersScore +
		0.20 * retrievalImpact +
		0.15 * testMissing +
		0.10 * severityScore
	);
}

const GAP_DEFINITIONS: Omit<WikiGap, 'status' | 'discoveredByRun' | 'fixedByCommit' | 'createdAt' | 'updatedAt' | 'score'>[] = [
	{
		id: 'gap_ace_001',
		title: 'multiLaneSearch not called by context-assembler',
		severity: 'HIGH',
		type: 'dead_retrieval_lane' as GapType,
		summary:
			'context-assembler.ts has no import or call to multiLaneSearch() from multi-lane-retrieval.ts.',
		why:
			'The multi-lane retrieval system (hash + ngram + graph + ace_cache lanes) exists but is bypassed. ' +
			'ACE context assembly only uses Qdrant/ACP/Redis/SOM paths. ' +
			'Error fingerprint cache hits, ngram recall, and graph node expansion are never surfaced to Gemma4.',
		patch:
			'In context-assembler.ts: import { multiLaneSearch } from ./multi-lane-retrieval.js; ' +
			'call multiLaneSearch({ text: query, isError: looksLikeError(query), topK: 10 }) in parallel with the Qdrant lane; ' +
			'merge synthesis.synthesisBlock into the assembled context string.',
		affectedFiles: [
			'src/lib/server/ace/context-assembler.ts',
			'src/lib/server/ace/multi-lane-retrieval.ts',
		],
		affectedSymbols: ['multiLaneSearch', 'assembleACEContext', 'MultiLaneSynthesis'],
		affectedRedisKeys: ['ace:topk:*:embeddinggemma:768'],
		affectedMcpTools: ['trace.explain_retrieval'],
	},
	{
		id: 'gap_ace_002',
		title: 'skipVectorLane declared but never enforced in multiLaneSearch',
		severity: 'HIGH',
		type: 'vector_lane_mismatch' as GapType,
		summary:
			'MultiLaneQuery.skipVectorLane is typed but the multiLaneSearch() body always runs all lanes regardless.',
		why:
			'Callers cannot opt out of expensive vector lanes. ' +
			'When context-assembler already has Qdrant results, running the vector lane again wastes latency. ' +
			'The flag exists for cost control but has no effect — a silent contract break.',
		patch:
			'In multi-lane-retrieval.ts multiLaneSearch(): ' +
			'check query.skipVectorLane before pushing lanes; ' +
			'the ace_cache lane and ngram lane should still run when skipVectorLane=true. ' +
			'Add a comment "// vector lane gated by skipVectorLane" so the invariant is visible.',
		affectedFiles: ['src/lib/server/ace/multi-lane-retrieval.ts'],
		affectedSymbols: ['multiLaneSearch', 'MultiLaneQuery', 'skipVectorLane'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_ace_003',
		title: 'ace:topk writer/reader key namespace is shared but ownership unclear',
		severity: 'HIGH',
		type: 'cache_read_without_write' as GapType,
		summary:
			'context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768 at line 2184. ' +
			'multi-lane-retrieval.ts reads the same key pattern in runAceCacheLane(). ' +
			'There is no canonical constant or import binding the two — if either changes the key format, the cache silently stops working.',
		why:
			'A format drift (e.g. model name change, hash length change) would cause 100% cache miss ' +
			'with no error, only silent latency regression. ' +
			'The key pattern is copy-pasted in two places with no shared constant.',
		patch:
			'Create src/lib/server/ace/cache-keys.ts with: ' +
			'export const aceTopkKey = (queryHash: string, model = "embeddinggemma", dim = 768) => ' +
			'`ace:topk:${queryHash}:${model}:${dim}`; ' +
			'Import and use this in both context-assembler.ts and multi-lane-retrieval.ts.',
		affectedFiles: [
			'src/lib/server/ace/context-assembler.ts',
			'src/lib/server/ace/multi-lane-retrieval.ts',
		],
		affectedSymbols: ['aceTopkKey'],
		affectedRedisKeys: ['ace:topk:*:embeddinggemma:768'],
		affectedMcpTools: [],
	},
	{
		id: 'gap_ace_004',
		title: 'error_fingerprints table exists but has no dedicated ACE retrieval lane',
		severity: 'MED',
		type: 'schema_drift' as GapType,
		summary:
			'schema-postgres.ts defines errorFingerprints table and error-fingerprint.ts has fingerprintError(). ' +
			'multiLaneSearch runs the hash lane which calls lookupErrorFingerprint(). ' +
			'But lookupErrorFingerprint reads from Redis first (ace:error:fp:*) with Postgres fallback — ' +
			'the Postgres table may be empty if no batch ingest has run.',
		why:
			'Error context is only surfaced when (a) multiLaneSearch is called (gap_ace_001 blocks this) AND ' +
			'(b) the Redis fingerprint cache is warm. ' +
			'Cold starts miss all error context. ' +
			'The Postgres table could serve as a durable fallback but no backfill pipeline populates it from tsgo diagnostics.',
		patch:
			'Wire tsgo-diagnostics-to-jsonb.mjs output into an error_fingerprints INSERT batch. ' +
			'Add a backfill script: scripts/wiki/backfill-error-fingerprints.mjs that reads ' +
			'scratch/audits/tsgo-diagnostics.json → upserts into error_fingerprints → warms Redis. ' +
			'Then fix gap_ace_001 so ACE actually reads this data.',
		affectedFiles: [
			'src/lib/server/db/schema-postgres.ts',
			'src/lib/server/ace/error-fingerprint.ts',
			'src/lib/server/ace/multi-lane-retrieval.ts',
			'scripts/tsgo-diagnostics-to-jsonb.mjs',
		],
		affectedSymbols: ['errorFingerprints', 'lookupErrorFingerprint', 'fingerprintError'],
		affectedRedisKeys: ['ace:error:fp:*'],
		affectedMcpTools: ['trace.explain_retrieval'],
	},
	{
		id: 'gap_wiki_001',
		title: 'retrieval-lanes.ts redis_ace lane reads ace:query:* but context-assembler writes ace:topk:*',
		severity: 'HIGH',
		type: 'cache_read_without_write' as GapType,
		summary:
			'retrieval-lanes.ts runRedisAceLane() reads ace:query:{qHash}:embeddinggemma:768 ' +
			'but context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768 — ' +
			'different namespace prefixes mean the redis_ace lane always misses.',
		why:
			'runRetrievalLanes() was wired into context-assembler.ts to provide multi-lane context. ' +
			'The redis_ace lane is the fastest path (sub-millisecond on cache hit) but currently has 0% hit rate ' +
			'because the key it reads was never written. The full multi-lane round-trip pays GPU+Postgres cost for every query.',
		patch:
			'In context-assembler.ts, after writing ace:topk:* also write ace:query:{queryHash}:embeddinggemma:768 ' +
			'with the same value (or alias). ' +
			'Alternatively: canonicalize both to use the same key via src/lib/server/ace/cache-keys.ts.',
		affectedFiles: [
			'src/lib/server/ace/retrieval-lanes.ts',
			'src/lib/server/ace/context-assembler.ts',
		],
		affectedSymbols: ['runRedisAceLane', 'runRetrievalLanes'],
		affectedRedisKeys: ['ace:query:*:embeddinggemma:768', 'ace:topk:*:embeddinggemma:768'],
		affectedMcpTools: [],
	},
	{
		id: 'gap_wiki_002',
		title: 'error_fingerprints not exported from schema-postgres.ts Drizzle schema',
		severity: 'MED',
		type: 'schema_drift' as GapType,
		summary:
			'error-fingerprint.ts and multi-lane-retrieval.ts reference the error_fingerprints table ' +
			'but the table was added via raw SQL migration (drizzle/manual/20260506_error_fingerprints.sql), ' +
			'not as a Drizzle schema definition in schema-postgres.ts.',
		why:
			'Without a Drizzle table definition, type-safe queries against error_fingerprints are not possible. ' +
			'db.insert(errorFingerprints) will fail at runtime with "table undefined". ' +
			'The migration creates the table but Drizzle ORM has no knowledge of it.',
		patch:
			'Add errorFingerprints table definition to src/lib/server/db/schema-postgres.ts using pgTable(). ' +
			'Export it alongside all other tables. ' +
			'error-fingerprint.ts can then use Drizzle-typed inserts instead of raw pool.query().',
		affectedFiles: [
			'src/lib/server/db/schema-postgres.ts',
			'src/lib/server/ace/error-fingerprint.ts',
		],
		affectedSymbols: ['errorFingerprints', 'storeErrorFingerprint'],
		affectedRedisKeys: ['ace:error:*'],
		affectedMcpTools: [],
	},
	{
		id: 'gap_wiki_003',
		title: 'multi-lane-retrieval.ts has no paired test file',
		severity: 'LOW',
		type: 'test_gap' as GapType,
		summary:
			'src/lib/server/ace/multi-lane-retrieval.ts (multiLaneSearch, runAceCacheLane, etc.) ' +
			'has no paired test in tests/multi-lane-retrieval.spec.ts. ' +
			'retrieval-lanes.ts gained tests/retrieval-lanes.spec.ts this session but the older module remains untested.',
		why:
			'multi-lane-retrieval.ts has 4 lanes and a merge strategy. ' +
			'Lane-failure isolation, deduplication logic, and score computation have no automated safety net. ' +
			'Changes to the hash or ngram lane can silently break retrieval quality.',
		patch:
			'Create tests/multi-lane-retrieval.spec.ts following the G26 pattern. ' +
			'Cover: all-lanes success, hash-lane Redis miss, trigram lane pg failure, ' +
			'duplicate hit dedup, synthesisBlock shape stability.',
		affectedFiles: ['src/lib/server/ace/multi-lane-retrieval.ts'],
		affectedSymbols: ['multiLaneSearch', 'runAceCacheLane'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},

	// ── Codebase relationship spine gaps ────────────────────────────────────────

	{
		id: 'gap_rel_001',
		title: 'relationship-extractor.ts TypeScript source does not exist',
		severity: 'HIGH',
		type: 'orphan_file' as GapType,
		summary:
			'scripts/wiki/extract-code-relations.mjs tries to import ' +
			'src/lib/server/graph/relationship-extractor.ts for typed semantic edge extraction. ' +
			'The file does not exist — the script silently falls back to an inline JS implementation ' +
			'with no TypeScript types, no SemanticEdge interface, and no KNOWN_TABLES/QDRANT constants.',
		why:
			'The inline fallback is a copy of the TS logic but lacks: ' +
			'(1) exported SemanticEdge and SemanticRelationType types usable by other modules, ' +
			'(2) a KNOWN_TABLES/KNOWN_QDRANT constant that can be imported by gap checks, ' +
			'(3) IMPORTS/DYNAMIC_IMPORTS edge types for full call-graph coverage. ' +
			'Without the TS module, code_relations data cannot be typed or unit-tested.',
		patch:
			'Create src/lib/server/graph/relationship-extractor.ts. ' +
			'Export: SemanticRelationType union, SemanticEdge interface, KNOWN_TABLES, KNOWN_QDRANT_COLLECTIONS, ' +
			'KNOWN_NEO4J_LABELS, extractSemanticRelations(), collectScanTargets(), extractAllSemanticRelations(). ' +
			'The extract-code-relations.mjs import() call will then succeed and skip the JS fallback.',
		affectedFiles: [
			'src/lib/server/graph/relationship-extractor.ts',
			'scripts/wiki/extract-code-relations.mjs',
		],
		affectedSymbols: [
			'SemanticEdge',
			'SemanticRelationType',
			'extractSemanticRelations',
			'extractAllSemanticRelations',
			'collectScanTargets',
		],
		affectedRedisKeys: ['code:index:manifest', 'code:index:tag:*'],
		affectedMcpTools: ['trace.kag_search'],
	},
	{
		id: 'gap_rel_002',
		title: 'code_relations table not in Drizzle schema',
		severity: 'MED',
		type: 'schema_drift' as GapType,
		summary:
			'extract-code-relations.mjs writes to a code_relations Postgres table ' +
			'(INSERT INTO code_relations ...) but no Drizzle table definition exists in schema-postgres.ts. ' +
			'The table may exist from a raw SQL migration but db.insert(codeRelations) will fail at runtime.',
		why:
			'Without a Drizzle definition, code_relations cannot be queried type-safely by the ACE ' +
			'symbol lookup lane or relationship-based reranking. ' +
			'The gap analyzer and wiki card pipeline cannot read relationship data from Postgres. ' +
			'Same root cause as gap_wiki_002 (error_fingerprints).',
		patch:
			'Add codeRelations table to src/lib/server/db/schema-postgres.ts using pgTable(). ' +
			'Columns: id (serial), source_key (text), target_key (text), relation_type (text), ' +
			'confidence (real), evidence (jsonb), created_at (timestamp). ' +
			'Unique constraint on (source_key, target_key, relation_type). ' +
			'Add a manual migration SQL if the table already exists in Postgres.',
		affectedFiles: [
			'src/lib/server/db/schema-postgres.ts',
			'scripts/wiki/extract-code-relations.mjs',
		],
		affectedSymbols: ['codeRelations', 'SemanticEdge'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_rel_003',
		title: 'no test file for extract-code-relations pipeline',
		severity: 'LOW',
		type: 'test_gap' as GapType,
		summary:
			'scripts/wiki/extract-code-relations.mjs and the inline JS fallback extractor have no ' +
			'paired test. The 7 semantic edge types (EXPORTS_SYMBOL, READS/WRITES_REDIS_KEY, ' +
			'QUERIES_TABLE, QUERIES_QDRANT_COLLECTION, QUERIES_NEO4J_LABEL, HAS_AGENTS_SCOPE) ' +
			'have no automated verification that the regex patterns fire correctly.',
		why:
			'Silent false-negatives in the extractor would cause the gap analyzer to miss live relationships. ' +
			'Redis key patterns, Drizzle table names, and Cypher label patterns are all regex-matched ' +
			'and any pattern drift breaks relationship coverage without any signal.',
		patch:
			'Create tests/relation-extractor.spec.ts. ' +
			'Cover: EXPORTS_SYMBOL for named export, READS_REDIS_KEY for redis.get literal, ' +
			'WRITES_REDIS_KEY for redis.setex dynamic key, QUERIES_TABLE for SQL FROM and Drizzle .from(), ' +
			'QUERIES_QDRANT_COLLECTION for collection name in quotes, HAS_AGENTS_SCOPE for walk-up find.',
		affectedFiles: [
			'src/lib/server/graph/relationship-extractor.ts',
			'scripts/wiki/extract-code-relations.mjs',
		],
		affectedSymbols: ['extractSemanticRelations', 'collectScanTargets'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	// ── Relationship + graph artifact gaps ────────────────────────────────────
	{
		id: 'gap_rel_004',
		title: 'llm_synthesis does not inject Qdrant cluster tag context',
		severity: 'HIGH',
		type: 'dead_retrieval_lane' as GapType,
		summary:
			'ACEContext has no clusterContext field. context-assembler.ts does not read ' +
			'qdrant_cluster_tags.json or Qdrant payload cluster fields to build a cluster-aware ' +
			'synthesisBlock. Gemma4 receives generic ranked chunks but no cluster grouping, ' +
			'topo_class labels, or tag-based domain signals.',
		why:
			'The qdrant_cluster_tags.json artifact (produced by build-codebase-relationships.mjs) ' +
			'and the som_cluster + tags fields on codebase_chunks_768 payloads are the primary ' +
			'inputs for cluster-aware synthesis. Without injecting them, llm_synthesis cannot ' +
			'group evidence by domain, rank clusters by authority score, or produce cluster-scoped ' +
			'summaries. Every Gemma4 synthesis call is context-blind about codebase topology.',
		patch:
			'In src/lib/server/ace/types.ts: add clusterContext?: ClusterContextPacket[] to ACEContext. ' +
			'In context-assembler.ts: read qdrant_cluster_tags.json from the latest run dir (or read ' +
			'Qdrant cluster payloads directly) and populate ctx.clusterContext before building synthesisBlock. ' +
			'In multi-lane-retrieval.ts: add a glyph_cluster lane (lane 7) that reads cluster summaries ' +
			'from glyph-atlas-builder.ts and contributes to synthesisBlock.',
		affectedFiles: [
			'src/lib/server/ace/types.ts',
			'src/lib/server/ace/context-assembler.ts',
			'src/lib/server/ace/multi-lane-retrieval.ts',
			'src/lib/server/graph/glyph-atlas-builder.ts',
			'scripts/graph/build-codebase-relationships.mjs',
		],
		affectedSymbols: ['ACEContext', 'clusterContext', 'synthesisBlock', 'ClusterContextPacket'],
		affectedRedisKeys: ['ace:topo:*'],
		affectedMcpTools: ['clusters.get_summary_lenses', 'trace.explain_retrieval'],
	},
	{
		id: 'gap_rel_005',
		title: 'relationship_map.json artifact not written per run',
		severity: 'MED',
		type: 'orphan_file' as GapType,
		summary:
			'extract-code-relations.mjs writes only a summary artifact to logs/task-output/. ' +
			'No per-run relationship_map.json, graph_edges.json, qdrant_cluster_tags.json, or ' +
			'llm_synthesis_mapping.json is written to memory/runs/<run_id>/. ' +
			'build-codebase-relationships.mjs produces these files but must be run separately.',
		why:
			'Without per-run artifacts, startup-plan.mjs and the ACE KAG note system cannot read ' +
			'the current relationship state. The gap analyzer, wiki card pipeline, and Gemma4 agent ' +
			'cannot use code_relations data without querying Postgres directly (which requires Docker). ' +
			'Static artifacts at memory/runs/<run_id>/ allow offline context assembly.',
		patch:
			'Chain build-codebase-relationships.mjs at the end of extract-code-relations.mjs (or ' +
			'add it to the npm relation:extract pipeline). Also consider writing a minimal ' +
			'relationship_map.json during dry-run so the artifact is always current even without Docker.',
		affectedFiles: [
			'scripts/wiki/extract-code-relations.mjs',
			'scripts/graph/build-codebase-relationships.mjs',
		],
		affectedSymbols: ['relationship_map', 'qdrant_cluster_tags', 'llm_synthesis_mapping'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_rel_006',
		title: 'Graph analysis ingest.jsonl not wired to ACE KAG notes',
		severity: 'MED',
		type: 'dead_retrieval_lane' as GapType,
		summary:
			'build-codebase-relationships.mjs writes ingest.jsonl and llm_synthesis_mapping.json ' +
			'to memory/runs/<run_id>/. No code in the ACE pipeline, startup-plan.mjs, or the KAG ' +
			'note system reads these files. Gemma4 cannot access cluster-aware relationship context ' +
			'during tool-call rounds.',
		why:
			'The relationship graph and cluster tag data are the primary missing context layer for ' +
			'Gemma4 code assistance. The ingest.jsonl format (one JSON object per cluster/file) is ' +
			'designed to be read by the KAG system and injected into ACEContext.kagNotes. Until this ' +
			'wiring exists, the graph artifacts are write-only with no read consumers.',
		patch:
			'In startup-plan.mjs: read the latest memory/runs/<run_id>/ingest.jsonl and include ' +
			'top 5 cluster packets in the plan. In context-assembler.ts: add a KAG note source ' +
			'that reads the latest ingest.jsonl and adds cluster summaries to ACEContext.kagNotes. ' +
			'Add a new MCP tool trace.kag_search that queries ingest.jsonl for a given file path.',
		affectedFiles: [
			'scripts/startup-plan.mjs',
			'src/lib/server/ace/context-assembler.ts',
			'src/mcp/trace-mcp-server.ts',
			'scripts/graph/build-codebase-relationships.mjs',
		],
		affectedSymbols: ['kagNotes', 'ingest.jsonl', 'clusterContext', 'trace.kag_search'],
		affectedRedisKeys: [],
		affectedMcpTools: ['trace.kag_search', 'clusters.get_summary_lenses'],
	},
	// ── Synthesis / Qdrant cluster tag gaps ────────────────────────────────────
	{
		id: 'gap_synth_001',
		title: 'llm_synthesis TRACE subagent is a hardcoded stub',
		severity: 'HIGH',
		type: 'dead_retrieval_lane' as GapType,
		summary:
			'trace-subagent-orchestrator.ts calls runAndPersistStub("llm_synthesis") which sets ' +
			'ctx.synthesis to a hardcoded placeholder string. No LLM call is made, no cluster tags ' +
			'are read from Qdrant, and no synthesis output is produced.',
		why:
			'The TRACE DAG has an llm_synthesis step that is supposed to synthesise ranked evidence ' +
			'using Qdrant cluster metadata (som_cluster, tags, topo_class) to produce a domain-aware ' +
			'summary. Until the stub is replaced, every TRACE run produces a static "Synthesis from ' +
			'TRACE subagents" placeholder and the synthesis_memory_768 collection is never written to.',
		patch:
			'In trace-subagent-orchestrator.ts replace runAndPersistStub("llm_synthesis") with a real ' +
			'implementation: read ctx.rankedEvidence cluster tags from Qdrant payload, build a ' +
			'cluster-grouped prompt, call turboQuantChat(), write the result to synthesis_memory_768 ' +
			'via synthesis-memory-archiver.ts, and set ctx.synthesis to the actual response text.',
		affectedFiles: [
			'src/lib/server/agents/trace-subagent-orchestrator.ts',
			'src/lib/server/agents/synthesis-memory-archiver.ts',
			'src/lib/server/ai/gemma4-agent.ts',
		],
		affectedSymbols: ['runAndPersistStub', 'llm_synthesis', 'synthesisMemoryArchiver'],
		affectedRedisKeys: [],
		affectedMcpTools: ['trace.explain_retrieval'],
	},
	{
		id: 'gap_synth_002',
		title: 'No write-back path from synthesis output to synthesis_memory_768',
		severity: 'MED',
		type: 'orphan_file' as GapType,
		summary:
			'synthesis-memory-archiver.ts exists but is not called from the TRACE orchestrator or any ' +
			'live route. The synthesis_memory_768 Qdrant collection (defined in vector-config.ts) ' +
			'has payload indexes for source and tags but receives no writes after any synthesis run.',
		why:
			'Without synthesis write-back, the llm_synthesis agent cannot retrieve prior synthesis ' +
			'outputs as context for new queries. The semantic cache for synthesis reasoning is empty, ' +
			'so every query starts cold. The source/tags payload indexes on synthesis_memory_768 are ' +
			'dead infrastructure.',
		patch:
			'Import synthesis-memory-archiver.ts in trace-subagent-orchestrator.ts. After the real ' +
			'llm_synthesis call (gap_synth_001), call archiveSynthesisMemory({ text, tags, somCluster, ' +
			'clusterKey, queryHash }) to upsert into synthesis_memory_768 with the cluster payload fields.',
		affectedFiles: [
			'src/lib/server/agents/synthesis-memory-archiver.ts',
			'src/lib/server/agents/trace-subagent-orchestrator.ts',
			'src/lib/server/config/vector-config.ts',
		],
		affectedSymbols: ['archiveSynthesisMemory', 'synthesis_memory_768'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_synth_003',
		title: 'cluster_key composite field absent from codebase_chunks_768 payload',
		severity: 'MED',
		type: 'schema_drift' as GapType,
		summary:
			'Qdrant payload indexes in qdrant-manager.ts list cluster_id (keyword) but no ingest path ' +
			'in dual-embedder.ts or gpu-karpathy-tagger.ts sets it. som_cluster (integer) exists but is ' +
			'not a human-readable composite key. llm_synthesis cannot group or filter chunks by ' +
			'cluster_key without a canonical string field.',
		why:
			'The llm_synthesis agent needs to group codebase chunks by topic cluster to produce ' +
			'cluster-aware summaries. An integer som_cluster alone is insufficient — the synthesis ' +
			'prompt must reference a human-readable cluster identity. The cluster_key field would be ' +
			'the canonical join between topo_class + som_cluster + gpu k-means label.',
		patch:
			'In dual-embedder.ts, compute cluster_key = "${topo_class}:${som_cluster}" and write it ' +
			'to the Qdrant payload alongside topo_class and som_cluster. Update the payload index in ' +
			'qdrant-manager.ts to keyword-index cluster_key. In gpu-karpathy-tagger.ts, patch ' +
			'cluster_key when enriching tags so the field stays current after SOM reruns.',
		affectedFiles: [
			'src/lib/server/indexer/dual-embedder.ts',
			'src/lib/server/vector/qdrant-manager.ts',
			'src/lib/server/graph/gpu-karpathy-tagger.ts',
		],
		affectedSymbols: ['cluster_key', 'topo_class', 'som_cluster', 'dual-embedder'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_synth_004',
		title: 'graphAuthorityScore nightly job has no scheduler wiring',
		severity: 'MED',
		type: 'dead_retrieval_lane' as GapType,
		summary:
			'writeAuthorityScoresToQdrant() in neo4j-gds.ts is documented as a nightly batch job ' +
			'but no cron, VS Code task, npm script, or route invokes it. Most codebase_chunks_768 ' +
			'payloads have no graphAuthorityScore field, so applyKarpathyBoost falls back to an ' +
			'RTT Neo4j call on every ACE assembly instead of reading from the cached Qdrant payload.',
		why:
			'Without graphAuthorityScore in the Qdrant payload, applyKarpathyBoost incurs a Neo4j ' +
			'query on every ACE context assembly (lines 3123-3128 in context-assembler.ts). At 50+ ' +
			'chunks per query this is a significant latency hit. The llm_synthesis cluster grouping ' +
			'also depends on authority scores for ranking which cluster to synthesise first.',
		patch:
			'Add "graphify:authority" npm script that calls writeAuthorityScoresToQdrant() as a ' +
			'standalone Node script (no Vite). Wire it into the "graphify:full" pipeline. Add a VS Code ' +
			'task and optionally a CronCreate registration for nightly execution.',
		affectedFiles: [
			'src/lib/server/graph/neo4j-gds.ts',
			'src/lib/server/ace/context-assembler.ts',
		],
		affectedSymbols: ['writeAuthorityScoresToQdrant', 'graphAuthorityScore', 'applyKarpathyBoost'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
	{
		id: 'gap_synth_005',
		title: 'RerankBreakdown not persisted to Qdrant payload after ACE scoring',
		severity: 'LOW',
		type: 'schema_drift' as GapType,
		summary:
			'applyKarpathyBoost() produces a RerankBreakdown per chunk (semantic, qdrantTag, cluster, ' +
			'som, pagerank, bow, final scores) and passes it to recordChunkHits() for analytics. ' +
			'Nothing writes the final score back to the codebase_chunks_768 payload, so llm_synthesis ' +
			'cannot use prior rerank history to weight cluster selection in future synthesis runs.',
		why:
			'The synthesis agent currently only sees static payload fields (tags, topo_class, ' +
			'som_cluster) set at ingest time. If it could read accumulated rerank_score_avg or ' +
			'query_hit_count from the payload, it could prefer clusters that have been consistently ' +
			'high-scoring for similar queries — closing a feedback loop from ACE hits back into the ' +
			'synthesis prioritisation.',
		patch:
			'After recordChunkHits() in context-assembler.ts, batch-patch the top-K chunk payloads ' +
			'with { rerank_score_avg: ema(existing, breakdown.final), query_hit_count: prev+1 } via ' +
			'qdrant setPayload. Cap to top-10 chunks per query to keep the write budget low. Add ' +
			'rerank_score_avg and query_hit_count to the keyword payload indexes in qdrant-manager.ts.',
		affectedFiles: [
			'src/lib/server/ace/context-assembler.ts',
			'src/lib/server/vector/qdrant-manager.ts',
		],
		affectedSymbols: ['applyKarpathyBoost', 'RerankBreakdown', 'recordChunkHits'],
		affectedRedisKeys: [],
		affectedMcpTools: [],
	},
];

// ── Static gap checks ────────────────────────────────────────────────────────
// Each check reads actual source files to confirm whether the gap is still open.

type CheckResult = { open: boolean; evidence: string };

async function checkGap001(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const assembler = await readFile(`${srcRoot}/lib/server/ace/context-assembler.ts`, 'utf8');
		const hasImport = assembler.includes('multiLaneSearch') || assembler.includes('multi-lane-retrieval');
		return {
			open: !hasImport,
			evidence: hasImport
				? 'multiLaneSearch import found in context-assembler.ts'
				: 'No multiLaneSearch import or call in context-assembler.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read context-assembler.ts' };
	}
}

async function checkGap002(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const mlr = await readFile(`${srcRoot}/lib/server/ace/multi-lane-retrieval.ts`, 'utf8');
		const hasEnforcement =
			mlr.includes('skipVectorLane') &&
			(mlr.includes('if (query.skipVectorLane)') || mlr.includes('skipVectorLane &&') ||
			 mlr.includes('!query.skipVectorLane'));
		return {
			open: !hasEnforcement,
			evidence: hasEnforcement
				? 'skipVectorLane is checked in multiLaneSearch body'
				: 'skipVectorLane declared but not enforced in multiLaneSearch body',
		};
	} catch {
		return { open: true, evidence: 'Could not read multi-lane-retrieval.ts' };
	}
}

async function checkGap003(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const cacheKeysPath = `${srcRoot}/lib/server/ace/cache-keys.ts`;
		try {
			const ck = await readFile(cacheKeysPath, 'utf8');
			const hasAceTopk = ck.includes('aceTopkKey') || ck.includes('ace:topk');
			return {
				open: !hasAceTopk,
				evidence: hasAceTopk
					? 'aceTopkKey constant found in cache-keys.ts'
					: 'cache-keys.ts exists but aceTopkKey not defined',
			};
		} catch {
			return { open: true, evidence: 'src/lib/server/ace/cache-keys.ts does not exist' };
		}
	} catch {
		return { open: true, evidence: 'Could not check cache-keys.ts' };
	}
}

async function checkGap004(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const backfillPath = `${srcRoot}/../scripts/wiki/backfill-error-fingerprints.mjs`;
		try {
			await readFile(backfillPath, 'utf8');
			return { open: false, evidence: 'backfill-error-fingerprints.mjs exists' };
		} catch {
			return { open: true, evidence: 'scripts/wiki/backfill-error-fingerprints.mjs does not exist' };
		}
	} catch {
		return { open: true, evidence: 'Could not check backfill script' };
	}
}

async function checkGapWiki001(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const lanes = await readFile(`${srcRoot}/lib/server/ace/retrieval-lanes.ts`, 'utf8');
		const assembler = await readFile(`${srcRoot}/lib/server/ace/context-assembler.ts`, 'utf8');
		const lanesReadsAceQuery = lanes.includes('ace:query:');
		const assemblerWritesAceQuery = assembler.includes('ace:query:');
		return {
			open: lanesReadsAceQuery && !assemblerWritesAceQuery,
			evidence: assemblerWritesAceQuery
				? 'context-assembler.ts writes ace:query:* key — lanes can hit'
				: lanesReadsAceQuery
				? 'retrieval-lanes.ts reads ace:query:* but context-assembler only writes ace:topk:*'
				: 'retrieval-lanes.ts does not reference ace:query:*',
		};
	} catch {
		return { open: true, evidence: 'Could not read retrieval-lanes.ts or context-assembler.ts' };
	}
}

async function checkGapWiki002(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const schema = await readFile(`${srcRoot}/lib/server/db/schema-postgres.ts`, 'utf8');
		const hasTable = schema.includes('errorFingerprints') || schema.includes('error_fingerprints');
		return {
			open: !hasTable,
			evidence: hasTable
				? 'errorFingerprints table definition found in schema-postgres.ts'
				: 'error_fingerprints not defined as Drizzle table in schema-postgres.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read schema-postgres.ts' };
	}
}

async function checkGapWiki003(srcRoot: string): Promise<CheckResult> {
	try {
		const { access } = await import('node:fs/promises');
		const testPath = `${srcRoot}/../tests/multi-lane-retrieval.spec.ts`;
		try {
			await access(testPath);
			return { open: false, evidence: 'tests/multi-lane-retrieval.spec.ts exists' };
		} catch {
			return { open: true, evidence: 'tests/multi-lane-retrieval.spec.ts does not exist' };
		}
	} catch {
		return { open: true, evidence: 'Could not check test file' };
	}
}

async function checkGapRel001(srcRoot: string): Promise<CheckResult> {
	try {
		const { access } = await import('node:fs/promises');
		const relPath = `${srcRoot}/lib/server/graph/relationship-extractor.ts`;
		try {
			await access(relPath);
			return { open: false, evidence: 'src/lib/server/graph/relationship-extractor.ts exists' };
		} catch {
			return { open: true, evidence: 'src/lib/server/graph/relationship-extractor.ts does not exist' };
		}
	} catch {
		return { open: true, evidence: 'Could not check relationship-extractor.ts' };
	}
}

async function checkGapRel002(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const schema = await readFile(`${srcRoot}/lib/server/db/schema-postgres.ts`, 'utf8');
		const hasTable = schema.includes('codeRelations') || schema.includes('code_relations');
		return {
			open: !hasTable,
			evidence: hasTable
				? 'codeRelations table definition found in schema-postgres.ts'
				: 'code_relations not defined as Drizzle table in schema-postgres.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read schema-postgres.ts' };
	}
}

async function checkGapRel003(srcRoot: string): Promise<CheckResult> {
	try {
		const { access } = await import('node:fs/promises');
		const candidates = [
			`${srcRoot}/../tests/relation-extractor.spec.ts`,
			`${srcRoot}/../tests/relationship-extractor.spec.ts`,
		];
		for (const p of candidates) {
			try {
				await access(p);
				return { open: false, evidence: `test file exists: ${p.split('/tests/')[1]}` };
			} catch { /* try next */ }
		}
		return { open: true, evidence: 'tests/relation-extractor.spec.ts does not exist' };
	} catch {
		return { open: true, evidence: 'Could not check test file' };
	}
}

async function checkGapRel004(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const typesPath = `${srcRoot}/lib/server/ace/types.ts`;
		const types = await readFile(typesPath, 'utf8').catch(() => '');
		const assembler = await readFile(`${srcRoot}/lib/server/ace/context-assembler.ts`, 'utf8').catch(() => '');
		const hasClusterContext = types.includes('clusterContext') || assembler.includes('clusterContext') ||
			assembler.includes('qdrant_cluster_tags') || assembler.includes('ClusterContextPacket');
		return {
			open: !hasClusterContext,
			evidence: hasClusterContext
				? 'clusterContext is referenced in ACEContext types or context-assembler.ts'
				: 'No clusterContext or cluster tag injection found in ACE types/assembler',
		};
	} catch {
		return { open: true, evidence: 'Could not read ACE types or context-assembler.ts' };
	}
}

async function checkGapRel005(srcRoot: string): Promise<CheckResult> {
	try {
		const { access } = await import('node:fs/promises');
		const scriptPath = `${srcRoot}/../scripts/graph/build-codebase-relationships.mjs`;
		try {
			await access(scriptPath);
			return { open: false, evidence: 'scripts/graph/build-codebase-relationships.mjs exists' };
		} catch {
			return { open: true, evidence: 'scripts/graph/build-codebase-relationships.mjs does not exist' };
		}
	} catch {
		return { open: true, evidence: 'Could not check build-codebase-relationships.mjs' };
	}
}

async function checkGapRel006(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const startupPlan = await readFile(`${srcRoot}/../scripts/startup-plan.mjs`, 'utf8').catch(() => '');
		const assembler   = await readFile(`${srcRoot}/lib/server/ace/context-assembler.ts`, 'utf8').catch(() => '');
		const mcpServer   = await readFile(`${srcRoot}/mcp/trace-mcp-server.ts`, 'utf8').catch(() => '');
		const isWired = startupPlan.includes('ingest.jsonl') || assembler.includes('ingest.jsonl') ||
			mcpServer.includes('kag_search') || assembler.includes('kagNotes');
		return {
			open: !isWired,
			evidence: isWired
				? 'ingest.jsonl or kag_search is referenced in startup-plan.mjs / context-assembler / MCP server'
				: 'ingest.jsonl not consumed by any ACE/KAG/MCP path',
		};
	} catch {
		return { open: true, evidence: 'Could not check ingest.jsonl wiring' };
	}
}

async function checkGapSynth001(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const orch = await readFile(`${srcRoot}/lib/server/agents/trace-subagent-orchestrator.ts`, 'utf8');
		const isStub = orch.includes("runAndPersistStub('llm_synthesis'") ||
			orch.includes('runAndPersistStub("llm_synthesis"') ||
			orch.includes("ctx.synthesis = 'Synthesis from TRACE");
		const hasRealCall = orch.includes('turboQuantChat') || orch.includes('bifrostChat') ||
			orch.includes('archiveSynthesisMemory');
		return {
			open: isStub && !hasRealCall,
			evidence: hasRealCall
				? 'llm_synthesis subagent calls a real LLM (turboQuantChat/bifrostChat)'
				: isStub
				? 'llm_synthesis is a hardcoded stub in trace-subagent-orchestrator.ts'
				: 'llm_synthesis status unknown in trace-subagent-orchestrator.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read trace-subagent-orchestrator.ts' };
	}
}

async function checkGapSynth002(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const orch = await readFile(`${srcRoot}/lib/server/agents/trace-subagent-orchestrator.ts`, 'utf8');
		const hasArchive = orch.includes('synthesis-memory-archiver') || orch.includes('archiveSynthesisMemory');
		return {
			open: !hasArchive,
			evidence: hasArchive
				? 'synthesis-memory-archiver is imported/called in trace-subagent-orchestrator.ts'
				: 'synthesis-memory-archiver not wired into trace-subagent-orchestrator.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read trace-subagent-orchestrator.ts' };
	}
}

async function checkGapSynth003(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const embedder = await readFile(`${srcRoot}/lib/server/indexer/dual-embedder.ts`, 'utf8');
		const hasClusterKey = embedder.includes('cluster_key');
		return {
			open: !hasClusterKey,
			evidence: hasClusterKey
				? 'cluster_key field found in dual-embedder.ts payload'
				: 'cluster_key absent from dual-embedder.ts Qdrant payload',
		};
	} catch {
		return { open: true, evidence: 'Could not read dual-embedder.ts' };
	}
}

async function checkGapSynth004(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const pkg = await readFile(`${srcRoot}/../package.json`, 'utf8');
		const hasScript = pkg.includes('writeAuthorityScoresToQdrant') || pkg.includes('graphify:authority');
		return {
			open: !hasScript,
			evidence: hasScript
				? 'graphAuthorityScore nightly job is wired (graphify:authority npm script found)'
				: 'No npm script or scheduler calls writeAuthorityScoresToQdrant',
		};
	} catch {
		return { open: true, evidence: 'Could not read package.json' };
	}
}

async function checkGapSynth005(srcRoot: string): Promise<CheckResult> {
	try {
		const { readFile } = await import('node:fs/promises');
		const assembler = await readFile(`${srcRoot}/lib/server/ace/context-assembler.ts`, 'utf8');
		const hasPayloadWrite = assembler.includes('rerank_score_avg') || assembler.includes('query_hit_count') ||
			(assembler.includes('setPayload') && assembler.includes('recordChunkHits'));
		return {
			open: !hasPayloadWrite,
			evidence: hasPayloadWrite
				? 'RerankBreakdown scores are written back to Qdrant payload in context-assembler.ts'
				: 'No Qdrant payload write-back for RerankBreakdown in context-assembler.ts',
		};
	} catch {
		return { open: true, evidence: 'Could not read context-assembler.ts' };
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface AnalyzerOptions {
	srcRoot: string;    // Absolute path to sveltekit-frontend/src
	runIdOverride?: string;
}

// Per-gap score parameters (centrality pre-estimated from graph; 0 = unknown)
const GAP_SCORE_PARAMS: Array<{ centrality: number; hasTestGap: boolean }> = [
	{ centrality: 0.6, hasTestGap: true  }, // gap_ace_001: high-centrality (context-assembler)
	{ centrality: 0.4, hasTestGap: true  }, // gap_ace_002: medium (multi-lane-retrieval)
	{ centrality: 0.6, hasTestGap: true  }, // gap_ace_003: high (context-assembler)
	{ centrality: 0.3, hasTestGap: false }, // gap_ace_004: medium (error-fingerprint)
	{ centrality: 0.5, hasTestGap: false }, // gap_wiki_001: medium (retrieval-lanes)
	{ centrality: 0.2, hasTestGap: false }, // gap_wiki_002: low (schema only)
	{ centrality: 0.4, hasTestGap: true  }, // gap_wiki_003: is itself a test gap
	{ centrality: 0.5, hasTestGap: true  }, // gap_rel_001: high (relationship-extractor source)
	{ centrality: 0.3, hasTestGap: false }, // gap_rel_002: medium (schema only)
	{ centrality: 0.3, hasTestGap: true  }, // gap_rel_003: is itself a test gap
	{ centrality: 0.7, hasTestGap: false }, // gap_synth_001: HIGH — stub blocks entire synthesis layer
	{ centrality: 0.5, hasTestGap: false }, // gap_synth_002: MED — archiver orphaned
	{ centrality: 0.4, hasTestGap: false }, // gap_synth_003: MED — cluster_key payload gap
	{ centrality: 0.5, hasTestGap: false }, // gap_synth_004: MED — authority score cron unscheduled
	{ centrality: 0.3, hasTestGap: false }, // gap_synth_005: LOW — rerank writeback missing
	{ centrality: 0.6, hasTestGap: false }, // gap_rel_004: HIGH — llm_synthesis missing cluster context
	{ centrality: 0.4, hasTestGap: false }, // gap_rel_005: MED — artifact builder not created
	{ centrality: 0.4, hasTestGap: false }, // gap_rel_006: MED — ingest.jsonl not ACE-readable
];

export async function analyzeWikiGaps(opts: AnalyzerOptions): Promise<GapReport> {
	const rid = opts.runIdOverride ?? runId();
	const now = new Date().toISOString();

	const checks = await Promise.allSettled([
		checkGap001(opts.srcRoot),
		checkGap002(opts.srcRoot),
		checkGap003(opts.srcRoot),
		checkGap004(opts.srcRoot),
		checkGapWiki001(opts.srcRoot),
		checkGapWiki002(opts.srcRoot),
		checkGapWiki003(opts.srcRoot),
		checkGapRel001(opts.srcRoot),
		checkGapRel002(opts.srcRoot),
		checkGapRel003(opts.srcRoot),
		checkGapRel004(opts.srcRoot),
		checkGapRel005(opts.srcRoot),
		checkGapRel006(opts.srcRoot),
		checkGapSynth001(opts.srcRoot),
		checkGapSynth002(opts.srcRoot),
		checkGapSynth003(opts.srcRoot),
		checkGapSynth004(opts.srcRoot),
		checkGapSynth005(opts.srcRoot),
	]);

	const gaps: WikiGap[] = GAP_DEFINITIONS.map((def, i) => {
		const check = checks[i];
		const result: CheckResult =
			check.status === 'fulfilled'
				? check.value
				: { open: true, evidence: 'check threw: ' + String((check as PromiseRejectedResult).reason) };

		const scoreParams = GAP_SCORE_PARAMS[i] ?? { centrality: 0, hasTestGap: false };
		const score = computeGapScore({
			severity: def.severity,
			affectedFiles: def.affectedFiles,
			affectedMcpTools: def.affectedMcpTools,
			hasTestGap: scoreParams.hasTestGap,
			centrality: scoreParams.centrality,
		});

		return {
			...def,
			score: Math.round(score * 100) / 100,
			status: result.open ? 'open' : 'fixed',
			discoveredByRun: rid,
			createdAt: now,
			updatedAt: now,
			summary: result.open
				? def.summary
				: `[FIXED] ${def.summary} | Evidence: ${result.evidence}`,
		} satisfies WikiGap;
	});

	const open = gaps.filter((g) => g.status === 'open');
	const bySeverity = (s: GapSeverity) => open.filter((g) => g.severity === s).length;

	return {
		runId: rid,
		pipelineVersion: PIPELINE_VERSION,
		generatedAt: now,
		gaps,
		summary: {
			total: gaps.length,
			high: bySeverity('HIGH'),
			med: bySeverity('MED'),
			low: bySeverity('LOW'),
			open: open.length,
		},
	};
}

export { GAP_DEFINITIONS };
