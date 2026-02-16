import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

// Embedding model used for both indexing and retrieval — must match
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Token budget caps (chars, ~4 chars per token)
const CASE_CONTEXT_MAX_CHARS = 1200;
const RAG_CHUNK_MAX_CHARS = 600;
const RAG_MAX_CHUNKS = 5;

// Qdrant uses cosine distance — score is already 0..1 similarity.
// For cosine with embeddinggemma, useful hits typically score > 0.30.
const RAG_SCORE_THRESHOLD = 0.30;

// Strict caseId format: "case-" followed by a UUID
const CASE_ID_PATTERN = /^case-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

interface ContextDoc {
	content: string;
	similarity: number;
	documentId: string;
	model?: string;
}

interface ConfidenceFactors {
	caseContext: boolean;
	ragHits: number;
	topScore: number | null;
	embeddingModel: string;
}

/**
 * Load case context from PostgreSQL for injection into AI prompts.
 * Fetches case details, recent evidence, and linked citations.
 * Respects CASE_CONTEXT_MAX_CHARS budget.
 */
async function loadCaseContext(caseId: string): Promise<string | null> {
	try {
		const { cases } = await import('$lib/server/db/schema');

		const caseRows = await db
			.select()
			.from(cases)
			.where(eq(cases.id, caseId))
			.limit(1);

		if (!caseRows.length) return null;

		const c = caseRows[0];
		let context = `## Active Case Context\n`;
		context += `- **Title**: ${c.title}\n`;
		if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
		if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
		if (c.court) context += `- **Court**: ${c.court}\n`;
		if (c.status) context += `- **Status**: ${c.status}\n`;
		if (c.description) context += `- **Description**: ${c.description}\n`;

		// Load recent evidence
		try {
			const { evidence } = await import('$lib/server/db/schema');
			const evidenceRows = await db
				.select()
				.from(evidence)
				.where(eq(evidence.caseId, caseId))
				.limit(5);

			if (evidenceRows.length > 0) {
				context += `\n## Evidence (${evidenceRows.length} items)\n`;
				for (const e of evidenceRows) {
					context += `- ${e.title ?? e.fileType ?? 'Untitled'}: ${e.description ?? ''}\n`;
				}
			}
		} catch {
			// Evidence table may not exist yet
		}

		// Load linked citations
		try {
			const { savedCitations } = await import('$lib/server/db/schema');
			const citationRows = await db
				.select()
				.from(savedCitations)
				.where(eq(savedCitations.caseId, caseId))
				.limit(10);

			if (citationRows.length > 0) {
				context += `\n## Citations (${citationRows.length} items)\n`;
				for (const cit of citationRows) {
					context += `- ${cit.statuteCode}: ${cit.statuteTitle ?? ''}\n`;
				}
			}
		} catch {
			// Citations table may not exist yet
		}

		// Enforce token budget
		if (context.length > CASE_CONTEXT_MAX_CHARS) {
			context = context.slice(0, CASE_CONTEXT_MAX_CHARS) + '\n...(truncated)';
		}

		return context;
	} catch (error) {
		console.warn('[Case Context] Failed to load:', error);
		return null;
	}
}

// All legal RAG collections to search (768-dim Cosine, embeddinggemma)
const RAG_COLLECTIONS = [
	'evidence_vectors', // uploaded evidence: PDFs, images, documents
	'case_chunks',      // court opinions, rulings, case law
	'law_sections'      // statutes, constitutions, regulations, codes
] as const;

/**
 * Search a single Qdrant collection. Returns raw hits or empty array on failure.
 */
async function searchCollection(
	collection: string,
	vector: number[],
	limit: number
): Promise<Array<Record<string, unknown>>> {
	try {
		const res = await fetch(
			`${QDRANT_URL}/collections/${collection}/points/search`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector,
					limit,
					with_payload: true,
					score_threshold: RAG_SCORE_THRESHOLD
				}),
				signal: AbortSignal.timeout(5000)
			}
		);
		if (!res.ok) return [];
		const data = await res.json();
		return (data.result ?? []).map((r: Record<string, unknown>) => ({
			...r,
			_collection: collection
		}));
	} catch {
		return [];
	}
}

/**
 * Retrieve relevant context documents using Qdrant vector search.
 * Embeds the query via Ollama, searches all legal collections in parallel,
 * merges results by score, validates embedding consistency.
 * Returns empty array if embedding or search fails (chat continues without RAG).
 */
