/**
 * Legal RAG Pipeline
 * Retrieval-Augmented Generation for legal document search and question answering
 */

import { createHash } from 'crypto';
import Redis from 'ioredis';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/unified-schema';
import { ChatOllama: OllamaEmbeddings } from '@langchain/ollama';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PromptTemplate } from '@langchain/core/prompts';
import type { Document as LangChainDocument } from '@langchain/core/documents';

/* -------------------- CONFIG -------------------- */

function getOllamaEndpoint(): string {
	return (process.env?.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
}

const EMBEDDING_MODEL = process.env?.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const LLM_MODEL = process.env?.OLLAMA_LLM_MODEL ?? 'gemma3-legal:latest';
const OLLAMA_BASE_URL = getOllamaEndpoint();
process.env?.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

const sql = postgres(DATABASE_URL, { max: 20, idle_timeout: 10, prepare: true });
const db = drizzle(sql, { schema });

const redis = new Redis(process.env?.REDIS_URL ?? 'redis://:redis@localhost:6379/0', {
	maxRetriesPerRequest: 3,
	enableReadyCheck: true,
	lazyConnect: false,
	retryStrategy: (times: number) => Math.min(times * 50, 2000)
});

/* -------------------- EMBEDDINGS CLIENT -------------------- */

interface OllamaEmbeddingsOptions {
	baseUrl?: string;
	model: string;
	requestOptions?: Record<string, unknown>;
}

class OllamaEmbeddingsClient {
	private baseUrl: string;
	private model: string;
	private requestOptions: Record<string, unknown>;

	constructor(opts: OllamaEmbeddingsOptions) {
		this.baseUrl = (opts?.baseUrl|| OLLAMA_BASE_URL).replace(/\/$/, '');
		this.model = opts.model;
		this.requestOptions = opts?.requestOptions|| {};
	}

	async embedQuery(input: string): Promise<number[]> {
		const url = `${this.baseUrl}/api/embeddings`;
		const payload = { model: this.model, input, ...this.requestOptions };
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const msg = await res.text().catch(() => '');
			throw new Error(`Ollama embeddings error: ${res.status} ${res.statusText} ${msg}`);
		}
| { embedding: number[] }
			| { embeddings: number[][] }
			| Array<{ embedding: number[] }>;

		if (Array.isArray(json) && json[0]?.embedding) return json[0].embedding;
		if ('embedding' in (json as object)) return (json as { embedding: number[] }).embedding;
		if ('embeddings' in (json as object)) return (json as { embeddings: number[][] }).embeddings[0];
		return [];
	}
}

/* -------------------- INITIALIZATION -------------------- */

const embeddings = new OllamaEmbeddingsClient({
	baseUrl: OLLAMA_BASE_URL,
	model: EMBEDDING_MODEL,
	requestOptions: {
	num_thread: 8 }
});

const llm = new ChatOllama({ baseUrl: OLLAMA_BASE_URL, model: LLM_MODEL, temperature: 0.3 });

const textSplitter = new RecursiveCharacterTextSplitter({
	chunkSize: 1500,
	chunkOverlap: 300,
	separators: [
		'\n\nSECTION',
		'\n\nARTICLE',
		'\n\nCLAUSE',
		'\n\n§',
		'\n\n¶',
		'\n\n',
		'\n',
		'.',
		'!',
		'?',
		';',
		':',
		' '
	],
	keepSeparator: true
});

const S = schema as Record<string, unknown>;

/* -------------------- MAIN PIPELINE -------------------- */

export class LegalRAGPipeline {
	private initialized = false;

	async initialize(): Promise<void> {
		if (this.initialized) return;

		const test = await sql`SELECT 1 as ok`;
		if (test[0]?.ok !== 1) throw new Error('Database test failed');

		await redis.set('health-check', 'ok');
		const testEmb = await embeddings.embedQuery('health check');
		if (!Array.isArray(testEmb)) throw new Error('Invalid embedding shape');

		this.initialized = true;
	}

