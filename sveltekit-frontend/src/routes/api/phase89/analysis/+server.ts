import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';
import path from 'path';

interface CollectionInfo {
  name: string;
  points: number;
  segments: number;
  status: 'green' | 'yellow' | 'unavailable';
}

interface Recommendation {
  priority: 'HIGH' | 'MED' | 'LOW';
  category: 'indexing' | 'retrieval' | 'health' | 'pipeline';
  title: string;
  detail: string;
  action: string;
  estimatedImpact: string;
}

interface ClusterHealth {
  totalClusters: number;
  errorEvents: number;
  codebaseChunksInQdrant: number;
  phase89ChunksInQdrant: number;
  phase90CardsInQdrant: number;
}

// All known Qdrant collections in the platform
const ALL_COLLECTIONS = [
  'codebase_chunks_768',
  'evidence_items',
  'legal_documents',
  'legal_cases',
  'legal_glossary',
  'court_opinions',
  'chat_messages',
  'embedding_cache',
  'phase89_error_chunks',
  'phase90_error_cards',
  'phase90_error_clusters',
  'knowledge_base',
  'evidence_vectors',
  'case_chunks',
];

/**
 * POST /api/phase89/analysis
 * Returns Qdrant collection stats, structured recommendations,
 * cluster health, and optional Ollama-driven analysis summary.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const client = qdrant.client;

		// ── Collect Qdrant stats ───────────────────────────────────────────
		const collections: CollectionInfo[] = [];
		let totalPoints = 0;
		const tags = new Set<string>();

		for (const name of ALL_COLLECTIONS) {
      try {
        const info = client ? await client.getCollection(name).catch(() => null) : null;
        const points = (info as any)?.points_count ?? 0;
        const segments = (info as any)?.segments_count ?? 0;
        const status: CollectionInfo['status'] =
          info == null ? 'unavailable' : points > 0 ? 'green' : 'yellow';
        collections.push({ name, points, segments, status });
        totalPoints += points;
        tags.add(name.split('_')[0]);
      } catch {
        collections.push({ name, points: 0, segments: 0, status: 'unavailable' });
      }
    }

    // ── Cluster health from PostgreSQL ─────────────────────────────────
    const clusterHealth = await getClusterHealth(collections);

    // ── Build structured recommendations ──────────────────────────────
    const recommendations = buildRecommendations(collections, clusterHealth);

    // ── Ollama analysis summary (non-fatal, 15s timeout) ──────────────
    const ollamaSummary = await getOllamaSummary(collections, clusterHealth);

    const healthy = collections.filter((c) => c.status === 'green');

    const result = {
      success: true,
      analysis: {
        metadata: {
          totalCollections: collections.length,
          totalPoints,
          uniqueTags: tags.size,
          healthyCollections: healthy.length,
        },
        knowledge: { collections },
        recommendations,
        clusterHealth,
        analysis:
          ollamaSummary ??
          `Phase89 knowledge base: ${totalPoints.toLocaleString()} indexed vectors across ${collections.length} collections (${healthy.length} healthy).`,
      },
      timestamp: new Date().toISOString(),
    };

		// Persist to reports/ for the page server load
		try {
			const reportsDir = path.join(process.cwd(), 'reports');
			await fs.mkdir(reportsDir, { recursive: true });
			await fs.writeFile(
				path.join(reportsDir, 'phase89-rag-kag-analysis.json'),
				JSON.stringify(result, null, 2)
			);
		} catch { /* non-fatal */ }

		return json(result);
	} catch (e) {
    console.warn('[phase89/analysis] Qdrant unavailable:', (e as Error).message);
    return json({
      success: false,
      analysis: {
        metadata: { totalCollections: 0, totalPoints: 0, uniqueTags: 0, healthyCollections: 0 },
        knowledge: { collections: [] },
        recommendations: [
          {
            priority: 'HIGH' as const,
            category: 'health' as const,
            title: 'Qdrant unavailable',
            detail: 'Cannot reach Qdrant vector store. Docker services may be down.',
            action: 'Run: docker compose up -d',
            estimatedImpact: 'All vector search disabled until resolved',
          },
        ],
        clusterHealth: null,
        analysis: null,
      },
      timestamp: new Date().toISOString(),
    });
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function getClusterHealth(collections: CollectionInfo[]): Promise<ClusterHealth> {
	const health: ClusterHealth = {
		totalClusters: 0,
		errorEvents: 0,
		codebaseChunksInQdrant: 0,
		phase89ChunksInQdrant: 0,
		phase90CardsInQdrant: 0,
	};

	try {
		const { pool } = await import('$lib/server/db/client');
		const clusterResult = await pool.query<{ count: string }>(
			`SELECT COUNT(*)::text AS count FROM error_clusters`
		);
		health.totalClusters = parseInt(clusterResult.rows[0]?.count ?? '0', 10);

		const eventResult = await pool.query<{ count: string }>(
			`SELECT COUNT(*)::text AS count FROM error_events`
		);
		health.errorEvents = parseInt(eventResult.rows[0]?.count ?? '0', 10);
	} catch { /* tables may not exist */ }

	health.codebaseChunksInQdrant =
		collections.find((c) => c.name === 'codebase_chunks_768')?.points ?? 0;
	health.phase89ChunksInQdrant =
		collections.find((c) => c.name === 'phase89_error_chunks')?.points ?? 0;
	health.phase90CardsInQdrant =
		collections.find((c) => c.name === 'phase90_error_cards')?.points ?? 0;

	return health;
}

function buildRecommendations(
	collections: CollectionInfo[],
	health: ClusterHealth
): Recommendation[] {
	const recs: Recommendation[] = [];

	const byName = (n: string) => collections.find((c) => c.name === n);

	// ── Indexing gaps ──────────────────────────────────────────────────────
	const codebase = byName('codebase_chunks_768');
	if (!codebase || codebase.points === 0) {
		recs.push({
			priority: 'HIGH',
			category: 'indexing',
			title: 'Codebase index empty',
			detail: 'codebase_chunks_768 has 0 points. Semantic code search is disabled.',
			action: 'POST /api/codebase-index with {"force": true}',
			estimatedImpact: 'Enables code search, error clustering, and SOM topology',
		});
	}

	const evidence = byName('evidence_items');
	if (!evidence || evidence.points === 0) {
		recs.push({
			priority: 'HIGH',
			category: 'indexing',
			title: 'Evidence index empty',
			detail: 'evidence_items has 0 points. Evidence semantic search unavailable.',
			action: 'Upload evidence via /evidence or POST /api/evidence/upload',
			estimatedImpact: 'Enables evidence retrieval in RAG pipeline',
		});
	}

	const glossary = byName('legal_glossary');
	if (!glossary || glossary.points === 0) {
		recs.push({
			priority: 'MED',
			category: 'indexing',
			title: 'Legal glossary not indexed in Qdrant',
			detail: 'legal_glossary collection missing or empty. Glossary-based search unavailable.',
			action: 'Run: python scripts/index_glossary_qdrant.py --recreate',
			estimatedImpact: 'Enables glossary term semantic search',
		});
	}

	const courtOpinions = byName('court_opinions');
	if (!courtOpinions || courtOpinions.points === 0) {
		recs.push({
			priority: 'MED',
			category: 'indexing',
			title: 'Court opinions not in Qdrant',
			detail: 'court_opinions collection empty. SCOTUS opinion search unavailable.',
			action: 'Run: python scripts/index_court_opinions_qdrant.py',
			estimatedImpact: 'Enables case law semantic search across 7,825+ opinions',
		});
	}

	const legalDocs = byName('legal_documents');
	const legalCases = byName('legal_cases');
	if (legalDocs && legalDocs.points > 0 && (!legalCases || legalCases.points === 0)) {
		recs.push({
			priority: 'MED',
			category: 'pipeline',
			title: 'Documents indexed but cases empty',
			detail: `legal_documents has ${legalDocs.points} points but legal_cases has 0. Cross-reference gap.`,
			action: 'Ensure case ingestion pipeline runs after document embedding',
			estimatedImpact: 'Enables case-to-document cross-reference in retrieval',
		});
	}

	// ── Cluster health ────────────────────────────────────────────────────
	if (health.totalClusters > 0 && health.phase89ChunksInQdrant === 0) {
		recs.push({
			priority: 'HIGH',
			category: 'pipeline',
			title: 'Error clusters exist but Qdrant chunks missing',
			detail: `${health.totalClusters} clusters in PostgreSQL but phase89_error_chunks is empty. Semantic error search broken.`,
			action: 'POST /api/codebase-index/ingest-errors to re-embed error clusters',
			estimatedImpact: 'Restores error pattern search and cluster similarity',
		});
	}

	if (health.errorEvents > 100 && health.totalClusters === 0) {
		recs.push({
			priority: 'MED',
			category: 'pipeline',
			title: 'Many errors but no clusters',
			detail: `${health.errorEvents} error events recorded but 0 clusters. Clustering pipeline may not have run.`,
			action: 'POST /api/phase89/pipeline to trigger error clustering',
			estimatedImpact: 'Groups errors into actionable clusters for batch fixing',
		});
	}

	// ── General health ────────────────────────────────────────────────────
	const unavailable = collections.filter((c) => c.status === 'unavailable');
	if (unavailable.length > 3) {
		recs.push({
			priority: 'HIGH',
			category: 'health',
			title: `${unavailable.length} collections unavailable`,
			detail: `Collections offline: ${unavailable.map((c) => c.name).join(', ')}`,
			action: 'Check Qdrant container health: docker logs deeds-qdrant',
			estimatedImpact: 'Multiple search features degraded',
		});
	}

	const empty = collections.filter((c) => c.status === 'yellow');
	if (empty.length > 0 && recs.length === 0) {
		recs.push({
			priority: 'LOW',
			category: 'indexing',
			title: `${empty.length} collection(s) exist but empty`,
			detail: `Empty: ${empty.map((c) => c.name).join(', ')}`,
			action: 'Run respective ingestion pipelines to populate',
			estimatedImpact: 'Minor — features degrade gracefully',
		});
	}

	const healthy = collections.filter((c) => c.status === 'green');
	if (healthy.length >= 8 && recs.length === 0) {
		recs.push({
			priority: 'LOW',
			category: 'retrieval',
			title: 'Vector store healthy',
			detail: `${healthy.length}/${collections.length} collections green with data. System operational.`,
			action: 'Consider running a retrieval quality audit on key collections',
			estimatedImpact: 'Optimization — system already functional',
		});
	}

	return recs;
}

async function getOllamaSummary(
	collections: CollectionInfo[],
	health: ClusterHealth
): Promise<string | null> {
	try {
		const { callOllamaChat } = await import('$lib/server/ollama.js');

		const collectionStatus = collections
			.map((c) => `- ${c.name}: ${c.points} points (${c.status})`)
			.join('\n');

		const system = `You are a legal AI platform administrator reviewing vector store health. Be concise. Respond in 2-3 sentences identifying the top issue and a concrete remediation step.`;
		const user = `Vector store status:\n${collectionStatus}\n\nCluster health: ${health.totalClusters} error clusters, ${health.errorEvents} error events, codebase index: ${health.codebaseChunksInQdrant} chunks.\n\nIdentify the most important issue and suggest a fix.`;

		const result = await Promise.race([
			callOllamaChat(system, user),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
		]);

		return typeof result === 'string' && result.length > 10 ? result : null;
	} catch {
		return null;
	}
}
