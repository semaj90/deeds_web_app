/**
 * Embedding Schema — Qdrant payload, Redis cache keys, Neo4j relations, embed_text builder
 *
 * EmbeddingGemma (embeddinggemma:latest) facts:
 *   - Output: 768-dimensional float32 vector (fixed size regardless of input length)
 *   - Input window: ~2,048 tokens (model context limit)
 *   - Practical embed_text budget: 170–370 tokens for best retrieval precision
 *     · 100–300 tokens = best precision
 *     · 300–800 tokens = safe working range
 *     · >800 tokens = retrieval quality degrades (too many mixed concepts)
 *
 * Storage split:
 *   Qdrant vector  — 768-dim float32 over buildEmbedText() output
 *   Qdrant payload — QdrantPayload (searchable filters + retrieval metadata)
 *   Redis          — expanded context windows, synthesis state, ACE cache
 *   Neo4j          — graph relations (IMPORTS, SIMILAR_TOPOLOGY, HAS_EVIDENCE, …)
 *
 * Usage:
 *   const text  = buildEmbedText({ title, summary, tags, type, pathHint });
 *   const vec   = await generateEmbeddings([text]);
 *   const key   = redisEmbedKey(docId);
 *   const cache = redisSynthKey(caseId, query);
 */

import { createHash } from 'crypto';

// ── Record types ──────────────────────────────────────────────────────────────

export type RecordType =
	| 'evidence'
	| 'legal_doc'
	| 'statute'
	| 'case'
	| 'case_chunk'
	| 'court_opinion'
	| 'code_chunk'
	| 'chat_message'
	| 'knowledge_base';

/**
 * Standardised Qdrant payload written alongside every 768-dim vector.
 *
 * Mandatory fields are always present.  Optional fields depend on record type.
 *
 * Keep tags short (5–20 categorical labels).
 * Keep summary compact (80–220 tokens) — it IS the primary embed input.
 * Dump everything else in facts_json so the payload stays filter-friendly.
 */
export interface QdrantPayload {
	// ── Mandatory ─────────────────────────────────────────────────────────
	/** Canonical source ID: evidence UUID, case UUID, file path hash, … */
	source_id: string;
	/** Record discriminator — drives collection routing + ACE budget tier */
	type: RecordType;
	/** Compact paragraph used as primary embed input. Target: 80–220 tokens */
	summary: string;
	/** 5–20 short categorical labels (deed, grant, fraud-risk, parcel, …) */
	tags: string[];
	/** Which embedding model produced the vector */
	embedding_model: string;
	/** ISO-8601 timestamp of last embed */
	embedded_at: string;
	/** Payload schema version — increment when shape changes */
	schema_version: number;

	// ── Optional — present on most records ────────────────────────────────
	/** Human-readable title / file name */
	title?: string;
	/** Case UUID this record belongs to (for Qdrant case-tier filtering) */
	case_id?: string;
	/** Neo4j graph neighbor IDs (for KAG pre-retrieval filtering) */
	graph_neighbors?: string[];
	/** ACE confidence hint from last retrieval (0–1, fed back to determineACEPolicy) */
	ace_confidence?: number;

	// ── Type-specific ──────────────────────────────────────────────────────
	/** Code chunks only: absolute file path */
	file_path?: string;
	/** Code chunks only: ts | svelte | py | go | … */
	language?: string;
	/** Legal records: statute code or case citation */
	citation?: string;
	/** Chat messages: session UUID */
	session_id?: string;

	/** Catch-all for structured metadata too large for top-level filters */
	facts_json?: Record<string, unknown>;
}

// ── embed_text builder ────────────────────────────────────────────────────────

export interface EmbedTextInput {
	summary: string;
	tags?: string[];
	title?: string;
	/** 'deed' | 'statute' | 'ts' | 'evidence' | … — 1–3 word hint only */
	type?: string;
	/** Short path fragment for code chunks: 'src/routes/api/sse/chat' */
	pathHint?: string;
}

/**
 * Build the text string passed to embeddinggemma:latest.
 *
 * Budget breakdown (target 170–370 tokens):
 *   title         ~5–15 tokens
 *   type/pathHint ~3–10 tokens
 *   summary       ~80–220 tokens   ← primary semantic signal
 *   tags          ~10–40 tokens    (first 8 tags, joined by space)
 *   ─────────────────────────────
 *   total         ~100–285 tokens  (well within 2,048-token window)
 *
 * Do NOT pass:
 *   - Raw HTML, multi-page PDFs, full source files
 *   - Repeated boilerplate or licence headers
 *   - Full structured facts_json blobs
 */
