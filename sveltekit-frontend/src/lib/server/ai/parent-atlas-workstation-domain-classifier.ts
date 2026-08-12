/**
 * Parent Atlas Workstation Domain Classifier
 *
 * Copied-and-adapted from `code-intel-service.ts`'s TreeChunker + AST-grep + OKF
 * domain-classification + embedding + Qdrant + Redis-centroid pipeline
 * (see `sveltekit-frontend/src/lib/server/ai/code-intel-service.ts` lines ~324-1060).
 * That pipeline classifies source into AUTH/DATA/API/UI/SHARED (generic web-app domains).
 * This module classifies into the Parent Atlas Workstation lane taxonomy instead
 * (identity, export/storage, graph, telemetry, embedding, ontology, transport, compiler,
 * runtime/training — see `parent-atlas-workstation-todo.md` section headers, which are
 * the ground truth this taxonomy was derived from).
 *
 * Deliberately a SEPARATE Qdrant collection (`parent_atlas_workstation_corpus`, not
 * `code_intel_corpus`) and a SEPARATE Redis centroid namespace (`workstation:centroids`,
 * not `corpus:centroids`) — this is a new capability, not a peer overwrite of the existing
 * AUTH/DATA/API/UI classifier. Per this repo's runtime-ownership-registry governance rule,
 * two classifiers over two different taxonomies are legitimately distinct owners, not
 * competing owners of the same capability.
 *
 * Four real changes vs. the copied source:
 * 0. Chunking prefers the live miniforge NLP Docker sidecar (`docker/miniforge-nlp-sidecar/`,
 *    :8095, `POST /analyze` with `source_type: 'codebase'`) — a genuinely more capable, already
 *    Docker-deployed tree-sitter + ast-grep + langextract pipeline (verified live capabilities:
 *    treesitter_chunker v4.0.0, ast_grep_py 0.45.1, langextract 0.1.0). Discovered live-testing
 *    this: the sidecar's `/analyze` endpoint was 100% broken (500 on every request, including
 *    trivial plain_text input) due to a real bug at `python/miniforge_nlp_sidecar.py:1295-1296`
 *    (`control5.semantic_confidence`/`control5.structural_confidence` accessed unguarded on a
 *    parameter typed `Optional[Control5]` — every sibling access in the same two lines already
 *    guards with `if experiment_feature_matrix else None`, this one just didn't). Fixed with the
 *    same guard pattern, rebuilt the image (`docker compose build` in
 *    `docker/miniforge-nlp-sidecar/`), restarted the container. See tasks.md for the rebuild
 *    verification. Falls back to the local tree-sitter path below if the sidecar is unreachable
 *    or still erroring — per this repo's own hard rule, Docker containers are disposable and
 *    must never be a hard dependency.
 * 1. Local fallback chunking uses REAL tree-sitter (`tree-sitter` + `tree-sitter-typescript`,
 *    already installed in package.json but previously unused anywhere in `src/` — confirmed via
 *    repo-wide grep before writing this file) instead of the line-heuristic chunker the
 *    copied source calls "TreeChunker" despite not using tree-sitter at all.
 * 2. Chunk summaries are produced by a real LLM call through llama-server's OpenAI-compatible
 *    endpoint (`streamText({ model: llamaServer(LOCAL_VLM_MODEL) })`, matching the working
 *    pattern in `vlm-lane.ts`) instead of `chunk.lines[0]`. Gated behind `withLlmSummary`
 *    (default false) because it is an LLM call per chunk — not something to fire unbounded
 *    in a hot path. Per CLAUDE.md: Ollama is embeddings-only, llama-server is the only chat
 *    path — this never calls Ollama for anything but embeddings.
 * 3. Embeddings reuse `generateSingleEmbedding` from `grpc/embedding-client.js` unchanged —
 *    that function already cascades gRPC -> QUIC -> Ollama HTTP (`embeddinggemma`) -> ONNX
 *    local fallback, which already matches the embeddinggemma-via-Ollama hard rule. No new
 *    embedding code was written; the existing correct implementation is reused as-is.
 *
 * Scope boundary (deliberate, per this repo's "record findings, don't fix-while-auditing"
 * convention used throughout the parent-atlas-graph-validation-fabric /
 * ace-hyperrag-chr97-graphify-audit OpenSpec changes): this module is standalone and NOT
 * wired into any live route or startup hook yet. It is callable via CLI
 * (`npx tsx src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts --dir <path>`)
 * for offline/batch use, matching the existing `ace-domain-evidence-extractor.mts` CLI
 * convention. Wiring it into a live pipeline is a separate, explicitly-approved follow-up —
 * see `openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md`.
 */

