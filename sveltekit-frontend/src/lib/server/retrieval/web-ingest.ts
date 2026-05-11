/**
 * Web Ingestion Loop — closes the broken loop where web search results
 * are used once and discarded.
 *
 * When the cross-encoder reranker triggers a web fallback (confidence < 0.45),
 * results are queued to RabbitMQ `kb.ingest` for durable ingestion into
 * Qdrant knowledge_base collection + CouchDB web_sources provenance.
 */
import { ENV } from '$lib/server/env.server.js';
import { createHash } from 'crypto';

const QDRANT_URL = ENV.QDRANT_URL;
const KNOWLEDGE_COLLECTION = 'knowledge_base';

export interface WebIngestMessage {
	url: string;
	title: string;
	snippet: string;
	source: string;
	query: string;
	rerankScore: number;
	ingestedAt: string;
}

/**
 * Publish web search results to the kb.ingest RabbitMQ queue.
 * Fire-and-forget from the reranker — non-blocking, non-fatal.
 */
export async function queueWebResultsForIngestion(
	results: Array<{ url: string; title: string; snippet: string; source?: string }>,
	query: string,
	rerankScores: Map<string, number>,
): Promise<void> {
	try {
		const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
		const now = new Date().toISOString();

		for (const r of results) {
			const docId = `web:${createHash('sha256').update(r.url).digest('hex').slice(0, 12)}`;
			const message: WebIngestMessage = {
				url: r.url,
				title: r.title,
				snippet: r.snippet,
				source: r.source ?? 'web',
				query,
				rerankScore: rerankScores.get(docId) ?? 0,
				ingestedAt: now,
			};

			await rabbitmq.publishToQueue(
				'kb.ingest',
				message,
			);
		}
	} catch {
		/* non-fatal — web results still used for current answer */
	}
}

/**
 * Process a single kb.ingest message: embed the content and upsert into Qdrant.
 * Called by the RabbitMQ consumer worker.
 */
export async function processWebIngestMessage(msg: WebIngestMessage): Promise<void> {
	const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');

	// Generate embedding for the web content
	const text = `${msg.title}\n\n${msg.snippet}`;
	const embedding = await generateSingleEmbedding(text);
	if (!embedding || embedding.length === 0) return;

	// Deduplicate: check if this URL is already in knowledge_base
	const contentHash = createHash('sha256').update(msg.url).digest('hex').slice(0, 12);
	const pointId = hashToPointId(contentHash);

	// Upsert into Qdrant knowledge_base
	const res = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: [{
				id: pointId,
				vector: Array.from(embedding),
				payload: {
					url: msg.url,
					title: msg.title,
					content: msg.snippet,
					source: msg.source,
					query: msg.query,
					rerankScore: msg.rerankScore,
					contentHash,
					ingestedAt: msg.ingestedAt,
					type: 'web_search_result',
				},
			}],
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (!res.ok) {
		throw new Error(`Qdrant upsert failed: ${res.status}`);
	}

	// Write provenance to CouchDB web_sources
	try {
		const { couchdb } = await import('$lib/server/services/couchdb-client.js');
		const docId = `web:${contentHash}`;
		const prev = await couchdb.get('web_sources', docId).catch(() => null);
		const doc: Record<string, unknown> = {
			type: 'web_source',
			url: msg.url,
			title: msg.title,
			source: msg.source,
			queries: [msg.query],
			firstIngestedAt: msg.ingestedAt,
			lastIngestedAt: msg.ingestedAt,
			ingestCount: 1,
		};

		if (prev) {
			doc._rev = prev._rev;
			doc.queries = [...new Set([...(prev.queries as string[] ?? []), msg.query])].slice(-50);
			doc.firstIngestedAt = prev.firstIngestedAt ?? msg.ingestedAt;
			doc.ingestCount = ((prev.ingestCount as number) ?? 0) + 1;
		}

		await couchdb.put('web_sources', docId, doc);
	} catch {
		/* CouchDB provenance is non-fatal */
	}
}

/** Convert a hex hash to a stable integer point ID for Qdrant */
function hashToPointId(hex: string): number {
	return parseInt(hex.slice(0, 8), 16) & 0x7fffffff; // positive 31-bit int
}
