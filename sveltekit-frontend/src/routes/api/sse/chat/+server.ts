import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { loadCodebaseContext } from '$lib/server/retrieval/codebase-context.js';
import { getGraphContext } from '$lib/server/retrieval/graph-context.js';
import { lookupCachedResponse, storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import { getFragment, setFragment, getGlyphCacheMetrics, FragmentType } from '$lib/server/glyph-prompt-cache.js';
import { createHash } from 'crypto';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';

const sseChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(50000),
  model: z.string().max(100).optional(),
  conversationId: z.string().min(1, 'Missing conversationId').max(200),
  emotionPrompt: z.string().max(5000).optional(),
  emotionMood: z.string().max(100).optional(),
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;

// Embedding model used for both indexing and retrieval — must match
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Token budget caps (chars, ~4 chars per token)
const CASE_CONTEXT_MAX_CHARS = 1200;
const RAG_CHUNK_MAX_CHARS = 600;
const RAG_MAX_CHUNKS = 5;

// Qdrant uses cosine distance — score is already 0..1 similarity.
// For cosine with embeddinggemma, useful hits typically score > 0.30.
const RAG_SCORE_THRESHOLD = 0.3;

// Conversation memory: load last N messages for multi-turn context
const CONVERSATION_HISTORY_LIMIT = 10;

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
  codebaseHits: number;
  kagNeighbors: number;
}

/**
 * Load case context from PostgreSQL for injection into AI prompts.
 * Fetches case details, recent evidence, and linked citations.
 * Respects CASE_CONTEXT_MAX_CHARS budget.
 */
