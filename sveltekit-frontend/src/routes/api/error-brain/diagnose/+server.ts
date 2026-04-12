/**
 * Unified Error Diagnosis Endpoint
 *
 * POST /api/error-brain/diagnose
 * Body: DiagnoseRequest (see schema below)
 *
 * 5-stage pipeline:
 *   1. AST Subgraph Retrieval — dependency neighbors from cached graph
 *   2. Multi-Source Search — semantic code + error history + KB + runtime evidence (parallel)
 *   3. Multi-Signal Rerank — composite scoring across 7 signals (route/page affinity added)
 *   4. LLM Diagnosis — structured fix plan via Ollama + GBNF
 *   5. Cache + Store — Redis cache + Qdrant embedding + DB record
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { createHash } from 'crypto';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { callOllamaChat, bifrostChat } from '$lib/server/ollama.js';
import { setCache, cognitiveCache } from '$lib/server/cache.js';
import { searchSimilarErrors, embedErrorEvent } from '$lib/server/pipeline/error-embedding-pipeline.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';
import { db } from '$lib/server/db/client';
import { diagnosisEvents } from '$lib/server/db/schema-postgres.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ENV } from '$lib/server/env.server.js';

const consoleErrorSchema = z.object({
	message: z.string().max(2000),
	source: z.string().max(500).optional(),
	stack: z.string().max(3000).optional(),
	level: z.enum(['error', 'warn', 'info']).optional().default('error'),
});

const networkFailureSchema = z.object({
	url: z.string().max(1000),
	method: z.string().max(10).optional(),
	status: z.number().optional(),
	statusText: z.string().max(200).optional(),
	bodySnippet: z.string().max(1000).optional(),
});

const pageContextSchema = z.object({
	components: z.object({
		page: z.array(z.string()).optional(),
		pageServer: z.array(z.string()).optional(),
		layouts: z.array(z.string()).optional(),
		components: z.array(z.string()).optional(),
		stores: z.array(z.string()).optional(),
		apiEndpoints: z.array(z.string()).optional(),
	}).optional(),
	playwrightSnapshot: z.object({
		status: z.number().optional(),
		ok: z.boolean().optional(),
		consoleErrors: z.array(z.string()).optional(),
		failedRequests: z.array(z.string()).optional(),
		loadTimeMs: z.number().optional(),
		domElements: z.number().optional(),
	}).optional(),
	runtimeErrorCount: z.number().optional(),
	networkFailureCount: z.number().optional(),
}).optional();

const diagnosisSchema = z.object({
	query: z.string().min(3).max(5000),
	filePath: z.string().max(500).optional(),
	routePath: z.string().max(500).optional(),
	componentPath: z.string().max(500).optional(),
	consoleErrors: z.array(consoleErrorSchema).max(20).optional(),
	networkFailures: z.array(networkFailureSchema).max(20).optional(),
	pageContext: pageContextSchema,
	playwrightSnapshotId: z.string().max(100).optional(),
	mode: z.enum(['file', 'route', 'page', 'test', 'error-event']).optional().default('file'),
	limit: z.number().int().min(1).max(20).optional().default(10),
});

type DiagnosisMode = z.infer<typeof diagnosisSchema>['mode'];

const DIAGNOSIS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Mode-specific signal weights
const MODE_WEIGHTS: Record<NonNullable<DiagnosisMode>, {
	semantic: number;
	graphProximity: number;
	errorFrequency: number;
	recency: number;
	complexity: number;
	routePageAffinity: number;
	runtimeEvidence: number;
}> = {
	file: { semantic: 0.30, graphProximity: 0.25, errorFrequency: 0.15, recency: 0.10, complexity: 0.10, routePageAffinity: 0.05, runtimeEvidence: 0.05 },
	route: { semantic: 0.20, graphProximity: 0.20, errorFrequency: 0.15, recency: 0.10, complexity: 0.05, routePageAffinity: 0.20, runtimeEvidence: 0.10 },
	page: { semantic: 0.20, graphProximity: 0.15, errorFrequency: 0.10, recency: 0.05, complexity: 0.05, routePageAffinity: 0.20, runtimeEvidence: 0.25 },
	test: { semantic: 0.25, graphProximity: 0.20, errorFrequency: 0.10, recency: 0.15, complexity: 0.05, routePageAffinity: 0.10, runtimeEvidence: 0.15 },
	'error-event': { semantic: 0.25, graphProximity: 0.15, errorFrequency: 0.25, recency: 0.15, complexity: 0.05, routePageAffinity: 0.05, runtimeEvidence: 0.10 },
};

// ── Stage 1: AST Subgraph Retrieval ────────────────────────

interface GraphNode {
	id: string;
	label: string;
	type: string;
	filePath: string;
	cluster?: string;
	imports?: string[];
	complexity?: number;
}

interface GraphEdge {
	source: string;
	target: string;
}

async function getASTSubgraph(
	filePath: string,
	origin: URL,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; neighborFiles: string[] }> {
	try {
		// Reuse the cached graph API
		const res = await fetch(new URL('/api/codebase-index/graph?maxFiles=300', origin), {
      headers: { cookie: '' }, // Internal call, auth bypassed below
      signal: AbortSignal.timeout(15_000),
    });

		if (!res.ok) return { nodes: [], edges: [], neighborFiles: [] };

		const graph = (await res.json()) as { nodes: GraphNode[]; edges: GraphEdge[] };

		// Find the target node
		const normalizedPath = filePath.replace(/\\/g, '/');
		const targetNode = graph.nodes.find(
			(n) =>
				n.filePath === normalizedPath ||
				n.filePath === `src/${normalizedPath}` ||
				n.filePath.endsWith(normalizedPath),
		);

		if (!targetNode) return { nodes: graph.nodes.slice(0, 5), edges: [], neighborFiles: [] };

		// Extract 1-hop neighborhood: files that import this file + files this file imports
		const neighborIds = new Set<string>();
		neighborIds.add(targetNode.id);

		for (const edge of graph.edges) {
			if (edge.source === targetNode.id) neighborIds.add(edge.target);
			if (edge.target === targetNode.id) neighborIds.add(edge.source);
		}

		const neighborNodes = graph.nodes.filter((n) => neighborIds.has(n.id));
		const neighborEdges = graph.edges.filter(
			(e) => neighborIds.has(e.source) && neighborIds.has(e.target),
		);
		const neighborFiles = neighborNodes.map((n) => n.filePath).filter((f) => f !== normalizedPath);

		return { nodes: neighborNodes, edges: neighborEdges, neighborFiles };
	} catch {
		return { nodes: [], edges: [], neighborFiles: [] };
	}
}

// ── Stage 2: Multi-Source Search ──────────────────────────

interface SearchCandidate {
	id: string | number;
	score: number;
	filePath: string;
	content: string;
	source: 'semantic' | 'error_history' | 'kb' | 'graph_neighbor' | 'runtime_evidence';
	metadata: Record<string, unknown>;
}

async function multiSourceSearch(
	query: string,
	queryEmbedding: number[],
	graphNeighborFiles: string[],
	graphNodes: GraphNode[],
	runtimeEvidence: SearchCandidate[],
	limit: number,
): Promise<SearchCandidate[]> {
	const candidates: SearchCandidate[] = [];

	// Run all sources in parallel
	const [semanticResults, errorResults, graphCandidates] = await Promise.allSettled([
		// Source A: Semantic code search via codebase_chunks_768
		(async () => {
			const { results: hits } = await qdrant.hybridSearch({
				collection: 'codebase_chunks',
				query: query.slice(0, 512),
				queryEmbedding,
				limit: Math.min(limit, 8),
				scoreThreshold: 0.25,
			});
			return hits.map((hit) => {
				const p = (hit.payload ?? {}) as Record<string, unknown>;
				return {
					id: hit.id,
					score: hit.score,
					filePath: ((p.relativePath ?? p.filePath ?? p.path ?? '') as string).replace(/\\/g, '/'),
					content: ((p.content ?? p.text ?? '') as string).slice(0, 300),
					source: 'semantic' as const,
					metadata: {
						symbol: p.symbol,
						kind: p.kind,
						lineStart: p.lineStart,
						lineEnd: p.lineEnd,
					},
				};
			});
		})(),

		// Source B: Error history from error_embeddings collection
		searchSimilarErrors(query, 5, 0.3),

		// Source C: Graph neighbor enrichment
		Promise.resolve(
			graphNodes
				.filter((n) => graphNeighborFiles.includes(n.filePath))
				.sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
				.slice(0, 5)
				.map((n) => ({
					id: n.id,
					score: 0.5,
					filePath: n.filePath,
					content: `${n.type} — ${n.label} (complexity: ${n.complexity ?? 0})`,
					source: 'graph_neighbor' as const,
					metadata: { cluster: n.cluster, type: n.type, complexity: n.complexity },
				})),
		),
	]);

	// Collect semantic results
	if (semanticResults.status === 'fulfilled') {
		candidates.push(...semanticResults.value);
	}

	// Collect error history results
	if (errorResults.status === 'fulfilled') {
		for (const err of errorResults.value) {
			candidates.push({
				id: err.id,
				score: err.score,
				filePath: err.filePath,
				content: err.message,
				source: 'error_history',
				metadata: { clusterId: err.clusterId, severity: err.severity, createdAt: err.createdAt },
			});
		}
	}

	// Collect graph neighbors
	if (graphCandidates.status === 'fulfilled') {
		candidates.push(...graphCandidates.value);
	}

	// Source D: Runtime evidence (consoleErrors, networkFailures)
	candidates.push(...runtimeEvidence);

	return candidates;
}

// ── Stage 3: Multi-Signal Rerank ──────────────────────────

interface RankedCandidate extends SearchCandidate {
	finalScore: number;
	signals: {
		semantic: number;
		graphProximity: number;
		errorFrequency: number;
		recency: number;
		complexity: number;
		routePageAffinity: number;
		runtimeEvidence: number;
	};
}

function rerankCandidates(
	candidates: SearchCandidate[],
	graphNeighborFiles: string[],
	routePath: string | undefined,
	componentPath: string | undefined,
	mode: NonNullable<DiagnosisMode>,
	limit: number,
): RankedCandidate[] {
	const neighborSet = new Set(graphNeighborFiles);
	const now = Date.now();
	const weights = MODE_WEIGHTS[mode];

	// Build route/page affinity set: files that belong to the same route or page
	const routeSegments = routePath ? routePath.replace(/^\//, '').split('/') : [];

	const ranked: RankedCandidate[] = candidates.map((c) => {
		const semantic = c.score;

		// Graph proximity: 1.0 = direct import/dependent, 0.75 = same cluster, 0.0 = unrelated
		let graphProximity = 0;
		if (c.source === 'graph_neighbor') graphProximity = 1.0;
		else if (neighborSet.has(c.filePath)) graphProximity = 0.75;

		// Error frequency: boost error_history source
		const errorFrequency = c.source === 'error_history' ? 0.8 : 0;

		// Recency: exponential decay from creation timestamp
		let recency = 0;
		if (c.metadata.createdAt) {
			const ageMs = now - new Date(c.metadata.createdAt as string).getTime();
			const ageHours = ageMs / (1000 * 60 * 60);
			recency = Math.exp(-ageHours / 168); // Half-life of ~1 week
		}

		// Complexity signal: higher complexity = more likely error source
		const complexityRaw = (c.metadata.complexity as number) ?? 0;
		const complexity = Math.min(complexityRaw / 50, 1.0); // Normalize to 0-1

		// Route/page affinity: boost files belonging to the same route or component tree
		let routePageAffinity = 0;
		if (routePath && c.filePath) {
			const fp = c.filePath.replace(/\\/g, '/');
			// File is within the same route directory
			if (routeSegments.length > 0) {
				const routeDir = `routes/(app)/${routeSegments.join('/')}`;
				if (fp.includes(routeDir)) routePageAffinity = 1.0;
				// Same top-level route group
				else if (fp.includes(`routes/(app)/${routeSegments[0]}`)) routePageAffinity = 0.6;
			}
			// File matches an API endpoint called by this route
			if (routePath.startsWith('/api/') && fp.includes(routePath.replace(/^\//, 'routes/'))) {
				routePageAffinity = 0.9;
			}
		}
		// Boost if file is the component itself
		if (componentPath && c.filePath === componentPath.replace(/\\/g, '/')) {
			routePageAffinity = 1.0;
		}

		// Runtime evidence signal
		const runtimeEvidenceScore = c.source === 'runtime_evidence' ? 0.9 : 0;

		const finalScore =
			semantic * weights.semantic +
			graphProximity * weights.graphProximity +
			errorFrequency * weights.errorFrequency +
			recency * weights.recency +
			complexity * weights.complexity +
			routePageAffinity * weights.routePageAffinity +
			runtimeEvidenceScore * weights.runtimeEvidence;

		return {
			...c,
			finalScore,
			signals: { semantic, graphProximity, errorFrequency, recency, complexity, routePageAffinity, runtimeEvidence: runtimeEvidenceScore },
		};
	});

	// Deduplicate by file path, keeping highest score
	const seen = new Map<string, RankedCandidate>();
	for (const r of ranked) {
		const existing = seen.get(r.filePath);
		if (!existing || r.finalScore > existing.finalScore) {
			seen.set(r.filePath, r);
		}
	}

	return Array.from(seen.values())
		.sort((a, b) => b.finalScore - a.finalScore)
		.slice(0, limit);
}

// ── Stage 4: LLM Diagnosis ───────────────────────────────

interface EvidenceItem {
	kind: 'runtime-error' | 'network-failure' | 'graph-edge' | 'similar-fix' | 'semantic-match';
	source: string;
	snippet: string;
}

interface DiagnosisResult {
	diagnosisId?: string;
	diagnosis: string;
	probableRootCauseType: string;
	likelyFiles: string[];
	impactedFiles: { path: string; reason: string; confidence: number }[];
	fixPlan: { step: number; action: string; file: string; code?: string }[];
	similarPastErrors: { message: string; resolution: string }[];
	suggestedTests: { type: string; target: string }[];
	riskLevel: 'low' | 'medium' | 'high';
	needsHumanReview: boolean;
	unsafeToAutoPatch: boolean;
	evidence: EvidenceItem[];
}

/** Infer root cause type from diagnosis text when LLM doesn't set it correctly */
function inferRootCauseFromDiagnosis(diagnosis: string, query: string): string {
	const text = `${diagnosis} ${query}`.toLowerCase();
	// SSR/hydration first — window/document not defined, SSR mismatch
	if (/window is not defined|document is not defined|ssr.*mismatch|hydrat|server.*client.*mismatch/.test(text)) return 'hydration-mismatch';
	if (/cannot find module|module not found|missing.*import|resolve.*import|no such module/.test(text)) return 'missing-import';
	if (/api.*contract|endpoint.*mismatch|response.*schema|fetch.*fail/.test(text)) return 'bad-api-contract';
	if (/auth|unauthorized|401|forbidden|403|login.*fail|session.*expir/.test(text)) return 'auth-guard';
	if (/schema.*mismatch|column.*not|table.*not|drizzle|migration|pgvector/.test(text)) return 'schema-mismatch';
	if (/type\s*error|typeerror|cannot read prop|undefined is not|null is not/.test(text)) return 'type-error';
	if (/runtime.*error|uncaught|unhandled.*reject|exception.*thrown/.test(text)) return 'runtime-exception';
	if (/config.*error|env.*missing|environment.*variable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modulesvariable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modulesvariable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modules/.test(text)) return 'dependency-issue';
	return 'unknown';
}

