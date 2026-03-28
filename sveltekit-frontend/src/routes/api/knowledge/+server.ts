import { QdrantClient } from '@qdrant/js-client-rest';
import { json, type RequestHandler } from '@sveltejs/kit';
import { JSDOM } from 'jsdom';
import pdfParse from 'pdf-parse';
import postgres from 'postgres';
import { getDatabaseUrl, getQdrantUrl, getOllamaUrl } from '$lib/config/env.server.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';

const sql = postgres(getDatabaseUrl());
const qdrant = new QdrantClient({ url: getQdrantUrl() });

/** Scored point returned by Qdrant search/query */
interface QdrantScoredPoint {
  id: number | string;
  score: number;
  payload?: Record<string, unknown>;
}

// Qdrant client with extended methods (query/upsert with named vectors)
// beyond what @qdrant/js-client-rest types currently expose
/** Qdrant query response wrapper */
interface QdrantQueryResponse { points: QdrantScoredPoint[] }

const qd = qdrant as QdrantClient & {
  query(collection: string, params: Record<string, unknown>): Promise<QdrantQueryResponse>;
  upsert(collection: string, params: Record<string, unknown>): Promise<void>;
};

const OLLAMA_URL_VAR = getOllamaUrl();
const GEMINI_API_KEY = ENV.GEMINI_API_KEY;

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const LOCAL_LLM = 'gemma3-legal:latest';

/**
 * Extract text from various document formats
 */
async function extractDocumentText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const pdf = await pdfParse(Buffer.from(buffer));
    return pdf.text;
  } else if (ext === 'txt') {
    return new TextDecoder().decode(buffer);
  } else if (ext === 'html' || ext === 'htm') {
    const html = new TextDecoder().decode(buffer);
    const dom = new JSDOM(html);
    return dom.window.document.body?.textContent ?? '';
  } else if (ext === 'md' || ext === 'markdown') {
    return new TextDecoder().decode(buffer);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Split text into chunks with overlap for better context
 */
function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.filter(c => c.trim().length > 0);
}

/**
 * Generate embedding for text via Ollama
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ollamaFetch(`${OLLAMA_URL_VAR}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text.substring(0, 8000)
      })
    });

    const data = await response.json();
    return data?.embedding || [];
  } catch (err) {
    console.error('Embedding failed:', err);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureQdrantCollection() {
  try {
    await qdrant.getCollection('knowledge_base');
    // Ensure sparse vectors configured on existing collection
    try {
      await qdrant.updateCollection('knowledge_base', {
        sparse_vectors: { bm25: {} }
      });
    } catch { /* already configured */ }
  } catch {
    await qdrant.createCollection('knowledge_base', {
      vectors: {
        size: 768,
        distance: 'Cosine'
      },
      sparse_vectors: {
        bm25: {}
      }
    });
  }
}

