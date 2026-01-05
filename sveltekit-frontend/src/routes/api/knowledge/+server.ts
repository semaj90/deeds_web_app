import { QdrantClient } from '@qdrant/js-client-rest';
import { json, type RequestHandler } from '@sveltejs/kit';
import { JSDOM } from 'jsdom';
import pdfParse from 'pdf-parse';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db');
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

const OLLAMA_URL_VAR = process.env.OLLAMA_URL || 'http://localhost:11434';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
    return dom.window.document.body.textContent || '';
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
    const response = await fetch(`${OLLAMA_URL_VAR}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text.substring(0, 8000)
      })
    });

    const data = await response.json();
    return data.embedding || [];
  } catch (err) {
    console.error('❌ Embedding failed:', err);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureQdrantCollection() {
  try {
    await (qdrant as any).getCollection('knowledge_base');
  } catch {
    await qdrant.createCollection('knowledge_base', {
      vectors: {
        size: 768,
        distance: 'Cosine'
      }
    });
  }
}

/**
 * POST /api/knowledge/upload - Upload documents for ingestion
 */
export const POST: RequestHandler = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const source = formData.get('source') as string || 'user-upload';

    if (!files || files.length === 0) {
      return json({ error: 'No files provided' }, { status: 400 });
    }

    await ensureQdrantCollection();

    const results = [];

    for (const file of files) {
      try {
        console.log(`📄 Processing: ${file.name}`);

        // Extract text
        const text = await extractDocumentText(file);
        const chunks = chunkText(text);

        console.log(`   📝 Extracted ${chunks.length} chunks`);

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

          // Store in Qdrant
          await (qdrant as any).upsert('knowledge_base', {
            points: [
              {
                id: pointId,
                vector: embedding,
                payload
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

        console.log(`   ✅ Stored ${pointIds.length} vectors in Qdrant`);
      } catch (err) {
        results.push({
          file: file.name,
          error: err instanceof Error ? err.message : 'Unknown error',
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
    console.error('❌ Upload error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
};

/**
 * GET /api/knowledge/search - Search knowledge base with RAG
 */
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '5');

  if (!query) {
    return json({ error: 'Query parameter required' }, { status: 400 });
  }

  try {
    await ensureQdrantCollection();

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search Qdrant
    const results = await (qdrant as any).search('knowledge_base', {
      vector: queryEmbedding,
      limit,
      score_threshold: 0.6
    });

    const matches = (results as any[]).map(r => ({
      id: r.id,
      score: r.score,
      document: r.payload?.document_name,
      chunk: r.payload?.chunk_index,
      content: r.payload?.content,
      source: r.payload?.source
    }));

    return json({
      success: true,
      query,
      matches,
      count: matches.length,
      avg_similarity: matches.length > 0
        ? (matches.reduce((sum, m) => sum + m.score, 0) / matches.length).toFixed(2)
        : 0
    });
  } catch (err) {
    console.error('❌ Search error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/knowledge/generate - Generate response using RAG + LLM
 */
export const PATCH: RequestHandler = async ({ request }) => {
  if (request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { prompt, max_context_chunks = 5, use_gemini = false } = body;

    if (!prompt) {
      return json({ error: 'Prompt required' }, { status: 400 });
    }

    await ensureQdrantCollection();

    // 1. Search knowledge base for context
    const queryEmbedding = await generateEmbedding(prompt);
    const searchResults = await (qdrant as any).search('knowledge_base', {
      vector: queryEmbedding,
      limit: max_context_chunks,
      score_threshold: 0.6
    });

    const context = (searchResults as any[])
      .map(r => `[${r.payload?.document_name}] ${r.payload?.content}`)
      .join('\n\n');

    const avgSimilarity = (searchResults as any[]).length > 0
      ? (searchResults as any[]).reduce((sum, r) => sum + r.score, 0) / (searchResults as any[]).length
      : 0;

    // 2. Build augmented prompt
    const augmentedPrompt = `You are an expert legal AI assistant. Use the following knowledge base context to answer the user's question.

KNOWLEDGE BASE CONTEXT:
${context || 'No matching documents found in knowledge base.'}

---

USER QUESTION:
${ prompt }

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
          })
        }
      );

      const geminiData = await geminiRes.json();
      response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      llmUsed = 'gemma3-legal:latest';
      const ollamaRes = await fetch(`${OLLAMA_URL_VAR}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LOCAL_LLM,
          prompt: augmentedPrompt,
          stream: false
        })
      });

      const ollamaData = await ollamaRes.json();
      response = ollamaData.response || '';
    }

    return json({
      success: true,
      response,
      llm_used: llmUsed,
      rag_context: {
        matches: (searchResults as any[]).length,
        avg_similarity: avgSimilarity.toFixed(2),
        documents: (searchResults as any[]).map(r => r.payload?.document_name)
      }
    });
  } catch (err) {
    console.error('❌ Generation error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
};