async function generateDiagnosis(
	query: string,
	topCandidates: RankedCandidate[],
	subgraphSummary: string,
	runtimeContext: string,
	mode: NonNullable<DiagnosisMode>,
	routePath?: string,
): Promise<DiagnosisResult> {
	const codeContext = topCandidates
		.filter((c) => c.source === 'semantic' || c.source === 'graph_neighbor')
		.slice(0, 5)
		.map((c, i) => `[${i + 1}] ${c.filePath} (score: ${c.finalScore.toFixed(2)})\n${c.content}`)
		.join('\n\n');

	const errorContext = topCandidates
		.filter((c) => c.source === 'error_history')
		.slice(0, 3)
		.map((c, i) => `[${i + 1}] ${c.filePath}: ${c.content}`)
		.join('\n');

	const modeInstruction = {
		file: 'Focus on file-level dependencies, imports, and type mismatches.',
		route: 'Focus on route handlers, loaders, actions, and API contracts.',
		page: 'Focus on page components, stores, runtime errors, hydration, and API calls from the page.',
		test: 'Focus on test selectors, assertions, Playwright failures, and missing test fixtures.',
		'error-event': 'Focus on stack traces, error propagation paths, and recent similar failures.',
	}[mode];

	const systemPrompt = `You are a senior software architect diagnosing errors in a SvelteKit + TypeScript codebase.
Diagnosis mode: ${mode.toUpperCase()}
${modeInstruction}

Analyze the error, code context, AST graph, and runtime evidence.
Return ONLY compact valid JSON (no markdown, no extra text). Keep strings short.
Required fields:
- "diagnosis": string (1-3 sentences, max 300 chars)
- "probableRootCauseType": one of "missing-import","bad-api-contract","hydration-mismatch","auth-guard","schema-mismatch","type-error","runtime-exception","config-error","dependency-issue","unknown"
- "likelyFiles": string[] (top 3-5 file paths)
- "impactedFiles": {"path":string,"reason":string,"confidence":number}[] (max 5)
- "fixPlan": {"step":number,"action":string,"file":string}[] (max 5 steps)
- "suggestedTests": {"type":"playwright"|"unit"|"integration","target":string}[] (max 3)
- "riskLevel": "low"|"medium"|"high"
- "needsHumanReview": boolean
- "unsafeToAutoPatch": boolean`;

	const userPrompt = `ERROR QUERY: ${query}

DIAGNOSIS MODE: ${mode}

AST DEPENDENCY GRAPH:
${subgraphSummary || 'No graph data available'}

RELEVANT CODE (ranked by multi-signal reranking):
${codeContext || 'No code context available'}

RUNTIME EVIDENCE:
${runtimeContext || 'No runtime evidence available'}

SIMILAR PAST ERRORS:
${errorContext || 'No past error matches'}`;

	// Call LLM with Langfuse tracing + Bifrost semantic cache (when enabled)
	const { raw, llmTimeMs } = await traceLLM(
		'error-diagnosis',
		{
			model: 'gemma4-legal:latest',
			mode,
			backend: ENV.BIFROST_ENABLED ? 'bifrost' : 'ollama',
			queryLength: query.length,
			routePath: routePath,
		},
		async (gen) => {
			const startTime = performance.now();

			let content: string;
			if (ENV.BIFROST_ENABLED) {
				// Route through Bifrost gateway for semantic caching (high cache hit rate on error patterns)
				content = await bifrostChat(
					[
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt },
					],
					'gemma4-legal',
					{
						temperature: 0.3,
						maxTokens: 2048,
						timeoutMs: 45_000, // Error diagnosis can take longer than default 30s
						cacheKey: `error-brain-${mode}`, // Per-mode cache namespace for better hit rates
					}
				);
			} else {
				// Direct Ollama (fallback when Bifrost disabled)
				content = await callOllamaChat(systemPrompt, userPrompt, {
					format: 'json',
					num_predict: 2048,
					temperature: 0.3,
				});
			}

			const durationMs = performance.now() - startTime;
			gen.end({ output: content.slice(0, 1000), usage: { completionTokens: Math.ceil(content.length / 4) } });
			return { raw: content, llmTimeMs: durationMs };
		}
	);

	let cleaned = raw.trim();
	// Strip markdown fences (triple backticks) if present
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}
	// If the model wrapped the JSON in text, extract the first {...} block
	if (!cleaned.startsWith('{')) {
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
		if (jsonMatch) cleaned = jsonMatch[0];
	}

	// Build evidence array from candidates
	const evidence: EvidenceItem[] = topCandidates.slice(0, 8).map((c) => {
		const kindMap: Record<string, EvidenceItem['kind']> = {
			semantic: 'semantic-match',
			error_history: 'similar-fix',
			graph_neighbor: 'graph-edge',
			runtime_evidence: 'runtime-error',
		};
		return {
			kind: kindMap[c.source] ?? 'semantic-match',
			source: c.source,
			snippet: `${c.filePath}: ${c.content.slice(0, 150)}`,
		};
	});

	const VALID_ROOT_CAUSES = new Set([
		'missing-import', 'bad-api-contract', 'hydration-mismatch', 'auth-guard',
		'schema-mismatch', 'type-error', 'runtime-exception', 'config-error',
		'dependency-issue', 'unknown',
	]);

	try {
		const parsed = JSON.parse(cleaned) as Record<string, unknown>;
		// Flatten diagnosis — LLM may put it as a string, nested object, or spread across top-level keys
		let diagnosisText: string;
		if (typeof parsed.diagnosis === 'string' && parsed.diagnosis.length > 20) {
			diagnosisText = parsed.diagnosis;
		} else if (parsed.diagnosis && typeof parsed.diagnosis === 'object') {
			const d = parsed.diagnosis as Record<string, unknown>;
			diagnosisText = [d.root_cause, d.description, d.summary, d.impact, d.severity]
				.filter(Boolean).map(String).join('. ').slice(0, 1500) || JSON.stringify(d).slice(0, 500);
		} else {
			// LLM may spread fields at top level: root_cause, description, explanation, etc.
			const candidates = [parsed.root_cause, parsed.description, parsed.explanation,
				parsed.summary, parsed.impact, parsed.severity, parsed.fix, parsed.solution, parsed.error];
			const assembled = candidates.filter(v => typeof v === 'string' && v.length > 5).map(String).join('. ');
			diagnosisText = assembled.length > 20 ? assembled.slice(0, 1500) : cleaned.slice(0, 1500);
		}
		const llmCause = parsed.probableRootCauseType as string | undefined;
		// Accept LLM's answer only if it's a specific (non-unknown) valid type
		const rootCause = llmCause && llmCause !== 'unknown' && VALID_ROOT_CAUSES.has(llmCause)
			? llmCause
			: inferRootCauseFromDiagnosis(diagnosisText, query);
		return {
			diagnosis: diagnosisText,
			probableRootCauseType: rootCause,
			likelyFiles: Array.isArray(parsed.likelyFiles) ? parsed.likelyFiles : [],
			impactedFiles: Array.isArray(parsed.impactedFiles) ? parsed.impactedFiles : [],
			fixPlan: Array.isArray(parsed.fixPlan) ? parsed.fixPlan : [],
			similarPastErrors: Array.isArray(parsed.similarPastErrors) ? parsed.similarPastErrors : [],
			suggestedTests: Array.isArray(parsed.suggestedTests) ? parsed.suggestedTests : [],
			riskLevel: (['low', 'medium', 'high'] as const).includes(parsed.riskLevel as 'low') ? (parsed.riskLevel as 'low' | 'medium' | 'high') : 'medium',
			needsHumanReview: typeof parsed.needsHumanReview === 'boolean' ? parsed.needsHumanReview : true,
			unsafeToAutoPatch: typeof parsed.unsafeToAutoPatch === 'boolean' ? parsed.unsafeToAutoPatch : false,
			evidence,
		};
	} catch (parseErr) {
		console.warn('[diagnose] JSON parse failed, using inference fallback:', (parseErr as Error).message, 'Raw:', cleaned.slice(0, 200));
		return {
			diagnosis: cleaned.slice(0, 500),
			probableRootCauseType: inferRootCauseFromDiagnosis(cleaned, query),
			likelyFiles: topCandidates.slice(0, 3).map((c) => c.filePath),
			impactedFiles: topCandidates.slice(0, 3).map((c) => ({
				path: c.filePath,
				reason: c.content.slice(0, 100),
				confidence: c.finalScore,
			})),
			fixPlan: [],
			similarPastErrors: [],
			suggestedTests: [],
			riskLevel: 'medium',
			needsHumanReview: true,
			unsafeToAutoPatch: false,
			evidence,
		};
	}
}

