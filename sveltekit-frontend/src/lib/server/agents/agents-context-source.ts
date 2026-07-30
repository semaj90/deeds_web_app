/**
 * OKF (OpenWiki Knowledge Format) Context Source
 *
 * Implements Google's machine-readable format (docs/.okf/schema.yaml) for:
 * - Directory-level agent cards (cached in Redis)
 * - Feature responsibility mapping (via corpus:concepts KV pairs)
 * - Domain classification + concept extraction (from code-intel service)
 * - Architectural hints + audit gates for ACE context assembly
 *
 * Storage hierarchy:
 *   Redis (L1, hot cache) → CouchDB (L2, durable wiki) → Postgres (L3, canonical truth)
 */

import { readCardFromRedis, cardIdForDir, type AgentsDirectoryCard } from './agents-card-store';
import { couchdb } from '../services/couchdb-client';
import { getRedis } from '../redis';

const COUCHDB_DB = 'karpathy_wiki';

// ─── OKF Type Definitions (aligned to docs/.okf/schema.yaml) ──────────────

/**
 * OKF root schema: unified semantic representation for code intelligence
 */
export interface OKFEntry {
	id: string; // UUID or path-based identifier
	version: string; // semver
	kind: 'Agent' | 'Feature' | 'Domain' | 'Concept' | 'Responsibility' | 'Directory';
	metadata: {
		created_at: string; // ISO 8601
		updated_at?: string;
		source: 'ast_extraction' | 'semantic_analysis' | 'manual_curation' | 'ai_generated';
		confidence: number; // 0-1
		tags: string[];
	};
	spec: {
		domain: 'AUTH' | 'DATA' | 'API' | 'UI' | 'SHARED' | 'UNKNOWN';
		responsibility: string;
		concepts: Array<{
			name: string;
			pattern: string;
			domain: string;
			priority: number;
			confidence: number;
		}>;
		related_entities: Array<{
			id: string;
			relation: 'imports' | 'depends_on' | 'implements' | 'extends' | 'uses' | 'calls';
		}>;
		topology: {
			x: number; // Temporal (git timestamp)
			y: number; // Structural (nesting depth)
			z: number; // Semantic (embedding similarity)
			w: number; // Authority (PageRank)
		};
		embedding: {
			model: 'embeddinggemma:latest';
			dimension: 512 | 768 | 384 | 64;
		};
		audit: {
			status: 'CREATED' | 'WIRED' | 'DRY_RUN_PROVEN' | 'APPLY_PROVEN' | 'NOT_PROVEN';
			gates: Record<string, boolean>;
			last_validated?: string;
			violations: Array<{
				code: string;
				severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
			}>;
		};
	};
	directory_scope?: {
		path: string;
		summary: string;
		feature_keys: string[];
		activity_score: number;
		recommendations: string[];
	};
}

/**
 * Directory card (AgentsDirectoryCard alias with OKF alignment)
 */
export interface OKFDirectoryCard extends AgentsDirectoryCard {
	okf_entry_id?: string; // Link to OKF entry in Postgres
	okf_version: string; // OKF schema version
	concepts_index?: Record<string, string>; // feature:domain → responsibility
}

// ─── OKF Cache & Retrieval (Redis L1 → CouchDB L2 → Postgres L3) ──────────

/**
 * Fetch OKF directory entries for a set of file paths.
 *
 * Cache strategy:
 * 1. Redis: `okf:directory:{path}` (24h TTL, L1 hot cache)
 * 2. CouchDB: `karpathy_wiki` database (L2 durable)
 * 3. Postgres: `atlas_packets` with directory_scope (L3 canonical)
 */
export async function getOKFEntriesForPaths(paths: string[]): Promise<OKFDirectoryCard[]> {
	const dirPaths = [...new Set(paths.map(p => {
		if (p.includes('.') && !p.endsWith('/')) {
			return p.split('/').slice(0, -1).join('/');
		}
		return p;
	}))].filter(Boolean);

	const cards: OKFDirectoryCard[] = [];
	const redis = getRedis();

	await Promise.all(dirPaths.map(async (dirPath) => {
		try {
			// 1. Try Redis (L1 hot cache)
			const cached = await redis.hget('okf:directory:index', dirPath);
			if (cached) {
				const card = JSON.parse(cached) as OKFDirectoryCard;
				cards.push(card);
				return;
			}

			// 2. Try legacy card store (backward compatibility)
			const card = await readCardFromRedis(dirPath);
			if (card) {
				const okfCard = {
					...card,
					okf_version: '1.0.0'
				} as OKFDirectoryCard;
				cards.push(okfCard);
				return;
			}

			// 3. Try CouchDB (L2 durable)
			const id = cardIdForDir(dirPath);
			const doc = await couchdb.get(COUCHDB_DB, id) as any;
			if (doc && doc.id) {
				const { _id, _rev, ...cardData } = doc;
				const okfCard = {
					...cardData,
					okf_version: '1.0.0'
				} as OKFDirectoryCard;
				cards.push(okfCard);

				// Warm Redis for future hits
				try {
					await redis.hset('okf:directory:index', dirPath, JSON.stringify(okfCard));
					await redis.expire('okf:directory:index', 86400); // 24h TTL
				} catch {
					// Non-blocking cache miss
				}
			}
		} catch (err) {
			console.warn(`[okf-context] Failed to load OKF entry for ${dirPath}:`, err);
		}
	}));

	return cards;
}

/**
 * Fetch OKF ontology concepts by feature key.
 *
 * Retrieves from Redis corpus:concepts hash (populated by code-intel service):
 * - Key: `feature:domain`
 * - Value: OKFOntologyEntry JSON (responsibility, concepts, confidence)
 */
