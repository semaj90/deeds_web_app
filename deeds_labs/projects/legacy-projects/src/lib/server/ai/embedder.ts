import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

type EmbeddingsClient = {
  embedDocuments: (docs: string[]) => Promise<number[][]> | Promise<number[]>;
};

async function getEmbeddingsClient(): Promise<EmbeddingsClient> {
  // Prefer OpenAI when API key is present
  if (process.env.OPENAI_API_KEY) {
    try {
      const { OpenAIEmbeddings } = await import('langchain/embeddings/openai');
      return new OpenAIEmbeddings({
        modelName: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY,
      }) as EmbeddingsClient;
    } catch (e: any) {
      console.warn(
        'OpenAIEmbeddings import failed — falling back to local if available:',
        e?.message || e
      );
    }
  }

  // Try Ollama/local embedding via dynamic import
  try {
    const mod = await import('langchain/embeddings/ollama');
    const { OllamaEmbeddings } = mod;
    return new OllamaEmbeddings({
      model: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
      baseUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    }) as EmbeddingsClient;
  } catch (e: any) {
    console.warn('OllamaEmbeddings not available or failed to load:', e?.message || e);
  }

  throw new Error(
    'No embedding provider available. Set OPENAI_API_KEY or run a local Ollama-compatible embedding service.'
  );
}

export async function embeddingFunction(text: string) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { embedding: [] as number[], keywords: [] as string[] };
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1024, chunkOverlap: 128 });
  const chunks = await splitter.splitText(text);
  const embeddingsClient = await getEmbeddingsClient();

  // Some clients return a single embedding for an array, others return array per chunk.
  const vectors = await embeddingsClient.embedDocuments(chunks as string[]);

  // Normalize: if vectors is a flat vector, wrap it
  let firstEmbedding: number[] = [];
  if (!Array.isArray(vectors)) {
    // unexpected shape
    throw new Error('Embedding client returned invalid shape');
  }
  if (Array.isArray(vectors[0])) {
    firstEmbedding = vectors[0] as number[];
  } else if (typeof vectors[0] === 'number') {
    // vectors is a flat numeric array
    firstEmbedding = vectors as number[];
  } else {
    throw new Error('Unexpected embeddings format from provider');
  }

  const keywords = extractKeywords(text);

  return { embedding: firstEmbedding, keywords };
}

function extractKeywords(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z]{3,}\b/g) || [];
  return Array.from(new Set(matches)).slice(0, 10);
}