// ── Handler ──────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = diagnosisSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, filePath, routePath, componentPath, consoleErrors, networkFailures, pageContext, mode, limit } = parsed.data;
	const startMs = Date.now();
	const timings: Record<string, number> = {};

	// Check cache (include mode + runtime evidence length in cache key for specificity)
	const cacheInput = `${query}:${filePath || ''}:${routePath || ''}:${mode}:${(consoleErrors?.length ?? 0) + (networkFailures?.length ?? 0)}`;
	const cacheKey = `ast:diagnosis:${createHash('sha256').update(cacheInput).digest('hex').slice(0, 16)}`;
	const cached = await cognitiveCache.getJsonbDocument<Record<string, unknown>>(cacheKey);
	if (cached) {
		return json({ ...cached, cached: true });
	}

	try {
		// Stage 1: AST Subgraph
		const astStart = Date.now();
		let subgraph = { nodes: [] as GraphNode[], edges: [] as GraphEdge[], neighborFiles: [] as string[] };
		let subgraphSummary = '';

		if (filePath) {
			subgraph = await getASTSubgraph(filePath, url);
			if (subgraph.nodes.length > 0) {
				subgraphSummary = subgraph.nodes
					.map((n) => `${n.filePath} (${n.type}, complexity: ${n.complexity ?? 0})`)
					.join('\n');
				subgraphSummary += '\nEdges:\n' + subgraph.edges
					.map((e) => `${e.source} → ${e.target}`)
					.join('\n');
			}
		}
		timings.astMs = Date.now() - astStart;

		// Build runtime evidence candidates (Source D)
		const runtimeCandidates: SearchCandidate[] = [];
		let runtimeContext = '';

		if (consoleErrors && consoleErrors.length > 0) {
			runtimeContext += 'CONSOLE ERRORS:\n';
			for (const err of consoleErrors.slice(0, 10)) {
				const msg = err.message;
				const lvl = err.level ?? 'error';
				runtimeContext += `  - [${lvl}] ${msg}`;
				if (err.source) runtimeContext += ` (source: ${err.source})`;
				runtimeContext += '\n';
				if (err.stack) runtimeContext += `    stack: ${err.stack.split('\n').slice(0, 3).join(' → ')}\n`;
				// Extract file path from stack or message
				const fileMatch = (err.stack ?? msg).match(/(?:at |in |from )(src\/[^\s:)]+)/);
				runtimeCandidates.push({
					id: `console-${createHash('sha256').update(msg).digest('hex').slice(0, 8)}`,
					score: lvl === 'error' ? 0.75 : lvl === 'warn' ? 0.55 : 0.35,
					filePath: fileMatch?.[1] ?? err.source ?? routePath ?? '',
					content: `[${lvl}] ${msg.slice(0, 300)}`,
					source: 'runtime_evidence',
					metadata: { kind: 'console-error', level: lvl, hasStack: !!err.stack },
				});
			}
		}

		if (networkFailures && networkFailures.length > 0) {
			runtimeContext += 'NETWORK FAILURES:\n';
			for (const nf of networkFailures.slice(0, 10)) {
				const status = nf.status ?? 0;
				const method = nf.method ?? 'GET';
				runtimeContext += `  - ${method} ${nf.url} → HTTP ${status}`;
				if (nf.statusText) runtimeContext += ` (${nf.statusText})`;
				runtimeContext += '\n';
				if (nf.bodySnippet) runtimeContext += `    body: ${nf.bodySnippet.slice(0, 200)}\n`;
				// Map API URL to likely server file
				const urlPath = nf.url.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
				runtimeCandidates.push({
					id: `network-${createHash('sha256').update(`${nf.url}:${status}`).digest('hex').slice(0, 8)}`,
					score: status >= 500 ? 0.7 : status >= 400 ? 0.6 : 0.4,
					filePath: `src/routes/${urlPath}/+server.ts`,
					content: `${method} ${nf.url} → ${status}${nf.statusText ? ' ' + nf.statusText : ''}`,
					source: 'runtime_evidence',
					metadata: { kind: 'network-failure', status, method, hasBody: !!nf.bodySnippet },
				});
			}
		}

		// Inject page context (component tree + Playwright snapshot) into runtime context
		if (pageContext) {
			if (pageContext.components) {
				const pc = pageContext.components;
				runtimeContext += 'PAGE COMPONENT TREE:\n';
				if (pc.page?.length) runtimeContext += `  Page files: ${pc.page.join(', ')}\n`;
				if (pc.layouts?.length) runtimeContext += `  Layouts: ${pc.layouts.join(', ')}\n`;
				if (pc.components?.length) runtimeContext += `  Components (${pc.components.length}): ${pc.components.slice(0, 10).join(', ')}${pc.components.length > 10 ? '...' : ''}\n`;
				if (pc.stores?.length) runtimeContext += `  Stores: ${pc.stores.join(', ')}\n`;
				if (pc.apiEndpoints?.length) runtimeContext += `  API endpoints: ${pc.apiEndpoints.slice(0, 10).join(', ')}\n`;
			}
			if (pageContext.playwrightSnapshot) {
				const pw = pageContext.playwrightSnapshot;
				runtimeContext += 'PLAYWRIGHT SNAPSHOT:\n';
				runtimeContext += `  Status: ${pw.status ?? 'unknown'} (${pw.ok ? 'OK' : 'FAILED'})\n`;
				if (pw.loadTimeMs) runtimeContext += `  Load time: ${pw.loadTimeMs}ms\n`;
				if (pw.domElements) runtimeContext += `  DOM elements: ${pw.domElements}\n`;
				if (pw.consoleErrors?.length) {
					runtimeContext += `  Playwright console errors: ${pw.consoleErrors.slice(0, 5).join('; ')}\n`;
					// Also add these as runtime evidence candidates
					for (const pe of pw.consoleErrors.slice(0, 5)) {
						runtimeCandidates.push({
							id: `pw-${createHash('sha256').update(pe).digest('hex').slice(0, 8)}`,
							score: 0.6,
							filePath: routePath ?? '',
							content: `Playwright: ${pe.slice(0, 300)}`,
							source: 'runtime_evidence',
							metadata: { kind: 'playwright-error', raw: pe },
						});
					}
				}
				if (pw.failedRequests?.length) {
					runtimeContext += `  Failed requests: ${pw.failedRequests.slice(0, 5).join(', ')}\n`;
				}
			}
		}

		// Stage 2: Multi-Source Search
		const searchStart = Date.now();
		const queryEmbedding = await generateSingleEmbedding(query.slice(0, 512));
		const candidates = await multiSourceSearch(
			query,
			queryEmbedding,
			subgraph.neighborFiles,
			subgraph.nodes,
			runtimeCandidates,
			limit,
		);
		timings.searchMs = Date.now() - searchStart;

		// Stage 3: Multi-Signal Rerank (now mode-aware + route/page affinity)
		const rerankStart = Date.now();
		const ranked = rerankCandidates(candidates, subgraph.neighborFiles, routePath, componentPath, mode, limit);
		timings.rerankMs = Date.now() - rerankStart;

		// Stage 4: LLM Diagnosis (now receives runtime context + mode)
		const llmStart = Date.now();
		const diagnosis = await generateDiagnosis(query, ranked, subgraphSummary, runtimeContext, mode, routePath);
		timings.llmMs = Date.now() - llmStart;

		// Stage 5: Cache + Store (parallel — Redis, Qdrant, pgvector, DB)
		const cacheStart = Date.now();
		const result = {
			...diagnosis,
			mode,
			sources: {
				astSubgraph: { nodeCount: subgraph.nodes.length, edgeCount: subgraph.edges.length },
				semanticMatches: candidates.filter((c) => c.source === 'semantic').length,
				errorHistoryMatches: candidates.filter((c) => c.source === 'error_history').length,
				graphNeighborMatches: candidates.filter((c) => c.source === 'graph_neighbor').length,
				runtimeEvidenceMatches: runtimeCandidates.length,
			},
			rankedFiles: ranked.slice(0, 5).map((r) => ({
				filePath: r.filePath,
				finalScore: r.finalScore,
				signals: r.signals,
				source: r.source,
			})),
			_perf: {
				totalMs: 0,
				cached: false,
				stages: { ...timings },
			},
			// Preserve flat timing for backward compat
			timing: {
				totalMs: 0,
				...timings,
				cacheMs: 0,
			},
		};

		// ── Parallel persistence (fire concurrently, settle independently) ──
		const persistOps: Promise<unknown>[] = [];

		// 1. Primary Redis cache (10-min TTL)
		persistOps.push(setCache(cacheKey, result, DIAGNOSIS_CACHE_TTL_MS));

		// 2. Redis hot-cache derivatives (route-level, page-level, runtime summary)
		if (routePath) {
			const routeHash = createHash('sha256').update(routePath).digest('hex').slice(0, 16);
			persistOps.push(setCache(`ast:diagnosis:route:${routeHash}`, result, DIAGNOSIS_CACHE_TTL_MS * 3).catch(() => {}));

			if (mode === 'page') {
				const errorFingerprint = createHash('sha256')
					.update(consoleErrors?.map(e => e.message).join('|') ?? '')
					.digest('hex').slice(0, 8);
				persistOps.push(setCache(`ast:diagnosis:page:${routeHash}:${errorFingerprint}`, result, DIAGNOSIS_CACHE_TTL_MS * 6).catch(() => {}));
			}

			if (runtimeCandidates.length > 0) {
				const runtimeSummary = {
					route: routePath,
					consoleErrorCount: consoleErrors?.length ?? 0,
					networkFailureCount: networkFailures?.length ?? 0,
					topErrors: consoleErrors?.slice(0, 3).map(e => e.message) ?? [],
					topFailures: networkFailures?.slice(0, 3).map(nf => `${nf.method ?? 'GET'} ${nf.url} → ${nf.status ?? '?'}`) ?? [],
					timestamp: new Date().toISOString(),
				};
				persistOps.push(setCache(`ast:runtime:${routeHash}`, runtimeSummary, DIAGNOSIS_CACHE_TTL_MS * 1.5).catch(() => {}));
			}
		}

		// 3. Qdrant — error embedding for similarity search
		persistOps.push(
			embedErrorEvent({
				errorMessage: query,
				filePath: filePath || '',
				routePath: routePath || '',
				severity: 'info',
			}).catch(() => {})
		);

		// 4. Qdrant — diagnosis-specific embedding (separate collection for diagnosis retrieval)
		persistOps.push(
			(async () => {
				try {
					const diagText = `${result.probableRootCauseType}: ${result.diagnosis}\nFiles: ${(result.likelyFiles ?? []).join(', ')}`;
					const diagEmbedding = await generateSingleEmbedding(diagText.slice(0, 512));
					const DIAG_COLLECTION = VECTOR_CONFIG.COLLECTIONS.diagnosis_embeddings;

					// Ensure collection exists
					try { await qdrant.client.getCollection(DIAG_COLLECTION); } catch {
						await qdrant.client.createCollection(DIAG_COLLECTION, {
							vectors: { diagnosis: { size: VECTOR_CONFIG.DIMENSIONS, distance: 'Cosine' } },
							on_disk_payload: true,
							hnsw_config: VECTOR_CONFIG.QDRANT_HNSW,
							quantization_config: VECTOR_CONFIG.QDRANT_QUANTIZATION,
						}).catch(() => {});
					}

					const pointKey = `diag:${routePath || ''}:${query.slice(0, 100)}`;
					await qdrant.client.upsert(DIAG_COLLECTION, {
						wait: false,
						points: [{
							id: deterministicPointId(pointKey),
							vector: { diagnosis: diagEmbedding },
							payload: {
								routePath: routePath || '',
								filePath: filePath || '',
								mode,
								rootCauseType: result.probableRootCauseType,
								riskLevel: result.riskLevel,
								diagnosis: result.diagnosis.slice(0, 500),
								likelyFiles: result.likelyFiles ?? [],
								fixSteps: (result.fixPlan ?? []).length,
								feedbackAccurate: null,
								createdAt: new Date().toISOString(),
							},
						}],
					});
				} catch {
					// Non-critical — diagnosis works without Qdrant indexing
				}
			})()
		);

		// 5. PostgreSQL — await insert to get diagnosisId for client feedback
		const dbInsertPromise = (async () => {
			try {
				// Reuse the query embedding from Stage 2 for pgvector mirror
				const embeddingForPg = queryEmbedding.length === 768 ? queryEmbedding : null;

				const [inserted] = await db.insert(diagnosisEvents).values({
					routePath: routePath || null,
					filePath: filePath || null,
					query,
					mode,
					probableRootCauseType: result.probableRootCauseType ?? 'unknown',
					riskLevel: result.riskLevel ?? 'medium',
					diagnosis: result.diagnosis ?? '',
					likelyFiles: result.likelyFiles ?? [],
					impactedFiles: result.impactedFiles ?? [],
					fixPlan: result.fixPlan ?? [],
					evidence: result.evidence ?? [],
					rankedFiles: result.rankedFiles ?? [],
					suggestedTests: result.suggestedTests ?? [],
					sources: result.sources ?? {},
					needsHumanReview: result.needsHumanReview ?? true,
					unsafeToAutoPatch: result.unsafeToAutoPatch ?? false,
					cached: false,
					totalMs: result._perf.totalMs,
					stages: result._perf.stages ?? {},
					userId: locals.user?.id ?? null,
					queryEmbedding: embeddingForPg,
				}).returning({ id: diagnosisEvents.id });
				if (inserted?.id) result.diagnosisId = inserted.id;
			} catch (e) {
				console.warn('[error-brain/diagnose] Failed to persist diagnosis:', (e as Error).message);
			}
		})();

		// Settle all concurrent persistence ops + DB insert
		await Promise.allSettled([...persistOps, dbInsertPromise]);

		timings.cacheMs = Date.now() - cacheStart;
		result.timing.totalMs = Date.now() - startMs;
		result.timing.cacheMs = timings.cacheMs;
		result._perf.totalMs = Date.now() - startMs;
		result._perf.stages = { ...timings };

		return json(result);
	} catch (err) {
		console.error('[error-brain/diagnose] Pipeline error:', err);
		return json(
			{
				diagnosis: 'Diagnosis pipeline encountered an error',
				probableRootCauseType: 'unknown',
				likelyFiles: [],
				impactedFiles: [],
				fixPlan: [],
				similarPastErrors: [],
				suggestedTests: [],
				riskLevel: 'medium',
				needsHumanReview: true,
				unsafeToAutoPatch: false,
				evidence: [],
				error: 'Pipeline error — one or more stages failed',
				_perf: { totalMs: Date.now() - startMs, cached: false, stages: timings },
				timing: { totalMs: Date.now() - startMs, ...timings },
			},
			{ status: 503 },
		);
	}
};