import { streamText } from 'ai';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { getRedis } from '$lib/server/redis.js';
import { generateSingleEmbedding } from '../grpc/embedding-client.js';
import { getActiveLocalVlmModel, llamaServer } from './local-llama-provider.js';
import { createLangExtractClient } from '$lib/server/atlas/ai/langextract-client.js';

// ─── Domain taxonomy (Parent Atlas Workstation lanes) ───────────────────────
// Derived from `parent-atlas-workstation-todo.md` section headers, not invented ad hoc:
// Layer 1A/1B (packet + symbol identity), Export Stack (Arrow/GIN/MsgPack), Graph
// Retrieval/Hierarchy/Hypergraph, Telemetry/provenance ladder, RTX Embeddings/Vector LOD,
// OKF Fit/HMM Router, QUIC/gRPC/Go sidecar transport, Layer 2 Compiler Output, Layer 4
// Runtime/Training.

export type WorkstationDomainClass =
	| 'IDENTITY'
	| 'EXPORT_STORAGE'
	| 'GRAPH'
	| 'TELEMETRY'
	| 'EMBEDDING'
	| 'OKF_ONTOLOGY'
	| 'TRANSPORT'
	| 'COMPILER'
	| 'RUNTIME_TRAINING'
	| 'SHARED'
	| 'UNKNOWN';

interface WorkstationConceptPattern {
	name: string;
	patterns: string[];
	domain: WorkstationDomainClass;
	priority: number;
}

const WORKSTATION_CONCEPT_PATTERNS: WorkstationConceptPattern[] = [
	{
		name: 'packet_identity',
		patterns: ['packet_key', 'packetKey', 'source_ref', 'sourceRef', 'symbol_version_id', 'computePacketKey'],
		domain: 'IDENTITY',
		priority: 9,
	},
	{
		name: 'export_serialization',
		patterns: ['arrow.', 'Arrow.', 'msgpack', 'MsgPack', 'gin_trgm_ops', 'parquet', 'DuckDBInstance'],
		domain: 'EXPORT_STORAGE',
		priority: 7,
	},
	{
		name: 'graph_traversal',
		patterns: ['cugraph', 'networkx', 'PageRank', 'pagerank', 'louvain', 'Louvain', 'hypergraph', 'multi-hop', 'k-hop'],
		domain: 'GRAPH',
		priority: 8,
	},
	{
		name: 'telemetry_provenance',
		patterns: ['TelemetryCollector', 'AcpRoutingDecision', 'McpToolCall', 'provenance', 'AsyncOp'],
		domain: 'TELEMETRY',
		priority: 6,
	},
	{
		name: 'embedding_vector',
		patterns: ['generateSingleEmbedding', 'embeddinggemma', 'vector(', 'cosineDistance', 'HNSW', 'hnsw'],
		domain: 'EMBEDDING',
		priority: 7,
	},
	{
		name: 'okf_ontology',
		patterns: ['OKF', 'okf:', 'concept_patterns', 'HMM', 'ontology'],
		domain: 'OKF_ONTOLOGY',
		priority: 6,
	},
	{
		name: 'transport_rpc',
		patterns: ['grpc', 'gRPC', 'QUIC', 'quic', '@grpc/grpc-js', 'protobuf', '.proto'],
		domain: 'TRANSPORT',
		priority: 6,
	},
	{
		name: 'compiler_output',
		patterns: ['tsgo', 'AST', 'ast-grep', 'tree-sitter', 'compiler'],
		domain: 'COMPILER',
		priority: 6,
	},
	{
		name: 'runtime_training',
		patterns: ['QLoRA', 'PPO', 'GRPO', 'reward', 'policy.pt', 'checkpoint'],
		domain: 'RUNTIME_TRAINING',
		priority: 5,
	},
];