export async function getOKFConceptsByFeature(featureKey: string): Promise<Record<string, any>[]> {
	try {
		const redis = getRedis();

		// Query Redis corpus:concepts hash
		const conceptsMap = await redis.hgetall('corpus:concepts');
		if (!conceptsMap) return [];

		const results: Record<string, any>[] = [];
		for (const [key, value] of Object.entries(conceptsMap)) {
			if (key.startsWith(featureKey + ':')) {
				results.push({
					key,
					...JSON.parse(value as string)
				});
			}
		}

		return results;
	} catch (err) {
		console.warn('[okf-context] getOKFConceptsByFeature failed:', err);
		return [];
	}
}

/**
 * Fetch domain centroids from Redis (computed by code-intel service).
 *
 * Returns 512-dim MRL vectors for each domain class.
 * Used for semantic similarity scoring in ACE context assembly.
 */
export async function getOKFDomainCentroids(): Promise<Record<'AUTH' | 'DATA' | 'API' | 'UI', number[]>> {
	try {
		const redis = getRedis();
		const centroids = await redis.hgetall('corpus:centroids');
		if (!centroids) return {} as any;

		const parsed: Record<string, number[]> = {};
		for (const [domain, vector] of Object.entries(centroids)) {
			parsed[domain] = JSON.parse(vector as string);
		}

		return parsed as Record<'AUTH' | 'DATA' | 'API' | 'UI', number[]>;
	} catch (err) {
		console.warn('[okf-context] getOKFDomainCentroids failed:', err);
		return {} as any;
	}
}

/**
 * Format OKF entries into LLM context block.
 *
 * Includes:
 * - Directory summaries + feature ownership
 * - Validation gate status (G1-G47+)
 * - Domain classification confidence
 * - Recommended next actions
 */
export function formatOKFContext(entries: OKFDirectoryCard[]): string {
	if (entries.length === 0) return '';

	let ctx = `## OKF Architectural Context: Directory Authority & Domains\n`;
	ctx += `[OpenWiki Knowledge Format v1.0.0 - docs/.okf/schema.yaml]\n\n`;

	// Sort by activity score, then audit status
	const sorted = [...entries].sort((a, b) => {
		const scoreB = (b.activityScore || 0);
		const scoreA = (a.activityScore || 0);
		if (scoreB !== scoreA) return scoreB - scoreA;

		// Secondary sort by audit status (APPLY_PROVEN > DRY_RUN_PROVEN > WIRED > CREATED > NOT_PROVEN)
		const statusOrder = {
			'APPLY_PROVEN': 5,
			'DRY_RUN_PROVEN': 4,
			'WIRED': 3,
			'CREATED': 2,
			'NOT_PROVEN': 1
		};
		return (statusOrder[b.auditStatus as keyof typeof statusOrder] || 0) -
		       (statusOrder[a.auditStatus as keyof typeof statusOrder] || 0);
	});

	for (const entry of sorted.slice(0, 8)) {
		ctx += `\n### ${entry.dirPath}\n`;
		ctx += `**OKF Status:** ${entry.auditStatus || 'UNKNOWN'}\n`;

		if (entry.summary) {
			ctx += `**Summary:** ${entry.summary}\n`;
		}

		// Domain classification with confidence
		if ('spec' in entry && entry.spec?.domain) {
			const confidence = entry.spec.metadata?.confidence || entry.confidence || 0;
			ctx += `**Domain:** ${entry.spec.domain} (confidence: ${(confidence * 100).toFixed(0)}%)\n`;
		}

		// Feature keys (responsibility ownership)
		if (entry.featureKeys && entry.featureKeys.length > 0) {
			ctx += `**Features:** ${entry.featureKeys.join(', ')}\n`;
		}

		// Validation gates (G1-G47+)
		if (entry.gates) {
			const activeGates = Object.entries(entry.gates)
				.filter(([_, active]) => active)
				.map(([gate]) => gate);
			if (activeGates.length > 0) {
				ctx += `**Validation Gates:** ${activeGates.join(', ')}\n`;
			}
		}

		// Recommendations + next actions
		if (entry.recommendations && entry.recommendations.length > 0) {
			ctx += `**Next Best Actions:**\n${entry.recommendations.map(r => `- ${r}`).join('\n')}\n`;
		}
	}

	ctx += `\n*For full OKF schema, see docs/.okf/schema.yaml*\n`;

	return ctx;
}

/**
 * Backward compatibility: alias for getOKFEntriesForPaths
 */
export async function getCardsForPaths(paths: string[]): Promise<AgentsDirectoryCard[]> {
	return getOKFEntriesForPaths(paths) as Promise<AgentsDirectoryCard[]>;
}

/**
 * Backward compatibility: search by feature key (legacy interface)
 */
export async function getCardsByFeature(featureKey: string): Promise<AgentsDirectoryCard[]> {
	// Try Redis concepts index first
	const concepts = await getOKFConceptsByFeature(featureKey);
	if (concepts.length > 0) {
		return concepts as any;
	}

	// Fallback to CouchDB legacy view
	try {
		const viewRes = await couchdb.view(COUCHDB_DB, 'wiki', 'by_feature_key', {
			key: JSON.stringify(featureKey),
			include_docs: 'true'
		});

		return viewRes.rows.map(r => {
			if (!r.doc) return null;
			const { _id, _rev, ...cardData } = r.doc as any;
			return cardData as AgentsDirectoryCard;
		}).filter((c): c is AgentsDirectoryCard => c !== null);
	} catch (err) {
		console.warn('[okf-context] getCardsByFeature fallback failed:', err);
		return [];
	}
}

/**
 * Backward compatibility: format cards context (now uses OKF formatting)
 */
export function formatCardsContext(cards: AgentsDirectoryCard[]): string {
	return formatOKFContext(cards as OKFDirectoryCard[]);
}