/**
 * POST /api/knowledge - Upload documents for ingestion
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const source = formData.get('source') as string ?? 'user-upload';

    if (!files || files.length === 0) {
      return json({ error: 'No files provided' }, { status: 400 });
    }

    await ensureQdrantCollection();

    const results = [];

    for (const file of files) {
      try {
        // Extract text
        const text = await extractDocumentText(file);
        const chunks = chunkText(text);

        // Process chunks
        const pointIds = [];
        for (const [idx, chunk] of chunks.entries()) {
          const embedding = await generateEmbedding(chunk);

          const pointId = Date.now() * 1000 + idx;
          const payload = {
            document_name: file.name,
            content: chunk,
            source,
            uploaded_at: new Date().toISOString(),
            chunk_count: chunks.length
          };

          // Generate BM42 sparse vector for hybrid search
          const sparse = generateSparseVector(chunk);

          // Store in Qdrant (dense + sparse vectors)
          await qd.upsert('knowledge_base', {
            points: [
              {
                id: pointId,
                vector: {
                  '': embedding,
                  'bm25': sparse,
                },
                payload: {
                  ...payload,
                  text: chunk.slice(0, 500),
                },
              }
            ]
          });

          pointIds.push(pointId);

          // Store metadata in PostgreSQL
          await sql`
            INSERT INTO knowledge_base (doc_name, chunk_idx, content, source, embedding_id)
            VALUES (${file.name}, ${idx}, ${chunk}, ${source}, ${pointId.toString()})
            ON CONFLICT (embedding_id) DO UPDATE SET content = ${chunk}
          `;
        }

        results.push({
          file: file.name,
          chunks: chunks.length,
          points: pointIds.length,
          status: 'success'
        });

      } catch (err) {
        results.push({
          file: file.name,
          error: 'Processing failed',
          status: 'failed'
        });
      }
    }

    return json({
      success: true,
      message: `Processed ${files.length} file(s)`,
      results
    });
  } catch (err) {
    console.error('Upload error:', err);
    return json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
};

const knowledgeSearchSchema = z.object({
  q: z.string().min(1, 'Query parameter required').max(5000),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

/**
 * GET /api/knowledge - Search knowledge base with RAG
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = knowledgeSearchSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  }
  const { q: query, limit } = parsed.data;

  try {
    await ensureQdrantCollection();

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Hybrid search: dense + BM42 sparse with RRF fusion
    const querySparse = generateSparseVector(query);
    let results: QdrantScoredPoint[];
    try {
      const queryRes = await qd.query('knowledge_base', {
        prefetch: [
          { query: queryEmbedding, using: '', limit: limit * 2 },
          { query: querySparse, using: 'bm25', limit: limit * 2 },
        ],
        query: { fusion: 'rrf' },
        limit,
        score_threshold: 0.4,
      });
      results = queryRes.points;
    } catch {
      // Fallback to dense-only if sparse not configured
      results = await qd.search('knowledge_base', {
        vector: queryEmbedding,
        limit,
        score_threshold: 0.6,
      });
    }

    const matches = results.map(r => ({
      id: r.id,
      score: r.score,
      document: r.payload?.document_name,
      chunk: r.payload?.chunk_index,
      content: r.payload?.content,
      source: r.payload?.source
    }));

    return json({
      success: true,
      query: matches,
      count: matches.length,
      avg_similarity: matches.length > 0
        ? (matches.reduce((sum, m) => sum + m.score, 0) / matches.length).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error('Search error:', err);
    return json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
};

const knowledgeQuerySchema = z.object({
  prompt: z.string().min(1, 'Prompt required').max(10000),
  max_context_chunks: z.number().int().min(1).max(50).optional().default(5),
  use_gemini: z.boolean().optional().default(false)
});

/**
 * PATCH /api/knowledge - Generate response using RAG + LLM
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = knowledgeQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { prompt, max_context_chunks, use_gemini } = parsed.data;

    await ensureQdrantCollection();

    // 1. Hybrid search knowledge base for context (dense + BM42)
    const queryEmbedding = await generateEmbedding(prompt);
    const promptSparse = generateSparseVector(prompt);
    let searchResults: QdrantScoredPoint[];
    try {
      const searchRes = await qd.query('knowledge_base', {
        prefetch: [
          { query: queryEmbedding, using: '', limit: max_context_chunks * 2 },
          { query: promptSparse, using: 'bm25', limit: max_context_chunks * 2 },
        ],
        query: { fusion: 'rrf' },
        limit: max_context_chunks,
        score_threshold: 0.4,
      });
      searchResults = searchRes.points;
    } catch {
      searchResults = await qd.search('knowledge_base', {
        vector: queryEmbedding,
        limit: max_context_chunks,
        score_threshold: 0.6,
      });
    }

    const contextText = searchResults
      .map(r => `[${r.payload?.document_name}] ${r.payload?.content}`)
      .join('\n\n');

    const avgScore = searchResults.length > 0
      ? searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length
      : 0;

    // 2. Build augmented prompt
    const augmentedPrompt = `KNOWLEDGE BASE CONTEXT:
${contextText || 'No matching documents found in knowledge base.'}

---

USER QUESTION:
${prompt}

---

Provide a clear, detailed answer based on the knowledge base. If the knowledge base doesn't contain relevant information, say so explicitly.`;

    // 3. Route to LLM (Gemini for complex, Gemma for simple)
    let response = '';
    let llmUsed = '';

    if (use_gemini && GEMINI_API_KEY) {
      llmUsed = 'gemini-2.0-flash-exp';
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: augmentedPrompt }] }]
          }),
          signal: AbortSignal.timeout(30_000)
        }
      );

      const geminiData = await geminiRes.json();
      response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else {
      llmUsed = 'gemma3-legal:latest';
      const ollamaRes = await ollamaFetch(`${OLLAMA_URL_VAR}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LOCAL_LLM,
          prompt: augmentedPrompt,
          stream: false
        })
      });

      const ollamaData = await ollamaRes.json();
      response = ollamaData?.response ?? '';
    }

    return json({
      success: true,
      response,
      llm_used: llmUsed,
      rag_context: {
        matches: searchResults.length,
        avg_similarity: avgScore.toFixed(2),
        documents: searchResults.map(r => r.payload?.document_name)
      }
    });
  } catch (err) {
    console.error('Generation error:', err);
    return json(
      { error: 'Generation failed' },
      { status: 500 }
    );
  }
};