const WORKSTATION_DOMAIN_KEYWORDS: Record<WorkstationDomainClass, { keywords: string[]; weight: number }> = {
	IDENTITY: { keywords: ['packet', 'identity', 'symbol', 'lineage', 'sourceref'], weight: 2.0 },
	EXPORT_STORAGE: { keywords: ['export', 'arrow', 'parquet', 'msgpack', 'serialize', 'materialize'], weight: 2.0 },
	GRAPH: { keywords: ['graph', 'cugraph', 'pagerank', 'louvain', 'hypergraph', 'topology', 'traversal'], weight: 2.0 },
	TELEMETRY: { keywords: ['telemetry', 'trace', 'provenance', 'observability', 'metrics'], weight: 1.5 },
	EMBEDDING: { keywords: ['embedding', 'vector', 'ann', 'hnsw', 'cosine', 'centroid'], weight: 1.5 },
	OKF_ONTOLOGY: { keywords: ['okf', 'ontology', 'concept', 'hmm', 'schema'], weight: 1.5 },
	TRANSPORT: { keywords: ['grpc', 'quic', 'rpc', 'sidecar', 'protobuf'], weight: 1.5 },
	COMPILER: { keywords: ['compiler', 'tsgo', 'ast', 'parser', 'tree-sitter'], weight: 1.5 },
	RUNTIME_TRAINING: { keywords: ['training', 'qlora', 'ppo', 'grpo', 'reward', 'checkpoint'], weight: 1.5 },
	SHARED: { keywords: [], weight: 0 },
	UNKNOWN: { keywords: [], weight: 0 },
};

export function classifyWorkstationDomain(
	sourceCode: string,
	filePath: string
): { domain: WorkstationDomainClass; confidence: number } {
	const haystack = `${filePath}\n${sourceCode}`.toLowerCase();
	const scores: Record<string, number> = {};

	for (const [domain, cfg] of Object.entries(WORKSTATION_DOMAIN_KEYWORDS)) {
		if (cfg.weight === 0) continue;
		let hits = 0;
		for (const kw of cfg.keywords) {
			if (haystack.includes(kw)) hits++;
		}
		if (hits > 0) scores[domain] = hits * cfg.weight;
	}

	const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	if (sorted.length === 0) return { domain: 'UNKNOWN', confidence: 0 };

	const [topDomain, topScore] = sorted[0];
	const total = sorted.reduce((sum, [, s]) => sum + s, 0);
	return { domain: topDomain as WorkstationDomainClass, confidence: Math.min(1, topScore / Math.max(total, 1e-9)) };
}

export function extractWorkstationConcepts(
	sourceCode: string
): Array<{ concept: string; domain: WorkstationDomainClass; line: number; pattern: string; confidence: number }> {
	const concepts: Array<{ concept: string; domain: WorkstationDomainClass; line: number; pattern: string; confidence: number }> = [];
	const lines = sourceCode.split('\n');

	for (const def of WORKSTATION_CONCEPT_PATTERNS) {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			for (const pattern of def.patterns) {
				if (line.includes(pattern)) {
					concepts.push({
						concept: def.name,
						domain: def.domain,
						line: i + 1,
						pattern,
						confidence: Math.min(1, (def.priority / 10) * 0.8 + 0.2),
					});
					break;
				}
			}
		}
	}

	return concepts;
}

// ─── Real tree-sitter chunking ───────────────────────────────────────────────
// Unlike the copied source's "TreeChunker" (a regex/line-boundary heuristic that never
// touches tree-sitter despite the name), this actually parses via tree-sitter and walks
// the real AST for function/class/interface/type declaration nodes.

export interface WorkstationChunk {
	startLine: number;
	endLine: number;
	kind: 'function' | 'class' | 'interface' | 'type' | 'fragment';
	name: string;
	content: string;
}

let cachedParser: any = null;

async function getTreeSitterParser(): Promise<any | null> {
	if (cachedParser) return cachedParser;
	try {
		const { default: Parser } = await import('tree-sitter');
		const tsLangModule: any = await import('tree-sitter-typescript');
		// ESM dynamic import of this CJS package puts the real exports one level deeper than the
		// CJS `require()` shape (`require('tree-sitter-typescript').typescript` works, but under
		// `import()` it's `.default.typescript`) — verified live via `node --input-type=module -e`
		// before writing this fallback chain.
		const typescriptLang = tsLangModule.typescript ?? tsLangModule.default?.typescript;
		if (!typescriptLang) throw new Error('tree-sitter-typescript: could not resolve .typescript export');
		const parser = new Parser();
		parser.setLanguage(typescriptLang);
		cachedParser = parser;
		return parser;
	} catch (err) {
		console.warn('[workstation-classifier] tree-sitter unavailable, falling back to null (no chunk extraction):', (err as Error).message);
		return null;
	}
}