async function loadCaseContext(caseId: string): Promise<string | null> {
  try {
    const { cases } = await import('$lib/server/db/schema');

    const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRows.length) return null;

    const c = caseRows[0];
    let context = `## Active Case Context\n`;
    context += `- **Title**: ${c.title}\n`;
    if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
    if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
    if (c.court) context += `- **Court**: ${c.court}\n`;
    if (c.status) context += `- **Status**: ${c.status}\n`;
    if (c.description) context += `- **Description**: ${c.description}\n`;

    // Load recent evidence with metadata (type, forensic flags, entities)
    try {
      const evidenceResult = await db.execute(
        sql`SELECT title, evidence_type, file_type, file_size, metadata
					FROM evidence WHERE case_id = ${caseId}
					ORDER BY created_at DESC LIMIT 10`
      );
      const evidenceRows = evidenceResult.rows || [];

      if (evidenceRows.length > 0) {
        context += `\n## Evidence on File (${evidenceRows.length} items)\n`;
        for (const e of evidenceRows as any[]) {
          const type = (e.evidence_type || 'unknown').toUpperCase();
          const meta = (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) || {};
          const entityCount =
            meta.entityCount ?? (Array.isArray(meta.entities) ? meta.entities.length : 0);
          const flags = Array.isArray(meta.forensicFlags) ? meta.forensicFlags : [];
          const highFlags = flags.filter((f: any) => f.severity === 'high');
          const forensicLabel = highFlags.length
            ? `Forensic: HIGH (${highFlags.length})`
            : flags.length
              ? `Forensic: ${flags.length} flags`
              : 'No forensic flags';
          const summary = meta.summary ? String(meta.summary).slice(0, 80) : '';
          context += `- [${type}] "${e.title || 'Untitled'}" (${e.file_type || 'unknown'}) | Entities: ${entityCount} | ${forensicLabel}${summary ? '\n  ' + summary : ''}\n`;
        }
      }
    } catch (e) {
      console.warn('[Case Context] Evidence query failed:', e instanceof Error ? e.message : e);
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
    } catch (e) {
      console.warn('[Case Context] Citations query failed:', e instanceof Error ? e.message : e);
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
  'case_chunks', // court opinions, rulings, case law
  'law_sections', // statutes, constitutions, regulations, codes
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
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        score_threshold: RAG_SCORE_THRESHOLD,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      _collection: collection,
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
async function retrieveContext(query: string, limit = RAG_MAX_CHUNKS): Promise<ContextDoc[]> {
  try {
    // 1. Generate embedding for the user query
    const embedRes = await traceEmbedding(query, EMBEDDING_MODEL, () =>
      ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query, keep_alive: '24h' }),
        signal: AbortSignal.timeout(8000),
      })
    );

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
      const summary = topResults
        .map((r) => `${r._collection}:${Number(r.score ?? 0).toFixed(3)}`)
        .join(', ');
      console.log(
        `[RAG] ${merged.length} total hits across ${RAG_COLLECTIONS.length} collections → top ${topResults.length}: [${summary}]`
      );
    }

    // 4. Map to ContextDoc with validation
    return topResults
      .map((r) => {
        const payload = r.payload as Record<string, unknown> | undefined;

        const pointModel = payload?.embedding_model as string | undefined;
        const pointDims = payload?.embedding_dims as number | undefined;
        if (pointModel && pointModel !== embeddingModel) return null;
        if (pointDims && pointDims !== embeddingDims) return null;

        const rawContent = String(payload?.text ?? payload?.content ?? payload?.title ?? '');
        const content =
          rawContent.length > RAG_CHUNK_MAX_CHARS
            ? rawContent.slice(0, RAG_CHUNK_MAX_CHARS) + '...'
            : rawContent;

        return {
          content,
          similarity: Number(r.score ?? 0),
          documentId: `${r._collection}:${r.id}`,
          model: pointModel,
        };
      })
      .filter((r: ContextDoc | null): r is ContextDoc => r !== null && r.content.length > 0);
  } catch (err) {
    console.warn('[RAG] Context retrieval skipped:', err);
    return [];
  }
}

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json();
	const parsed = sseChatSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response(parsed.error.issues[0]?.message ?? 'Invalid input', { status: 400 });
	}
	const { message, model, conversationId, emotionPrompt, emotionMood } = parsed.data;

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

	// Publish user message to chat.context queue for embedding indexing (non-blocking)
	import('$lib/server/queue/rabbitmq-manager-fixed.js').then(({ rabbitmq }) => {
		rabbitmq.publishChatContext({
			sessionId: conversationId,
			message,
			role: 'user',
			metadata: { emotionMood: emotionMood ?? undefined }
		});
	}).catch(() => { /* RabbitMQ unavailable — non-critical */ });

	// Load conversation history for multi-turn context
	let conversationHistory: Array<{ role: string; content: string }> = [];
	try {
		const historyRows = await db
			.select({ role: chatMessages.role, content: chatMessages.content })
			.from(chatMessages)
			.where(eq(chatMessages.chatId, conversationId))
			.orderBy(desc(chatMessages.timestamp))
			.limit(CONVERSATION_HISTORY_LIMIT + 1); // +1 because we just inserted the current message

		// Reverse to chronological order, exclude the current message (already sent separately)
		conversationHistory = historyRows
			.reverse()
			.slice(0, -1) // remove last entry (current user message, added above)
			.map(r => ({ role: r.role, content: r.content }));
	} catch (e) {
		console.warn('[Chat] History load failed — continuing without history:', e instanceof Error ? e.message : e);
	}

	const abortSignal = request.signal;

	const shared = { cleanup: () => {} };
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const id = crypto.randomUUID();
			let closed = false;

			const send = (data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch { closed = true; }
			};

			// Heartbeat every 25s to prevent proxy timeout
			const heartbeat = setInterval(() => {
				if (closed) { clearInterval(heartbeat); return; }
				try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); } catch { closed = true; clearInterval(heartbeat); }
			}, 25_000);

			// Clean up on client disconnect
			shared.cleanup = () => {
				closed = true;
				clearInterval(heartbeat);
			};
			abortSignal.addEventListener('abort', shared.cleanup, { once: true });

			// Set SSE reconnection interval (3s) for auto-reconnect on disconnect
			controller.enqueue(encoder.encode('retry: 3000\n\n'));

			send({ id, role: 'assistant', content: '', status: 'thinking' });

			// L0.5 Glyph Cache: emit diagnostic metrics
			const glyphMetrics = getGlyphCacheMetrics();
			if (glyphMetrics.entries > 0) {
				console.log(`[Glyph L0.5] ${glyphMetrics.entries} entries, hit rate: ${(glyphMetrics.hitRate * 100).toFixed(1)}%, compression: ${(glyphMetrics.avgCompressionRatio * 100).toFixed(0)}%`);
			}

			// ── L0.5 Intercept 1: Case Context ──────────────────────────
			// Cache case context per caseId (10min TTL) — identical for every
			// message in a conversation, saves 1 DB query + 2 evidence/citation queries
			let caseContext: string | null = null;
			const caseMatch = conversationId.match(CASE_ID_PATTERN);
			if (caseMatch) {
				const caseGlyphKey = `glyph:case:${caseMatch[1]}`;
				caseContext = getFragment(caseGlyphKey);
				if (caseContext) {
					console.log(`[Glyph L0.5] Case context HIT (${caseContext.length} chars)`);
				} else {
					caseContext = await loadCaseContext(caseMatch[1]);
					if (caseContext) {
						setFragment(caseGlyphKey, caseContext, FragmentType.CASE, 10 * 60_000);
					}
				}
			}

			// Code-intent gate: only run codebase retrieval for code-related queries
			const CODE_HINT = /(svelte|sveltekit|drizzle|ts-morph|playwright|hooks\.server|schema-postgres|route|endpoint|api\/|\.ts\b|\.svelte\b|stack trace|error|typescrip|build|vite|qdrant|rabbitmq|proto|grpc|function|handler|component|database|query|schema|migration|server)/i;
			const wantsCode = CODE_HINT.test(message) || message.includes('in this repo') || message.includes('codebase');

			// RAG + Codebase: retrieve context sources in parallel
			const caseUuid = caseMatch ? caseMatch[1] : undefined;

			// ── L0.5 Intercept 2: Codebase Context ──────────────────────
			// Cache codebase retrieval by query hash (5min TTL)
			let codebaseResult: { context: string; chunks: Array<{ relativePath: string; symbol: string; score: number }> } | null = null;
			let codeGlyphHit = false;
			if (wantsCode) {
				const codeGlyphKey = `glyph:code:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
				const cachedCodeCtx = getFragment(codeGlyphKey);
				if (cachedCodeCtx) {
					codebaseResult = { context: cachedCodeCtx, chunks: [] };
					codeGlyphHit = true;
					console.log(`[Glyph L0.5] Codebase context HIT (${cachedCodeCtx.length} chars)`);
				}
			}

			const [contextDocs, freshCodebaseResult] = await Promise.all([
				retrieveContext(message),
				(wantsCode && !codeGlyphHit) ? loadCodebaseContext(message).catch(() => null) : Promise.resolve(null)
			]);

			// If we got fresh codebase context, cache it in L0.5
			if (freshCodebaseResult && !codeGlyphHit) {
				codebaseResult = freshCodebaseResult;
				const codeGlyphKey = `glyph:code:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
				setFragment(codeGlyphKey, freshCodebaseResult.context, FragmentType.CODE, 5 * 60_000);
			}

			const contextUsed = contextDocs.map((d) => d.documentId);

			// ── L0.5 Intercept 3: KAG Graph Context ─────────────────────
			// Cache graph traversal by evidence ID set (10min TTL)
			let graphContext: { context: string; neighbors: Array<{ nodeId: string; title: string }> } | null = null;
			if (contextDocs.length > 0) {
				const evidenceIds = contextDocs
					.map(d => d.documentId.split(':').pop())
					.filter((id): id is string => !!id);

				const kagGlyphKey = `glyph:kag:${createHash('md5').update(evidenceIds.sort().join(',')).digest('hex').slice(0, 12)}`;
				const cachedKag = getFragment(kagGlyphKey);
				if (cachedKag) {
					graphContext = { context: cachedKag, neighbors: [] };
					console.log(`[Glyph L0.5] KAG graph context HIT (${cachedKag.length} chars)`);
				} else {
					graphContext = await getGraphContext(evidenceIds, caseUuid).catch(() => null);
					if (graphContext) {
						setFragment(kagGlyphKey, graphContext.context, FragmentType.KAG, 10 * 60_000);
					}
				}
			}

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

			// Inject KAG graph neighbors (related evidence from knowledge graph)
			if (graphContext) {
				systemPrompt += `\n${graphContext.context}`;
			}

			// Inject codebase context (recall→rerank pipeline)
			if (codebaseResult) {
				systemPrompt += `\n\n${codebaseResult.context}`;
			}

			// Inject emotion context from client-side detection (text + face + behavioral)
			if (emotionPrompt) {
				systemPrompt += `\n${emotionPrompt}`;
			}

			let fullResponse = '';

			// LLM Response Cache: Check if we have a cached response for this query + context
			const cacheResult = await lookupCachedResponse({
				query: message,
				context: systemPrompt,
				model: model ?? 'gemma3-legal:latest'
			});

			if (cacheResult.hit && cacheResult.response) {
				// Cache HIT — stream the cached response in chunks to simulate live streaming
				console.log(`[SSE Chat] Cache HIT — similarity: ${cacheResult.similarity?.toFixed(3)}`);
				fullResponse = cacheResult.response;

				// Simulate streaming by sending chunks (improves UX, user sees progressive output)
				const chunkSize = 50; // characters per chunk
				for (let i = 0; i < fullResponse.length; i += chunkSize) {
					const chunk = fullResponse.slice(i, i + chunkSize);
					send({
						id,
						role: 'assistant',
						content: fullResponse.slice(0, i + chunkSize),
						status: 'streaming'
					});
					// Small delay to simulate natural typing speed
					await new Promise(resolve => setTimeout(resolve, 20));
				}

				// Build confidence factors (use cached values if available)
				const topScore =
					contextDocs.length > 0
						? Math.max(...contextDocs.map((d) => d.similarity))
						: null;

				const confidenceFactors: ConfidenceFactors = {
					caseContext: caseContext !== null,
					ragHits: contextDocs.length,
					topScore,
					embeddingModel: EMBEDDING_MODEL,
					codebaseHits: codebaseResult?.chunks.length ?? 0,
					kagNeighbors: graphContext?.neighbors.length ?? 0
				};

				let confidence = cacheResult.confidence ?? 0.8; // Use cached confidence or default

				// Extract citations
				const extractedCitations: Array<{ sourceNum: number; documentId: string; similarity: number }> = [];
				const sourceRefs = fullResponse.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
				for (const ref of sourceRefs) {
					const match = ref.match(/\[Source\s+(\d+)/);
					if (match) {
						const sourceNum = parseInt(match[1]) - 1;
						if (sourceNum >= 0 && sourceNum < contextDocs.length) {
							const doc = contextDocs[sourceNum];
							if (!extractedCitations.some(c => c.documentId === doc.documentId)) {
								extractedCitations.push({
									sourceNum: sourceNum + 1,
									documentId: doc.documentId,
									similarity: doc.similarity
								});
							}
						}
					}
				}

				// Persist assistant message
				const assistantMetadata = JSON.stringify({
					confidenceFactors,
					contextUsed: {
						case: caseContext !== null,
						ragDocIds: contextUsed,
						ragScores: contextDocs.map((d) => ({
							id: d.documentId,
							score: d.similarity
						})),
						codebaseChunks: codebaseResult?.chunks.map((c) => ({
							path: c.relativePath,
							symbol: c.symbol,
							score: c.score
						})) ?? [],
						citations: extractedCitations
					},
					conversationTurns: conversationHistory.length,
					model: model ?? 'gemma3-legal:latest',
					cachedResponse: true,
					cachedAt: cacheResult.cachedAt
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
					contextUsed,
					citations: extractedCitations,
					conversationTurns: conversationHistory.length,
					cachedResponse: true
				});

				controller.close();
				return;
			}

			// Cache MISS — proceed with Ollama API call
			try {
				// Build multi-turn messages array for Ollama /api/chat
				const ollamaMessages = [
					{ role: 'system', content: systemPrompt },
					...conversationHistory,
					{ role: 'user', content: message }
				];

				// Stream from Ollama with RAG-enriched system prompt + conversation history
				const ollamaRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: model ?? 'gemma3-legal:latest',
						messages: ollamaMessages,
						stream: true,
						keep_alive: '24h'
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
							// Ollama /api/chat returns message.content; /api/generate returns response
							const chunk = parsed.message?.content ?? parsed.response;
							if (chunk) {
								fullResponse += chunk;
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
					embeddingModel: EMBEDDING_MODEL,
					codebaseHits: codebaseResult?.chunks.length ?? 0,
					kagNeighbors: graphContext?.neighbors.length ?? 0
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
				if (codebaseResult && codebaseResult.chunks.length > 0) {
					confidence += Math.min(codebaseResult.chunks.length * 0.03, 0.1);
				}
				if (graphContext && graphContext.neighbors.length > 0) {
					confidence += Math.min(graphContext.neighbors.length * 0.02, 0.1);
				}
				confidence = Math.min(confidence, 0.95);

				// Extract [Source N] citations from the LLM response
				const extractedCitations: Array<{ sourceNum: number; documentId: string; similarity: number }> = [];
				const sourceRefs = fullResponse.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
				for (const ref of sourceRefs) {
					const match = ref.match(/\[Source\s+(\d+)/);
					if (match) {
						const sourceNum = parseInt(match[1]) - 1;
						if (sourceNum >= 0 && sourceNum < contextDocs.length) {
							const doc = contextDocs[sourceNum];
							if (!extractedCitations.some(c => c.documentId === doc.documentId)) {
								extractedCitations.push({
									sourceNum: sourceNum + 1,
									documentId: doc.documentId,
									similarity: doc.similarity
								});
							}
						}
					}
				}

				// Persist assistant message with context metadata
				const assistantMetadata = JSON.stringify({
					confidenceFactors,
					contextUsed: {
						case: caseContext !== null,
						ragDocIds: contextUsed,
						ragScores: contextDocs.map((d) => ({
							id: d.documentId,
							score: d.similarity
						})),
						codebaseChunks: codebaseResult?.chunks.map((c) => ({
							path: c.relativePath,
							symbol: c.symbol,
							score: c.score
						})) ?? [],
						citations: extractedCitations
					},
					conversationTurns: conversationHistory.length,
					model: model ?? 'gemma3-legal:latest'
				});

				await db.insert(chatMessages).values({
					id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					chatId: conversationId,
					role: 'assistant',
					content: fullResponse,
					metadata: assistantMetadata
				});

				// Publish assistant response to chat.context queue (non-blocking)
				import('$lib/server/queue/rabbitmq-manager-fixed.js').then(({ rabbitmq }) => {
					rabbitmq.publishChatContext({
						sessionId: conversationId,
						message: fullResponse.slice(0, 5000),
						role: 'assistant',
						metadata: { model: model ?? 'gemma3-legal:latest', confidence }
					});
				}).catch(() => {});

				// Store response in LLM cache for future lookups (non-blocking)
				// Generate embedding for caching (reuses embedding from retrieveContext if available)
				const embedRes = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: message, keep_alive: '24h' }),
					signal: AbortSignal.timeout(8000)
				}).catch(() => null);

				if (embedRes?.ok) {
					const embedData = await embedRes.json();
					if (Array.isArray(embedData.embedding)) {
						storeCachedResponse({
							query: message,
							queryEmbedding: embedData.embedding,
							context: systemPrompt,
							response: fullResponse,
							model: model ?? 'gemma3-legal:latest',
							confidence
						}).catch(err => console.warn('[SSE Chat] Cache storage failed:', err));
					}
				}

				send({
					id,
					role: 'assistant',
					content: fullResponse,
					status: 'done',
					confidence,
					confidenceFactors,
					contextUsed,
					citations: extractedCitations,
					conversationTurns: conversationHistory.length
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

			shared.cleanup();
			controller.close();
		},

		cancel() {
			shared.cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
