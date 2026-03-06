import { json, type RequestHandler } from '@sveltejs/kit';
import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { createHash } from 'crypto';

/**
 * POST /api/ace/ingest
 * Ingest a web URL: fetch → strip HTML → chunk → embed → store in Qdrant legal_documents.
 *
 * Body: { url: string, caseId?: string, title?: string }
 * Returns: { success, url, title, chunksCreated, embeddingModel, totalMs }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const start = performance.now();

	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { url, caseId, title } = body as { url?: string; caseId?: string; title?: string };

	if (!url || typeof url !== 'string') {
		return json({ error: 'url is required' }, { status: 400 });
	}

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
		// Process in batches of 16 to avoid overloading Ollama
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
		const points = chunks.map((chunk, idx) => {
			const chunkId = `web-${sourceHash}-${idx}`;
			return {
				id: deterministicPointId(chunkId),
				vector: { content: allVectors[idx] },
				payload: {
					title: docTitle,
					content_preview: chunk.text.substring(0, 500),
					full_text: chunk.text,
					document_type: 'web_ingest',
					source_url: url,
					source_domain: parsed.hostname,
					case_id: caseId || null,
					chunk_index: idx,
					total_chunks: chunks.length,
					section_path: chunk.sectionPath,
					heading: chunk.heading,
					citations_found: chunk.citations,
					token_count: chunk.tokenCount,
					ingested_by: user.id,
					ingested_at: new Date().toISOString()
				}
			};
		});

		await qdrant.client.upsert(qdrant.collections.documents, {
			wait: true,
			points
		});

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
			totalMs
		});
	} catch (e) {
		console.error('[api/ace/ingest] Failed:', e);
		return json(
			{ error: e instanceof Error ? e.message : 'Ingestion failed' },
			{ status: 500 }
		);
	}
};

/**
 * Strip HTML tags, scripts, styles, and normalize whitespace.
 * For text/plain content, just normalize whitespace.
 */
function stripHtml(html: string, isPlainText: boolean): string {
	if (isPlainText) {
		return html.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	let text = html;
	// Remove script/style blocks
	text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
	text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
	text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
	// Remove HTML comments
	text = text.replace(/<!--[\s\S]*?-->/g, '');
	// Convert block elements to newlines
	text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
	text = text.replace(/<br\s*\/?>/gi, '\n');
	// Strip remaining tags
	text = text.replace(/<[^>]+>/g, ' ');
	// Decode common HTML entities
	text = text.replace(/&amp;/g, '&');
	text = text.replace(/&lt;/g, '<');
	text = text.replace(/&gt;/g, '>');
	text = text.replace(/&quot;/g, '"');
	text = text.replace(/&#39;/g, "'");
	text = text.replace(/&nbsp;/g, ' ');
	// Normalize whitespace
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