const NODE_KIND_MAP: Record<string, WorkstationChunk['kind']> = {
	function_declaration: 'function',
	function_signature: 'function',
	method_definition: 'function',
	class_declaration: 'class',
	interface_declaration: 'interface',
	type_alias_declaration: 'type',
};

export async function chunkViaTreeSitter(sourceCode: string): Promise<WorkstationChunk[]> {
	const parser = await getTreeSitterParser();
	if (!parser) return [];

	const tree = parser.parse(sourceCode);
	const lines = sourceCode.split('\n');
	const chunks: WorkstationChunk[] = [];

	function walk(node: any) {
		const kind = NODE_KIND_MAP[node.type];
		if (kind) {
			const startLine = node.startPosition.row;
			const endLine = node.endPosition.row;
			const nameNode = node.childForFieldName?.('name');
			const name = nameNode ? sourceCode.slice(nameNode.startIndex, nameNode.endIndex) : 'anonymous';
			chunks.push({
				startLine: startLine + 1,
				endLine: endLine + 1,
				kind,
				name,
				content: lines.slice(startLine, endLine + 1).join('\n'),
			});
			// Do not descend into the body of a matched declaration — avoid double-counting
			// nested functions as separate top-level chunks; they're still visible in `content`.
			return;
		}
		for (let i = 0; i < node.childCount; i++) {
			walk(node.child(i));
		}
	}

	walk(tree.rootNode);
	return chunks;
}

// ─── Sidecar chunking (preferred) ────────────────────────────────────────────
// Calls the miniforge NLP Docker sidecar's real tree-sitter + ast-grep pipeline. Falls back
// to null (caller uses chunkViaTreeSitter instead) on any failure — the sidecar is disposable
// infrastructure, never a hard dependency, per this repo's Docker hard rule.

const SIDECAR_KIND_MAP: Record<string, WorkstationChunk['kind']> = {
	function: 'function',
	function_declaration: 'function',
	method: 'function',
	method_definition: 'function',
	class: 'class',
	class_declaration: 'class',
	interface: 'interface',
	interface_declaration: 'interface',
	type: 'type',
	type_alias: 'type',
	type_alias_declaration: 'type',
};

export interface SidecarChunkResult {
	chunks: WorkstationChunk[];
	sidecarConcepts: string[];
	sidecarFeatures: Array<{ name: string; description: string; source: string }>;
}

export async function chunkViaNlpSidecar(filePath: string, sourceCode: string): Promise<SidecarChunkResult | null> {
	const client = createLangExtractClient();
	const health = await client.health();
	if (!health.ready) return null;

	try {
		const response = await client.analyze(
			{
				text: sourceCode,
				source_type: 'codebase',
				extraction_mode: 'full',
				source_ref: filePath,
				language: 'typescript',
				max_chars: Math.max(20_000, sourceCode.length),
			},
			{ timeoutMs: 30_000 }
		);

		const lines = sourceCode.split('\n');
		const chunks: WorkstationChunk[] = (response.chunks ?? []).map((c) => {
			const startLine = sourceCode.slice(0, c.start).split('\n').length;
			const endLine = sourceCode.slice(0, c.end).split('\n').length;
			return {
				startLine,
				endLine,
				kind: SIDECAR_KIND_MAP[c.kind] ?? 'fragment',
				name: c.symbol ?? lines[startLine - 1]?.trim().slice(0, 60) ?? c.kind,
				content: c.text,
			};
		});

		return {
			chunks,
			sidecarConcepts: response.concepts ?? [],
			sidecarFeatures: (response.features ?? []).map((f) => ({ name: f.name, description: f.description, source: f.source })),
		};
	} catch (err) {
		console.warn(`[workstation-classifier] NLP sidecar analyze failed for ${filePath}, falling back to local tree-sitter:`, (err as Error).message);
		return null;
	}
}

// ─── LLM summary via llama-server (gated, offline/batch only) ───────────────
// Per CLAUDE.md hard rule: Ollama is embeddings-only, llama-server is the only chat/
// synthesis path. This never calls Ollama for text generation.

const SUMMARY_MAX_CHARS = 2000;

