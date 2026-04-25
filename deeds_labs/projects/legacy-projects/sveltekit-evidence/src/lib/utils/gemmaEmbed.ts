const PRIMARY_EMBEDDING_MODEL =
  (typeof window !== "undefined" &&
    (window as any).__ENV?.PRIMARY_EMBEDDING_MODEL) ||
  "embeddinggemma:latest";

/**
 * Gemma Embedding Utilities
 * Text and image embedding helpers using Gemma model
 */
/**
 * Gemma Embedding Utilities
 * Text and image embedding helpers using Gemma model
 */

export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
  dimensions?: number;
}

export interface BatchEmbeddingResult {
  success: boolean;
  embeddings?: number[][];
  errors?: string[];
  dimensions?: number;
}

/**
 * Generate text embedding using Gemma model
 */
export async function embedText(
  text: string,
  model: string = PRIMARY_EMBEDDING_MODEL
): Promise<EmbeddingResult> {
  try {
    if (!text.trim()) {
      return { success: false, error: "Empty text provided" };
    }

    // TODO: Integrate with your existing Gemma embedding service
    // This would connect to your embedding API endpoint
    const response = await fetch("/api/embeddings/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      embedding: data.embedding,
      dimensions: data.embedding?.length || 0,
    };
  } catch (error) {
    console.error("Text embedding error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate image embedding using Gemma vision model
 */
export async function embedImage(
  imageUrl: string,
  model: string = PRIMARY_EMBEDDING_MODEL
): Promise<EmbeddingResult> {
  try {
    if (!imageUrl) {
      return { success: false, error: "No image URL provided" };
    }

    // TODO: Integrate with your existing image embedding service
    const response = await fetch("/api/embeddings/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      throw new Error(`Image embedding API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      embedding: data.embedding,
      dimensions: data.embedding?.length || 0,
    };
  } catch (error) {
    console.error("Image embedding error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embedTextBatch(
  texts: string[],
  model: string = PRIMARY_EMBEDDING_MODEL
): Promise<BatchEmbeddingResult> {
  try {
    if (!texts.length) {
      return { success: false, errors: ["No texts provided"] };
    }

    const response = await fetch("/api/embeddings/text/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });

    if (!response.ok) {
      throw new Error(`Batch embedding API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      embeddings: data.embeddings,
      dimensions: data.embeddings?.[0]?.length || 0,
    };
  } catch (error) {
    console.error("Batch text embedding error:", error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embeddings must have the same dimensions");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Find most similar embeddings using cosine similarity
 */
export function findSimilarEmbeddings(
  queryEmbedding: number[],
  candidateEmbeddings: { id: string; embedding: number[]; metadata?: any }[],
  limit = 5,
  threshold = 0.5
): Array<{ id: string; similarity: number; metadata?: any }> {
  const similarities = candidateEmbeddings
    .map((candidate) => ({
      id: candidate.id,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
      metadata: candidate.metadata,
    }))
    .filter((result) => result.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return similarities;
}

/**
 * Normalize embedding vector
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map((val) => val / magnitude);
}

/**
 * Generate embedding for file content based on type
 */
export async function embedFileContent(
  content: string,
  fileType: string
): Promise<EmbeddingResult> {
  try {
    let textToEmbed = content;

    // Pre-process content based on file type
    switch (fileType) {
      case "image":
        // For images, use image embedding
        return await embedImage(content); // content would be image URL

      case "document":
      case "text":
        // Use text content directly
        break;

      case "audio":
        // content would be transcript from speech-to-text
        textToEmbed = `Audio transcript: ${content}`;
        break;

      case "video":
        // content would be combined transcript and visual description
        textToEmbed = `Video content: ${content}`;
        break;

      default:
        textToEmbed = `File content: ${content}`;
    }

    return await embedText(textToEmbed);
  } catch (error) {
    console.error("File content embedding error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Create context for RAG queries
 */
export async function createRAGContext(
  queryEmbedding: number[],
  availableDocuments: Array<{
    id: string;
    content: string;
    embedding: number[];
    type: string;
    metadata?: any;
  }>,
  maxContextLength = 4000,
  similarityThreshold = 0.6
): Promise<{
  context: string;
  sources: Array<{ id: string; type: string; similarity: number }>;
}> {
  // Find most relevant documents
  const relevantDocs = findSimilarEmbeddings(
    queryEmbedding,
    availableDocuments.map((doc) => ({
      id: doc.id,
      embedding: doc.embedding,
      metadata: { content: doc.content, type: doc.type, ...doc.metadata },
    })),
    10, // Get top 10 most relevant
    similarityThreshold
  );

  // Build context string within token limit
  let context = "";
  const sources: Array<{ id: string; type: string; similarity: number }> = [];

  for (const doc of relevantDocs) {
    const docContent = doc.metadata.content;
    const docType = doc.metadata.type;

    // Add document with metadata
    const docSection = `\n\n[${docType.toUpperCase()}] ${docContent}`;

    if ((context + docSection).length <= maxContextLength) {
      context += docSection;
      sources.push({
        id: doc.id,
        type: docType,
        similarity: doc.similarity,
      });
    } else {
      break;
    }
  }

  return { context: context.trim(), sources };
}