export function buildEmbedText(input: EmbedTextInput): string {
	const { summary, tags = [], title, type, pathHint } = input;

	const parts: string[] = [];

	if (title) parts.push(title.trim());
	if (type) parts.push(`[${type}]`);
	if (pathHint) parts.push(pathHint.replace(/\\/g, '/').replace(/\//g, ' '));

	// Summary is the main semantic carrier — always include in full
	parts.push(summary.trim());

	// Top-8 tags, joined by space so the model sees them as discrete tokens
	if (tags.length > 0) {
		parts.push(tags.slice(0, 8).join(' '));
	}

	return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── Redis cache key builders ──────────────────────────────────────────────────

/** Stable short hash — first 16 hex chars of SHA-256 */
function shortHash(input: string): string {
	return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * L3 Redis key for a raw embedding vector.
 * TTL: 1 hour (matches embedding-cache.ts EMBEDDING_TTL)
 *
 * Pattern: emb:<docId-or-textHash>
 */
export function redisEmbedKey(docIdOrText: string): string {
	// If it looks like a UUID or short ID, use as-is; otherwise hash the text
	const isShortId = docIdOrText.length <= 64 && !/\s/.test(docIdOrText);
	return `emb:${isShortId ? docIdOrText : shortHash(docIdOrText)}`;
}

/**
 * Redis key for ACE context assembly output (15-min TTL matches authority-chain cache).
 *
 * Pattern: ace:<caseId>:<policyTier>:<queryHash>
 */
export function redisAceKey(caseId: string, policyTier: string, query: string): string {
	return `ace:${caseId}:${policyTier}:${shortHash(query)}`;
}

/**
 * Redis key for a synthesis/LLM response (1-hour TTL).
 * Used by L1 exact-match cache (redis-exact-match.ts).
 *
 * Pattern: synth:<model>:<paramsHash>
 * paramsHash = SHA-256(caseId + query + temperature + maxTokens)
 */
export function redisSynthKey(
	caseId: string,
	query: string,
	model: string,
	temperature = 0.3,
	maxTokens = 1024
): string {
	const params = `${caseId}:${query}:${temperature}:${maxTokens}`;
	return `synth:${model}:${shortHash(params)}`;
}

/**
 * Redis key for a Qdrant scroll / search result page (5-min TTL).
 *
 * Pattern: qdrant:<collection>:<queryHash>:<limit>
 */
export function redisQdrantKey(collection: string, query: string, limit: number): string {
	return `qdrant:${collection}:${shortHash(query)}:${limit}`;
}

// ── Neo4j relationship type constants ─────────────────────────────────────────

/**
 * All Neo4j relationship types used in the Deeds graph.
 * Import from here rather than sprinkling raw strings across Cypher queries.
 *
 * Cypher usage:
 *   `MATCH (a:CodebaseFile)-[:${NEO4J_REL.IMPORTS}]->(b:CodebaseFile)`
 */
export const NEO4J_REL = {
	// Codebase graph (CodebaseFile nodes)
	/** Static ESM import */
	IMPORTS: 'IMPORTS',
	/** Dynamic import() call */
	DYNAMIC_IMPORTS: 'DYNAMIC_IMPORTS',
	/** SOM grid adjacency (Phase 108 topology) */
	SIMILAR_TOPOLOGY: 'SIMILAR_TOPOLOGY',

	// Legal graph (Case / Evidence / Statute / Citation nodes)
	/** Case → Evidence ownership */
	HAS_EVIDENCE: 'HAS_EVIDENCE',
	/** Evidence ↔ Evidence semantic similarity */
	RELATED_TO: 'RELATED_TO',
	/** Case → Statute citation */
	CITES_STATUTE: 'CITES_STATUTE',
	/** Case → Case precedent chain */
	CITES_CASE: 'CITES_CASE',

	// User / Analytics graph
	/** User → Case access */
	WORKED_ON: 'WORKED_ON',
} as const;

export type Neo4jRelType = (typeof NEO4J_REL)[keyof typeof NEO4J_REL];

/**
 * Neo4j node label constants.
 */
export const NEO4J_LABEL = {
	CodebaseFile: 'CodebaseFile',
	Case: 'Case',
	Evidence: 'Evidence',
	Statute: 'Statute',
	Citation: 'Citation',
	User: 'User',
} as const;

export type Neo4jLabelType = (typeof NEO4J_LABEL)[keyof typeof NEO4J_LABEL];

// ── Payload factory helpers ───────────────────────────────────────────────────

/** Minimum viable payload for any new record. Fill in optional fields after. */
export function makePayload(
	sourceId: string,
	type: RecordType,
	summary: string,
	tags: string[]
): QdrantPayload {
	return {
		source_id: sourceId,
		type,
		summary: summary.slice(0, 2000), // Hard cap — never store a novel in Qdrant payload
		tags: tags.slice(0, 20),          // Hard cap — 20 tags max
		embedding_model: 'embeddinggemma:latest',
		embedded_at: new Date().toISOString(),
		schema_version: 1,
	};
}

/** Merge extra fields into a base payload without overwriting mandatory fields. */
export function extendPayload(
	base: QdrantPayload,
	extra: Partial<Omit<QdrantPayload, 'source_id' | 'type' | 'embedding_model' | 'embedded_at'>>
): QdrantPayload {
	return { ...extra, ...base }; // base fields win over extra
}