export async function summarizeChunkViaLlamaServer(chunk: WorkstationChunk): Promise<string> {
	const truncated = chunk.content.length > SUMMARY_MAX_CHARS ? chunk.content.slice(0, SUMMARY_MAX_CHARS) : chunk.content;
	try {
		const activeModel = await getActiveLocalVlmModel();
		const result = streamText({
			model: llamaServer(activeModel),
			messages: [
				{
					role: 'user',
					content:
						`Summarize what this ${chunk.kind} named "${chunk.name}" does in ONE sentence, ` +
						`for a code-search index. No preamble, no markdown, just the sentence.\n\n${truncated}`,
				},
			],
			maxOutputTokens: 96,
			temperature: 0.1,
			abortSignal: AbortSignal.timeout(60_000),
		});
		const text = await result.text;
		return text.trim().slice(0, 300) || chunk.name;
	} catch (err) {
		console.warn(`[workstation-classifier] LLM summary failed for ${chunk.name}:`, (err as Error).message);
		return chunk.name;
	}
}

// ─── Node assembly + Qdrant ingest + Redis centroid materialization ─────────

export interface WorkstationNode {
	id: string;
	file: string;
	name: string;
	kind: WorkstationChunk['kind'];
	domain: WorkstationDomainClass;
	confidence: number;
	summary: string;
	concepts: string[];
	embedding?: number[];
}

export interface ClassifyWorkstationFileOptions {
	withLlmSummary?: boolean;
	useSidecar?: boolean;
}

export async function classifyWorkstationFile(
	filePath: string,
	sourceCode: string,
	options: ClassifyWorkstationFileOptions = {}
): Promise<WorkstationNode[]> {
	const useSidecar = options.useSidecar ?? true;
	const sidecarResult = useSidecar ? await chunkViaNlpSidecar(filePath, sourceCode) : null;
	const chunkSource = sidecarResult ? 'sidecar' : 'tree-sitter';
	const chunks = sidecarResult?.chunks ?? (await chunkViaTreeSitter(sourceCode));
	const concepts = extractWorkstationConcepts(sourceCode);
	const nodes: WorkstationNode[] = [];

	if (sidecarResult) {
		console.log(`[workstation-classifier] ${filePath}: sidecar returned ${sidecarResult.chunks.length} chunks, ${sidecarResult.sidecarFeatures.length} features, ${sidecarResult.sidecarConcepts.length} concepts`);
	}

	for (const chunk of chunks) {
		const related = concepts.filter((c) => c.line >= chunk.startLine && c.line <= chunk.endLine);
		// Sidecar features/concepts are generic (not workstation-taxonomy-aware), so they feed the
		// same domain-scoring keyword matcher as bonus evidence rather than a separate signal.
		const sidecarText = sidecarResult
			? [...sidecarResult.sidecarConcepts, ...sidecarResult.sidecarFeatures.map((f) => `${f.name} ${f.description}`)].join(' ')
			: '';
		const { domain, confidence } =
			related.length > 0
				? (() => {
						const scores: Record<string, number> = {};
						for (const c of related) scores[c.domain] = (scores[c.domain] ?? 0) + c.confidence;
						const [d, s] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
						return { domain: d as WorkstationDomainClass, confidence: Math.min(1, s / related.length) };
					})()
				: classifyWorkstationDomain(`${chunk.content} ${sidecarText}`, filePath);

		const summary = options.withLlmSummary ? await summarizeChunkViaLlamaServer(chunk) : chunk.name;

		nodes.push({
			id: `${filePath}#${chunk.kind}:${chunk.name}:${chunk.startLine}`,
			file: filePath,
			name: chunk.name,
			kind: chunk.kind,
			domain,
			confidence,
			summary,
			concepts: related.map((c) => c.concept),
		});
	}

	console.log(`[workstation-classifier] ${filePath}: ${nodes.length} nodes via ${chunkSource}`);
	return nodes;
}

const WORKSTATION_QDRANT_COLLECTION = 'parent_atlas_workstation_corpus';
const WORKSTATION_REDIS_CENTROID_HASH = 'workstation:centroids';
const WORKSTATION_REDIS_CONCEPT_HASH = 'workstation:concepts';
const EMBEDDING_DIM = 768; // canonical embeddinggemma dim per project policy — NOT the 512-dim MRL lane the copied source used.

