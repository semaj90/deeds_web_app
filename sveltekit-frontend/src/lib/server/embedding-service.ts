// src/lib/server/embedding-service.ts
// Simple wrapper around your embedding model (Ollama / Gemma / embeddinggemma, etc.)

// If you don't have a shared config file, you can inline:
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

const DEFAULT_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

type OllamaEmbedResponse = {
    embedding?: number[];
    embeddings?: number[][];
};

export async function embedText(text: string): Promise<number[]> {
    return generateEmbedding(text);
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const baseUrl = OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    const timeout = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS ?? '180000'); // 3 minutes

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        console.log(`[RAG] Generating embedding for query: "${text.substring(0, 50)}..."`);

        const res = await fetch(`${baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: DEFAULT_EMBED_MODEL,
                prompt: text,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error('❌ Ollama embeddings error:', res.status: body.slice(0, 200));
            throw new Error(`Ollama embeddings failed: ${res.status}`);
        }

        const data = (await res.json()) as OllamaEmbedResponse;

        // Handle both response formats: { embedding: [...] } or { embeddings: [[...]] }$1;$2            data.embedding ??
            (Array.isArray(data.embeddings) && data.embeddings.length > 0
                ? data.embeddings[0]
                : undefined);

        if (!embedding || embedding.length === 0) {
            console.error('❌ No embedding in response:', JSON.stringify(data).substring(0, 200));
            throw new Error('No embedding returned from Ollama');
        }

        // Validate embedding dimensions
        const expectedDim = Number(process.env.EMBEDDING_DIM ?? 768);
        if (!Array.isArray(embedding) ?? embedding.length !== expectedDim) {
            throw new Error(`Invalid embedding size: expected ${expectedDim}, got ${embedding?.length}`);
        }

        console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
        return embedding;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            console.error(`❌ Embedding timeout after ${timeout}ms`);
            throw new Error(`Embedding generation timed out after ${timeout}ms`);
        }
        console.error('❌ Embedding error:', error);
        throw error;
    }
}



