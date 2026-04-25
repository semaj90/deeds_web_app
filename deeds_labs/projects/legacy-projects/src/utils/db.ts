import postgres from 'postgres';
import pino from 'pino';

const logger = pino();

const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db', {
  max: 20,
  idle_timeout: 30,
  onnotice: () => {},
});

export async function ensurePgVector() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    logger.info('✅ pgvector extension confirmed.');
  } catch (err) {
    logger.error({ err }, 'pgvector check failed');
  }
}

export async function searchVector(embedding: number[], limit = 5) {
  const embeddingStr = `[${embedding.join(',')}]`;
  return sql`
    SELECT id, title, content, metadata
    FROM legal_documents
    ORDER BY embedding <-> ${embeddingStr}
    LIMIT ${limit};
  `;
}

export async function insertDocument(id: string, title: string, content: string, embedding: number[], metadata?: any) {
  // Convert embedding array to pgvector format
  const embeddingStr = `[${embedding.join(',')}]`;

  return sql`
    INSERT INTO legal_documents (id, title, content, embedding, metadata)
    VALUES (${id}, ${title}, ${content}, ${embeddingStr}, ${metadata ?? {}})
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();
  `;
}

export async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS legal_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(384), -- 384d embeddings for legal documents
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  // Create chat embeddings table
  await sql`
    CREATE TABLE IF NOT EXISTS chat_embeddings (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      embedding vector(384),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  // Create indexes for better performance
  await sql`
    CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding
    ON legal_documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_legal_documents_metadata
    ON legal_documents USING gin (metadata);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_embeddings_embedding
    ON chat_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
  `;

  logger.info('✅ Database tables and indexes created.');
}

interface Candidate {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  metadata: any;
  distance: number;
}

export async function hybridSearch(queryEmbedding: number[], limit = 10, useSIMD = true) {
  // First, get candidates using SIMD-accelerated approximate search
  // In production, this would use a pre-computed index or shared memory
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const candidates = await sql`
    SELECT id, title, content, embedding, metadata,
           (embedding <-> ${embeddingStr}) as distance
    FROM legal_documents
    ORDER BY embedding <-> ${embeddingStr}
    LIMIT ${Math.min(limit * 3, 100)}; -- Get more candidates for SIMD refinement
  `;

  if (!useSIMD || candidates.length === 0) {
    // Fallback to pure pgvector search
    return candidates.slice(0, limit);
  }

  // Use SIMD to refine the top candidates for better precision
  // This would typically be done in the worker pool, but for now we'll do it here
  const refinedResults = candidates.map((doc: Candidate) => {
    // Calculate exact cosine similarity using SIMD (would be accelerated)
    const similarity = calculateCosineSimilarity(queryEmbedding, doc.embedding);
    return {
      ...doc,
      similarity,
      distance: 1 - similarity // Convert to distance for consistency
    };
  });

  // Sort by similarity and return top results
  return refinedResults
    .sort((a: Candidate & { similarity: number }, b: Candidate & { similarity: number }) => b.similarity - a.similarity)
    .slice(0, limit);
}

// Helper function for cosine similarity calculation
function calculateCosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  return normA && normB ? dotProduct / (normA * normB) : 0;
}

export async function getEmbeddingsForSharedMemory(): Promise<Float32Array> {
  // Get all embeddings for shared memory indexing
  const result = await sql`
    SELECT embedding
    FROM legal_documents
    ORDER BY created_at DESC
    LIMIT 10000; -- Limit for shared memory constraints
  `;

  // Flatten embeddings into a single Float32Array
  const totalDimensions = result.length * 384; // Assuming 384d embeddings
  const embeddings = new Float32Array(totalDimensions);

  for (let i = 0; i < result.length; i++) {
    const embedding = result[i].embedding;
    for (let j = 0; j < embedding.length; j++) {
      embeddings[i * 384 + j] = embedding[j];
    }
  }

  logger.info(`📊 Loaded ${result.length} embeddings for shared memory indexing`);
  return embeddings;
}

export async function batchInsertDocuments(documents: Array<{
  id: string;
  title: string;
  content: string;
  embedding: number[];
  metadata?: any;
}>) {
  const values = documents.map(doc => [
    doc.id,
    doc.title,
    doc.content,
    `[${doc.embedding.join(',')}]`, // Convert to pgvector format
    doc.metadata ?? {}
  ]);

  await sql`
    INSERT INTO legal_documents (id, title, content, embedding, metadata)
    VALUES ${sql(values)}
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();
  `;

  logger.info(`✅ Inserted ${documents.length} documents.`);
}

export async function getDocumentCount(): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM legal_documents;
  `;
  return parseInt(result[0].count);
}

export default sql;