async function retrieveContext(
	query: string,
	limit = RAG_MAX_CHUNKS
): Promise<ContextDoc[]> {
	try {
		// 1. Generate embedding for the user query
		const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query }),
			signal: AbortSignal.timeout(8000)
		});

		if (!embedRes.ok) return [];
		const embedData = await embedRes.json();
		const vector = embedData.embedding;
		if (!Array.isArray(vector) || vector.length === 0) return [];

		const embeddingDims = vector.length;
		const embeddingModel = String(embedData.model ?? EMBEDDING_MODEL);

		// 2. Search ALL legal collections in parallel
		const allHits = await Promise.all(
			RAG_COLLECTIONS.map((col) => searchCollection(col, vector, limit))
		);
		const merged = allHits.flat();

		// 3. Sort by score descending, take top `limit`
		merged.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
		const topResults = merged.slice(0, limit);

		if (topResults.length > 0) {
			const summary = topResults.map((r) =>
				`${r._collection}:${Number(r.score ?? 0).toFixed(3)}`
			).join(', ');
			console.log(`[RAG] ${merged.length} total hits across ${RAG_COLLECTIONS.length} collections → top ${topResults.length}: [${summary}]`);
		}

		// 4. Map to ContextDoc with validation
		return topResults
			.map((r) => {
				const payload = r.payload as Record<string, unknown> | undefined;

				const pointModel = payload?.embedding_model as string | undefined;
				const pointDims = payload?.embedding_dims as number | undefined;
				if (pointModel && pointModel !== embeddingModel) return null;
				if (pointDims && pointDims !== embeddingDims) return null;

				const rawContent = String(
					payload?.text ?? payload?.content ?? payload?.title ?? ''
				);
				const content =
					rawContent.length > RAG_CHUNK_MAX_CHARS
						? rawContent.slice(0, RAG_CHUNK_MAX_CHARS) + '...'
						: rawContent;

				return {
					content,
					similarity: Number(r.score ?? 0),
					documentId: `${r._collection}:${r.id}`,
					model: pointModel
				};
			})
			.filter((r: ContextDoc | null): r is ContextDoc => r !== null && r.content.length > 0);
	} catch (err) {
		console.warn('[RAG] Context retrieval skipped:', err);
		return [];
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const { message, model, conversationId } = await request.json();

	if (!conversationId) {
		return new Response('Missing conversationId', { status: 400 });
	}

	// Save user message to chatMessages table
	try {
		await db.insert(chatMessages).values({
			id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			chatId: conversationId,
			role: 'user',
			content: message
		});
	} catch (e) {
		console.error('Failed to save user message', e);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const id = crypto.randomUUID();

			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			send({ id, role: 'assistant', content: '', status: 'thinking' });

			// Case context: strict UUID validation
			let caseContext: string | null = null;
			const caseMatch = conversationId.match(CASE_ID_PATTERN);
			if (caseMatch) {
				caseContext = await loadCaseContext(caseMatch[1]);
			}

			// RAG: retrieve context documents before generating
			const contextDocs = await retrieveContext(message);
			const contextUsed = contextDocs.map((d) => d.documentId);

			let systemPrompt =
				'You are a legal AI assistant specialized in prosecutor and detective workflows. ' +
				'Provide accurate, detailed, and actionable legal analysis. ' +
				'Always cite relevant statutes and case law when possible.';

			// Inject case context (case details, evidence, citations)
			if (caseContext) {
				systemPrompt += `\n\n${caseContext}`;
			}

			// Inject RAG context (vector-similar documents, budget-capped)
			if (contextDocs.length > 0) {
				const contextText = contextDocs
					.map(
						(d, i) =>
							`[Source ${i + 1} (relevance: ${d.similarity.toFixed(2)})] ${d.content}`
					)
					.join('\n\n');
				systemPrompt += `\n\nRelevant evidence from the knowledge base:\n${contextText}\n\nUse this context to inform your response. Cite source numbers when referencing specific evidence.`;
			}

			let fullResponse = '';

			try {
				// Stream from Ollama with RAG-enriched system prompt
				const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: model ?? 'gemma3-legal:latest',
						system: systemPrompt,
						prompt: message,
						stream: true
					})
				});

				if (!ollamaRes.ok || !ollamaRes.body) {
					throw new Error(`Ollama error: ${ollamaRes.status}`);
				}

				const reader = ollamaRes.body.getReader();
				const decoder = new TextDecoder();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const text = decoder.decode(value, { stream: true });
					for (const line of text.split('\n').filter(Boolean)) {
						try {
							const parsed = JSON.parse(line);
							if (parsed.response) {
								fullResponse += parsed.response;
								send({
									id,
									role: 'assistant',
									content: fullResponse,
									status: 'streaming'
								});
							}
						} catch {
							// skip malformed JSON lines
						}
					}
				}

				// Build confidence factors (auditable)
				const topScore =
					contextDocs.length > 0
						? Math.max(...contextDocs.map((d) => d.similarity))
						: null;

				const confidenceFactors: ConfidenceFactors = {
					caseContext: caseContext !== null,
					ragHits: contextDocs.length,
					topScore,
					embeddingModel: EMBEDDING_MODEL
				};

				// Confidence: base 0.4, +0.15 for case context, +0.05 per RAG hit, +0.15 for high-quality top hit
				let confidence = 0.4;
				if (caseContext) confidence += 0.15;
				if (contextDocs.length > 0) {
					confidence += Math.min(contextDocs.length * 0.05, 0.25);
				}
				if (topScore !== null && topScore > 0.6) {
					confidence += 0.15;
				}
				confidence = Math.min(confidence, 0.95);

				// Persist assistant message with context metadata
				const assistantMetadata = JSON.stringify({
					confidenceFactors,
					contextUsed: {
						case: caseContext !== null,
						ragDocIds: contextUsed,
						ragScores: contextDocs.map((d) => ({
							id: d.documentId,
							score: d.similarity
						}))
					},
					model: model ?? 'gemma3-legal:latest'
				});

				await db.insert(chatMessages).values({
					id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					chatId: conversationId,
					role: 'assistant',
					content: fullResponse,
					metadata: assistantMetadata
				});

				send({
					id,
					role: 'assistant',
					content: fullResponse,
					status: 'done',
					confidence,
					confidenceFactors,
					contextUsed
				});
			} catch (error) {
				console.error('Generation error:', error);
				send({
					id,
					role: 'assistant',
					content: 'Sorry, I encountered an error generating a response.',
					status: 'error'
				});
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
