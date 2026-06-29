/**
 * Embedding Configuration
 *
 * Live-verified June 28, 2026 via scripts/atlas/audit-live-embedding-output.mjs
 * All embedding dimensions are 768-dim (no truncation pipeline exists)
 */

export const EMBEDDING_CONFIG = {
  /** Ollama embedding model — produces 768-dimensional vectors */
  model: 'embeddinggemma:latest',

  /** Canonical embedding dimension — verified by live audit */
  dimension: 768,

  /** Postgres pgvector column type — must match dimension */
  postgresType: 'vector(768)',

  /** Qdrant collection vector size — must match dimension */
  qdrantVectorSize: 768,

  /** Qdrant collection name for code embeddings */
  qdrantCollection: 'codebase_chunks_768',

  /** Autoencoder output dimension (768 → 64 latent compression) */
  autoencoderOutputDim: 64,

  /** SOM grid dimensions (20×20 = 400 cells) */
  somGridSize: 20,

  /** Validation: throw error if actual dimension doesn't match */
  validate(actualDim: number): void {
    if (actualDim !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}-dim, got ${actualDim}-dim. ` +
        `Run audit: node scripts/atlas/audit-live-embedding-output.mjs`
      );
    }
  },
} as const;

/**
 * Use this constant in all scripts instead of hard-coding 768 or 384
 *
 * Example:
 *   if (embedding.length !== EMBEDDING_CONFIG.dimension) {
 *     throw new Error('Invalid embedding dimension');
 *   }
 */
export const EMBEDDING_DIMENSION = EMBEDDING_CONFIG.dimension as const; // = 768