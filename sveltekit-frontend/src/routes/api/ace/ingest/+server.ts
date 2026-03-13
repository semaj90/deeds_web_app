import { json, type RequestHandler } from '@sveltejs/kit';
import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { createHash } from 'crypto';
import { db } from '$lib/server/db/client';
import { yorhaEvidenceNodes, yorhaEvidenceConnections } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const aceIngestSchema = z.object({
	url: z.string().min(1, 'url is required').max(5000),
	caseId: z.string().max(200).optional(),
	title: z.string().max(500).optional()
});

/**
 * POST /api/ace/ingest
 * Ingest a web URL: fetch → strip HTML → chunk → embed → store in Qdrant legal_documents.
 *
 * Query params:
 *   ?stream=true  — return SSE progress events instead of JSON
 *
 * Body: { url: string, caseId?: string, title?: string }
 * Returns: { success, url, title, chunksCreated, embeddingModel, totalMs }
 */
export const POST: RequestHandler = async ({ request, url: reqUrl, locals }) => {
	const start = performance.now();
	const wantStream = reqUrl.searchParams.get('stream') === 'true';

	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const rawBody = await request.json();
	const ingestParsed = aceIngestSchema.safeParse(rawBody);
	if (!ingestParsed.success) {
		return json({ error: ingestParsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { url, caseId, title } = ingestParsed.data;

	// Basic URL validation
	let parsed: URL;
	try {
		parsed = new URL(url);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return json({ error: 'Only http/https URLs are supported' }, { status: 400 });
		}
	} catch {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}

	// If streaming, return SSE response
	if (wantStream) {
		const stream = new ReadableStream({
			async start(controller) {
				const emit = (stage: string, progress: number, extra?: Record<string, unknown>) => {
					const data = JSON.stringify({ stage, progress, ...extra });
					controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
				};

				try {
					emit('fetching', 0.1, { url });

					const fetchRes = await fetch(url, {
						headers: {
							'User-Agent': 'ACE-Ingest/1.0 (Legal AI Research)',
							'Accept': 'text/html, application/xhtml+xml, text/plain'
						},
						signal: AbortSignal.timeout(15000)
					});

					if (!fetchRes.ok) {
						emit('error', 0, { error: `Fetch failed: HTTP ${fetchRes.status}` });
						controller.close();
						return;
					}

					const contentType = fetchRes.headers.get('content-type') ?? '';
					const rawHtml = await fetchRes.text();
					const plainText = stripHtml(rawHtml, contentType.includes('text/plain'));

					if (plainText.length < 30) {
						emit('error', 0, { error: 'No extractable text content found' });
						controller.close();
						return;
					}

					const docTitle = title || extractTitle(rawHtml) || parsed.hostname;

					emit('chunking', 0.3);
					const chunks = chunkLegalDocument(plainText, { maxTokens: 400, overlap: 50 });
					emit('chunking', 0.35, { chunks: chunks.length });

					if (chunks.length === 0) {
						emit('error', 0, { error: 'Document produced no chunks' });
						controller.close();
						return;
					}

					// Embed with progress events
					const chunkTexts = chunks.map((c) => c.text);
					const batchSize = 16;
					const allVectors: number[][] = [];
					let embeddingModel = '';

					for (let i = 0; i < chunkTexts.length; i += batchSize) {
						const batch = chunkTexts.slice(i, i + batchSize);
						const result = await generateEmbeddings(batch);
						allVectors.push(...result.vectors);
						if (!embeddingModel) embeddingModel = result.model;
						const progress = 0.4 + (0.3 * Math.min(i + batchSize, chunkTexts.length) / chunkTexts.length);
						emit('embedding', progress, { embedded: allVectors.length, total: chunkTexts.length });
					}

					emit('storing', 0.75);
					const sourceHash = createHash('sha256').update(url).digest('hex').slice(0, 12);
					const points = buildPoints(chunks, allVectors, sourceHash, docTitle, url, parsed.hostname, caseId, user.id);
					await qdrant.client.upsert(qdrant.collections.documents, { wait: true, points });

					emit('graph', 0.85);
					const graphNodeId = await createGraphNode(chunks, caseId, docTitle, parsed.hostname, url, sourceHash, user.id, plainText, allVectors);

					// Neo4j sync (fire-and-forget with progress event)
					if (graphNodeId && caseId) {
						emit('neo4j_sync', 0.9);
						try {
							const { syncIngestedContent } = await import('$lib/server/graph/pg-neo4j-sync.js');
							await syncIngestedContent(graphNodeId, caseId, docTitle, url);
						} catch {
							// Non-fatal
						}
					}

					const totalMs = Math.round(performance.now() - start);
					emit('complete', 1.0, {
						result: {
							success: true, url, title: docTitle, domain: parsed.hostname,
							chunksCreated: chunks.length,
							totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
							embeddingModel, caseId: caseId || null, graphNodeId, totalMs
						}
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'Ingestion failed';
					const data = JSON.stringify({ stage: 'error', progress: 0, error: msg });
					controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			}
		});
	}

	// Non-streaming mode — existing JSON response
	try {
		// 1. Fetch the URL
		const fetchRes = await fetch(url, {
			headers: {
				'User-Agent': 'ACE-Ingest/1.0 (Legal AI Research)',
				'Accept': 'text/html, application/xhtml+xml, text/plain'
			},
			signal: AbortSignal.timeout(15000)
		});

		if (!fetchRes.ok) {
			return json({ error: `Fetch failed: HTTP ${fetchRes.status}` }, { status: 502 });
		}

		const contentType = fetchRes.headers.get('content-type') ?? '';
		const rawHtml = await fetchRes.text();

		if (!rawHtml || rawHtml.length < 50) {
			return json({ error: 'Page returned empty or very short content' }, { status: 422 });
		}

		// 2. Extract text from HTML (strip tags, scripts, styles)
		const plainText = stripHtml(rawHtml, contentType.includes('text/plain'));
		if (plainText.length < 30) {
			return json({ error: 'No extractable text content found' }, { status: 422 });
		}

		const docTitle = title || extractTitle(rawHtml) || parsed.hostname;

		// 3. Chunk with legal-aware chunker
		const chunks = chunkLegalDocument(plainText, { maxTokens: 400, overlap: 50 });
		if (chunks.length === 0) {
			return json({ error: 'Document produced no chunks' }, { status: 422 });
		}

		// 4. Batch embed all chunks (768-dim via embeddinggemma)
		const chunkTexts = chunks.map((c) => c.text);
		const batchSize = 16;
		const allVectors: number[][] = [];
		let embeddingModel = '';

		for (let i = 0; i < chunkTexts.length; i += batchSize) {
			const batch = chunkTexts.slice(i, i + batchSize);
			const result = await generateEmbeddings(batch);
			allVectors.push(...result.vectors);
			if (!embeddingModel) embeddingModel = result.model;
		}

		// 5. Store each chunk in Qdrant legal_documents
		const sourceHash = createHash('sha256').update(url).digest('hex').slice(0, 12);
		const points = buildPoints(chunks, allVectors, sourceHash, docTitle, url, parsed.hostname, caseId, user.id);
		await qdrant.client.upsert(qdrant.collections.documents, { wait: true, points });

		// 6. Create KAG graph node
		const graphNodeId = await createGraphNode(chunks, caseId, docTitle, parsed.hostname, url, sourceHash, user.id, plainText, allVectors);

		// 7. Neo4j sync (fire and forget)
		if (graphNodeId && caseId) {
			import('$lib/server/graph/pg-neo4j-sync.js')
				.then(({ syncIngestedContent }) => syncIngestedContent(graphNodeId!, caseId!, docTitle, url))
				.catch(() => {/* non-fatal */});
		}

		const totalMs = Math.round(performance.now() - start);

		return json({
			success: true,
			url,
			title: docTitle,
			domain: parsed.hostname,
			chunksCreated: chunks.length,
			totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
			embeddingModel,
			caseId: caseId || null,
			graphNodeId,
			totalMs
		});
	} catch (e) {
		console.error('[api/ace/ingest] Failed:', e);
		return json(
			{ error: 'Ingestion failed' },
			{ status: 500 }
		);
	}
};

/** Build Qdrant points array from chunks + vectors. */
function buildPoints(
	chunks: ReturnType<typeof chunkLegalDocument>,
	allVectors: number[][],
	sourceHash: string,
	docTitle: string,
	sourceUrl: string,
	hostname: string,
	caseId: string | undefined,
	userId: string
) {
	return chunks.map((chunk, idx) => {
		const chunkId = `web-${sourceHash}-${idx}`;
		return {
			id: deterministicPointId(chunkId),
			vector: { content: allVectors[idx] },
			payload: {
				title: docTitle,
				content_preview: chunk.text.substring(0, 500),
				full_text: chunk.text,
				document_type: 'web_ingest',
				source_url: sourceUrl,
				source_domain: hostname,
				case_id: caseId || null,
				chunk_index: idx,
				total_chunks: chunks.length,
				section_path: chunk.sectionPath,
				heading: chunk.heading,
				citations_found: chunk.citations,
				token_count: chunk.tokenCount,
				ingested_by: userId,
				ingested_at: new Date().toISOString()
			}
		};
	});
}

/** Create KAG graph node + auto-discover connections. Returns nodeId or null. */
async function createGraphNode(
	chunks: ReturnType<typeof chunkLegalDocument>,
	caseId: string | undefined,
	docTitle: string,
	hostname: string,
	sourceUrl: string,
	sourceHash: string,
	userId: string,
	plainText: string,
	allVectors: number[][]
): Promise<string | null> {
	if (!caseId) return null;

	try {
		const allCitations = chunks.flatMap((c) => c.citations ?? []);
		const uniqueCitations = [...new Set(allCitations)].slice(0, 20);

		const [node] = await db.insert(yorhaEvidenceNodes).values({
			case_id: caseId,
			title: docTitle,
			description: `Web-ingested document from ${hostname}. ${chunks.length} chunks, ${chunks.reduce((s, c) => s + c.tokenCount, 0)} tokens.`,
			evidence_type: 'web_ingest',
			source: sourceUrl,
			file_path: `web:${sourceHash}`,
			file_type: 'text/html',
			ai_tags: uniqueCitations.length > 0 ? uniqueCitations : null,
			key_entities: uniqueCitations.length > 0 ? { citations: uniqueCitations, domain: hostname } : null,
			relevance_score: 50,
			status: 'active',
			created_by: userId,
		}).returning({ id: yorhaEvidenceNodes.id });

		const graphNodeId = node?.id ?? null;

		// Auto-discover related evidence via Qdrant similarity
		if (graphNodeId && allVectors.length > 0) {
			try {
				const { results: similar } = await qdrant.hybridSearch({
					collection: 'evidence_items' as any,
					query: plainText.slice(0, 300),
					queryEmbedding: allVectors[0],
					limit: 5,
					scoreThreshold: 0.65,
				});

				for (const hit of similar) {
					const evidenceId = (hit.payload as any)?.evidence_id;
					if (!evidenceId) continue;

					const existingNodes = await db.execute(sql`
						SELECT id FROM yorha_evidence_nodes
						WHERE case_id = ${caseId}
						AND (source ILIKE ${'%' + evidenceId + '%'} OR id::text = ${evidenceId})
						LIMIT 1
					`).catch(() => ({ rows: [] }));

					const targetId = (existingNodes.rows[0] as any)?.id;
					if (targetId && targetId !== graphNodeId) {
						await db.insert(yorhaEvidenceConnections).values({
							case_id: caseId,
							source_node_id: graphNodeId,
							target_node_id: targetId,
							connection_type: 'semantic_similarity',
							strength: Math.round((hit.score ?? 0.5) * 100),
							description: `Auto-discovered similarity between web source and existing evidence`,
							confidence_score: Math.round((hit.score ?? 0.5) * 100),
							created_by: userId,
						}).onConflictDoNothing();
					}
				}
			} catch (e) {
				console.warn('[ace/ingest] Connection discovery failed:', (e as Error).message);
			}
		}

		return graphNodeId;
	} catch (e) {
		console.warn('[ace/ingest] Graph node creation failed:', (e as Error).message);
		return null;
	}
}

/**
 * Strip HTML tags, scripts, styles, and normalize whitespace.
 * For text/plain content, just normalize whitespace.
 */
function stripHtml(html: string, isPlainText: boolean): string {
	if (isPlainText) {
		return html.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	let text = html;
	text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
	text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
	text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
	text = text.replace(/<!--[\s\S]*?-->/g, '');
	text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
	text = text.replace(/<br\s*\/?>/gi, '\n');
	text = text.replace(/<[^>]+>/g, ' ');
	text = text.replace(/&amp;/g, '&');
	text = text.replace(/&lt;/g, '<');
	text = text.replace(/&gt;/g, '>');
	text = text.replace(/&quot;/g, '"');
	text = text.replace(/&#39;/g, "'");
	text = text.replace(/&nbsp;/g, ' ');
	text = text.replace(/[ \t]+/g, ' ');
	text = text.replace(/\n[ \t]+/g, '\n');
	text = text.replace(/\n{3,}/g, '\n\n');
	return text.trim();
}

/**
 * Extract <title> from HTML.
 */
function extractTitle(html: string): string | null {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return null;
	const title = match[1].replace(/<[^>]+>/g, '').trim();
	return title.length > 0 && title.length < 200 ? title : null;
}