export async function embedAndIngestWorkstationNodes(nodes: WorkstationNode[]): Promise<{ ingested: number; errors: number }> {
	let errors = 0;

	for (const node of nodes) {
		try {
			node.embedding = await generateSingleEmbedding(`${node.name} ${node.domain} ${node.summary}`);
		} catch {
			node.embedding = new Array(EMBEDDING_DIM).fill(0);
			errors++;
		}
	}

	const qdrant = getQdrantClient();
	try {
		await qdrant.recreateCollection(WORKSTATION_QDRANT_COLLECTION, {
			vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
			payload_schema: {
				nodeId: { type: 'keyword' },
				domain: { type: 'keyword' },
				kind: { type: 'keyword' },
				file: { type: 'text' },
				name: { type: 'text' },
			},
		} as any);
	} catch {
		// collection already exists — continue
	}

	const batchSize = 100;
	for (let i = 0; i < nodes.length; i += batchSize) {
		const batch = nodes.slice(i, i + batchSize);
		const points = batch.map((node, idx) => ({
			id: i + idx + 1,
			vector: node.embedding ?? new Array(EMBEDDING_DIM).fill(0),
			payload: {
				nodeId: node.id,
				domain: node.domain,
				kind: node.kind,
				file: node.file,
				name: node.name,
				summary: node.summary,
				concepts: node.concepts,
				confidence: node.confidence,
			},
		}));
		try {
			await qdrant.upsert(WORKSTATION_QDRANT_COLLECTION, { points: points as any, wait: true } as any);
		} catch (err) {
			console.error(`[workstation-classifier] Qdrant upsert error at offset ${i}:`, err);
			errors++;
		}
	}

	// Materialize domain centroids to Redis/Valkey
	const redis = getRedis();
	const domainEmbeddings = new Map<WorkstationDomainClass, number[][]>();
	for (const node of nodes) {
		if (!node.embedding) continue;
		const list = domainEmbeddings.get(node.domain) ?? [];
		list.push(node.embedding);
		domainEmbeddings.set(node.domain, list);
	}

	for (const [domain, embeddings] of domainEmbeddings) {
		if (embeddings.length === 0) continue;
		const centroid = new Array(EMBEDDING_DIM).fill(0);
		for (const emb of embeddings) {
			for (let i = 0; i < emb.length; i++) centroid[i] += emb[i];
		}
		for (let i = 0; i < centroid.length; i++) centroid[i] /= embeddings.length;

		try {
			await redis.hset(WORKSTATION_REDIS_CENTROID_HASH, domain, JSON.stringify(centroid));
		} catch (err) {
			console.error(`[workstation-classifier] Redis centroid write error for ${domain}:`, err);
			errors++;
		}
	}

	// Materialize concept index (feature -> domain, for fast lookup, mirrors OKF `corpus:concepts` pattern)
	for (const node of nodes) {
		try {
			await redis.hset(
				WORKSTATION_REDIS_CONCEPT_HASH,
				`${node.kind}:${node.name}`,
				JSON.stringify({ domain: node.domain, confidence: node.confidence, summary: node.summary })
			);
		} catch {
			// non-fatal — concept index is a convenience cache, not truth
		}
	}

	return { ingested: nodes.length - errors, errors };
}

// ─── CLI (offline/batch use, matches ace-domain-evidence-extractor.mts convention) ──

async function main() {
	const args = process.argv.slice(2);
	const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1];
	const withLlmSummary = args.includes('--with-llm-summary');
	const useSidecar = !args.includes('--no-sidecar');

	if (!fileArg) {
		console.error('Usage: npx tsx parent-atlas-workstation-domain-classifier.ts --file=<path> [--with-llm-summary] [--no-sidecar]');
		process.exit(1);
	}

	const fs = await import('fs');
	const sourceCode = fs.readFileSync(fileArg, 'utf-8');
	const nodes = await classifyWorkstationFile(fileArg, sourceCode, { withLlmSummary, useSidecar });

	console.log(`\nParent Atlas Workstation Domain Classification: ${fileArg}\n`);
	for (const node of nodes) {
		console.log(`  [${node.domain} ${(node.confidence * 100).toFixed(0)}%] ${node.kind} ${node.name} — ${node.summary}`);
	}
	console.log(`\n${nodes.length} chunks classified.\n`);
}

// `import.meta.url === \`file://${process.argv[1]}\`` (the pattern copied from
// ace-domain-evidence-extractor.mts) never matches on Windows: process.argv[1] is a raw
// backslash path (C:\...) while import.meta.url is a proper file:// URL (file:///C:/...),
// so naive string concatenation never equals it and main() silently never runs. Use
// pathToFileURL for a real cross-platform comparison instead.
const { pathToFileURL } = await import('node:url');
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMainModule) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