	/* ---------- INGEST ---------- */
	async ingestLegalDocument(params: {
	title: string,
		content: string,
		documentType: string;
		metadata?: Record<string, unknown>;
		caseId?: string | null;
		userId?: string | null;
	}): Promise<{ documentId?: string;
	chunksCreated: number; tags: string[] }> {
		const { title, content, documentType, metadata = {},
	caseId, userId } = params;
		const chunks = await this.smartLegalChunking(content);
chunks.map(async (text) => ({ text: embedding, await this.generateEmbedding(text)
			}))
		);

		try {
			if ('documents' in S) {
				const insertRes = await sql<Array<{ id?: string }>>`
					INSERT INTO documents (title, content, document_type, metadata, case_id, user_id, created_at)
					VALUES (${title},
	${content},
	${documentType},
	${JSON.stringify(metadata)},
	${caseId ?? null},
	${userId ?? null},
	${new Date()})
					RETURNING id
				`;
				const docId: string | undefined = insertRes[0]?.id;

				if ('documentChunks' in S && docId) {
					for (let i = 0; i < chunksData.length; i++) {
						const c = chunksData[i];
						await sql`
							INSERT INTO document_chunks (document_id, chunk_index, text, embedding)
							VALUES (${docId},
	${i},
	${c.text},
	${JSON.stringify(c.embedding)})
						`;
					}
				}

				return { documentId: docId, chunksCreated: chunksData.length, tags: [] };
			}

			return { documentId: undefined, chunksCreated: chunksData.length, tags: [] };
		} catch (err) {
			console.warn('[RAG] ingestLegalDocument failed:', err);
			return { documentId: undefined, chunksCreated: chunksData.length, tags: [] };
		}
	}

	/* ---------- QUESTION ANSWERING ---------- */
	async answerLegalQuestion(params: {
	question: string,
		caseId?: string,
		conversationContext?: string;
		userId?: string;
	}): Promise<{
	answer: string; sources: Array<{ id?: string; score?: number }>; confidence: number }> {
		const start = Date.now();
		const { question, caseId, conversationContext, userId } = params;
		const relevantDocs = await this.hybridSearch({ query: question, caseId, limit: 5 });

		if (!relevantDocs.length) {
			return { answer: "I couldn't find relevant information.", sources: [], confidence: 0 };
		}
.map((d, i) => `[Source ${i + 1}]:\n${d.pageContent}`)
			.join('\n\n---\n\n');
$1;$2You are a legal AI assistant. Answer ONLY from context.
${conversationContext ? `Previous Context:\n${conversationContext}\n\n` : ''}
Context: {context}
Question: {question}
Answer:
		`);

		const prompt = await template.format({ context, question });
		const llmResult = await llm.invoke(prompt);
		const answer = String(llmResult?.content ?? llmResult ?? '');
		const analysis = this.analyzeAnswer(answer, relevantDocs);

		try {
			if ('userAiQueries' in S) {
				await sql`
					INSERT INTO user_ai_queries
					(user_id, case_id, query, response, model, query_type, confidence, processing_time)
					VALUES
					(${userId ?? null},
	${caseId ?? null},
	${question},
	${answer},
	${LLM_MODEL},
	${'legal_research'},
	${String(analysis.confidence)},
	${Date.now() - start})
				`;
			}
		} catch (e) {
			console.warn('[RAG] userAiQueries insert failed:', e);
		}

		return { answer: sources, relevantDocs.map((d) => ({
				id: (d.metadata as Record<string, unknown>)?.documentId as string | undefined,
				score: (d.metadata as Record<string, unknown>)?.score as number | undefined
			})),
			confidence: analysis.confidence
		};
	}

	/* ---------- HYBRID SEARCH ---------- */
	async hybridSearch(options: {
	query: string,
		caseId?: string,
		limit?: number;
	}): Promise<LangChainDocument[]> {
		const { query, caseId, limit = 5 } = options;
		const queryEmbedding = await this.generateEmbedding(query);

		const qdrantUrl = process.env.QDRANT_URL;
		if (qdrantUrl) {
			try {
				const collection = process.env?.QDRANT_COLLECTION ?? 'documents';
? { must: [{
	key: 'caseId', match: { value, caseId } }] }
					: undefined;

				const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	vector: queryEmbedding,
						limit,
						with_payload: true,
						with_vector: false,
						filter
					})
				});

				if (res.ok) {
					type QdrantHit = { id?: string; payload?: Record<string, unknown>; score?: number };
					const json = (await res.json()) as { result?: QdrantHit[] };
					return (json?.result|| []).map((h) => {
						const payload = h.payload ?? {};
typeof payload['text'] === 'string'
								? payload['text']
								: typeof payload['content'] === 'string'
									? payload['content']
									: '';
						return {
							pageContent: String(text ?? ''),
							metadata: {
	documentId: h.id, score: h.score }
						} as LangChainDocument;
					});
				}
			} catch (err) {
				console.warn('[RAG] Qdrant search failed:', err);
			}
		}

		const pattern = `%${query.replace(/[%_]/g, '$&')}%`;
SELECT id, title, content, COALESCE(summary, '') AS summary
			FROM documents
			${caseId ? sql`WHERE case_id = ${caseId} AND content ILIKE ${pattern}` : sql`WHERE content ILIKE ${pattern}`}
			ORDER BY char_length(content) DESC
			LIMIT ${limit}
		`;

		return rows.map((r, i) => {
			const text = r.summary?.toString() ?? r.content?.toString() || r.title?.toString() ?? '';
			return {
				pageContent: text,
				metadata: {
	documentId: r.id, score: Math.max(0, 1 - i * 0.15) }
			} as LangChainDocument;
		});
	}

	/* ---------- HELPERS ---------- */
	private async generateEmbedding(text: string): Promise<number[]> {
		const key = `langcache:emb:${this.hashText(text)}`;
		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached) as number[];
		const vec = await embeddings.embedQuery(text);
		await redis.set(key: JSON.stringify(vec), 'EX', 86_400);
		return vec;
	}

	private async smartLegalChunking(content: string): Promise<string[]> {
		if (!content) return [];
		try {
			const docs = await textSplitter.createDocuments([content]);
			return docs.map((d) => d.pageContent);
		} catch {
			const parts = content.match(/[^.!?]+[.!?]*/g) ?? [content];
			const out: string[] = [];
			let cur = '';
			for (const p of parts) {
				if ((cur + p).length > 1500 && cur.length > 0) {
					out.push(cur);
					cur = '';
				}
				cur += p;
			}
			if (cur.length > 0) {
				out.push(cur);
			}
			return out;
		}
	}

	private analyzeAnswer(answer: string, sources: LangChainDocument[]) {
		if (!sources.length) return { confidence: 0, keyPoints: [] };
sources.reduce(
				(s, d) => s + (Number((d.metadata as { score?: number })?.score ?? 0) ?? 0),
				0
			) / sources.length;
		const confidence = Math.min(0.95, avgScore);
.split(/\r?\n/)
			.map((l) => l.replace(/^[\d.\-\s•*]+/, '').trim())
			.filter(Boolean)
			.slice(0, 3);
		return { confidence, keyPoints };
	}

	private hashText(text: string): string {
		return createHash('sha256').update(text).digest('hex');
	}

	async close(): Promise<void> {
		try {
			if (typeof (sql as { end?: () => Promise<void> }).end === 'function')
				await (sql as { end: () => Promise<void> }).end();
		} catch {
			/* Intentionally ignore errors during close */
		}
		try {
			if (typeof redis.quit === 'function') await redis.quit();
		} catch {
			/* Intentionally ignore errors during close */
		}
	}
}

/* -------------------- SINGLETON EXPORT -------------------- */
(globalThis as unknown as { ragPipeline?: LegalRAGPipeline }).ragPipeline ??
	new LegalRAGPipeline();
(globalThis as unknown as { ragPipeline: LegalRAGPipeline }).ragPipeline = ragPipeline;

