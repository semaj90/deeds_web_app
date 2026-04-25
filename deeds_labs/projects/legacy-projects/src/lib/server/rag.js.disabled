import { db } from "./db/index.js";
import {
  documentChunks,
  knowledgeBase,
  cases,
  documents,
} from "./db/schema.js";
import { embeddingService } from "./embedding.js";
import { sql } from "drizzle-orm";
import { and, desc, eq, gte } from "drizzle-orm";

/**
 * RAG (Retrieval-Augmented Generation) service for legal AI
 * Handles context retrieval, similarity search, and prompt enhancement
 */

class RAGService {
  constructor() {
    this.maxContextChunks = 5;
    this.similarityThreshold = 0.7;
    this.maxContextLength = 4000; // tokens
  }

  /**
   * Retrieve relevant context for a query using vector similarity search
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Retrieved context and metadata
   */
  async retrieveContext(query, options = {}) {
    try {
      const {
        caseId = null,
        maxChunks = this.maxContextChunks,
        similarityThreshold = this.similarityThreshold,
        includeKnowledgeBase = true,
        includeDocuments = true,
      } = options;

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      let relevantContext = [];

      // Search document chunks if enabled
      if (includeDocuments) {
        const documentContext = await this.searchDocumentChunks(
          queryEmbedding,
          { caseId, maxChunks: Math.ceil(maxChunks * 0.6), similarityThreshold }
        );
        relevantContext = relevantContext.concat(documentContext);
      }

      // Search knowledge base if enabled
      if (includeKnowledgeBase) {
        const knowledgeContext = await this.searchKnowledgeBase(
          queryEmbedding,
          { maxChunks: Math.ceil(maxChunks * 0.4), similarityThreshold }
        );
        relevantContext = relevantContext.concat(knowledgeContext);
      }

      // Sort by similarity and limit results
      relevantContext.sort((a, b) => b.similarity - a.similarity);
      relevantContext = relevantContext.slice(0, maxChunks);

      // Build context string
      const contextText = this.buildContextString(relevantContext);

      return {
        context: contextText,
        sources: relevantContext.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          similarity: item.similarity,
          preview: item.content.substring(0, 200) + "...",
        })),
        totalSources: relevantContext.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error retrieving context:", error);
      throw error;
    }
  }

  /**
   * Search document chunks using vector similarity
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Relevant document chunks
   */
  async searchDocumentChunks(queryEmbedding, options = {}) {
    try {
      const { caseId, maxChunks = 3, similarityThreshold = 0.7 } = options;

      // Build the similarity search query
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      let query = db
        .select({
          id: documentChunks.id,
          content: documentChunks.content,
          chunkIndex: documentChunks.chunkIndex,
          documentId: documentChunks.documentId,
          filename: documents.filename,
          originalName: documents.originalName,
          caseId: documents.caseId,
          similarity:
            sql`1 - (${documentChunks.embedding} <=> ${embeddingStr}::vector)`.as(
              "similarity"
            ),
        })
        .from(documentChunks)
        .leftJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(
          and(
            sql`1 - (${documentChunks.embedding} <=> ${embeddingStr}::vector) >= ${similarityThreshold}`,
            caseId ? eq(documents.caseId, caseId) : sql`1=1`
          )
        )
        .orderBy(
          desc(
            sql`1 - (${documentChunks.embedding} <=> ${embeddingStr}::vector)`
          )
        )
        .limit(maxChunks);

      const results = await query;

      return results.map((row) => ({
        id: row.id,
        type: "document",
        title: row.originalName || row.filename,
        content: row.content,
        similarity: row.similarity,
        metadata: {
          documentId: row.documentId,
          chunkIndex: row.chunkIndex,
          caseId: row.caseId,
        },
      }));
    } catch (error) {
      console.error("Error searching document chunks:", error);
      return [];
    }
  }

  /**
   * Search knowledge base using vector similarity
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Relevant knowledge base entries
   */
  async searchKnowledgeBase(queryEmbedding, options = {}) {
    try {
      const { maxChunks = 2, similarityThreshold = 0.7 } = options;

      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      const results = await db
        .select({
          id: knowledgeBase.id,
          title: knowledgeBase.title,
          content: knowledgeBase.content,
          type: knowledgeBase.type,
          citation: knowledgeBase.citation,
          jurisdiction: knowledgeBase.jurisdiction,
          similarity:
            sql`1 - (${knowledgeBase.embedding} <=> ${embeddingStr}::vector)`.as(
              "similarity"
            ),
        })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.isActive, true),
            sql`1 - (${knowledgeBase.embedding} <=> ${embeddingStr}::vector) >= ${similarityThreshold}`
          )
        )
        .orderBy(
          desc(
            sql`1 - (${knowledgeBase.embedding} <=> ${embeddingStr}::vector)`
          )
        )
        .limit(maxChunks);

      return results.map((row) => ({
        id: row.id,
        type: "knowledge",
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        metadata: {
          knowledgeType: row.type,
          citation: row.citation,
          jurisdiction: row.jurisdiction,
        },
      }));
    } catch (error) {
      console.error("Error searching knowledge base:", error);
      return [];
    }
  }

  /**
   * Build a formatted context string from retrieved chunks
   * @param {Array} contextChunks - Retrieved context chunks
   * @returns {string} - Formatted context string
   */
  buildContextString(contextChunks) {
    if (!contextChunks || contextChunks.length === 0) {
      return "";
    }

    let contextString = "**RELEVANT CONTEXT:**\n\n";

    contextChunks.forEach((chunk, index) => {
      const sourceType =
        chunk.type === "document" ? "Document" : "Legal Knowledge";
      const title = chunk.title || "Unknown Source";
      const similarity = (chunk.similarity * 100).toFixed(1);

      contextString += `**${sourceType} ${
        index + 1
      }** (Relevance: ${similarity}%)\n`;
      contextString += `*Source: ${title}*\n\n`;
      contextString += `${chunk.content}\n\n`;

      if (chunk.metadata?.citation) {
        contextString += `*Citation: ${chunk.metadata.citation}*\n\n`;
      }

      contextString += "---\n\n";
    });

    return contextString;
  }

  /**
   * Enhance a user prompt with retrieved context
   * @param {string} userPrompt - Original user prompt
   * @param {string} context - Retrieved context
   * @param {Object} options - Enhancement options
   * @returns {string} - Enhanced prompt
   */
  enhancePrompt(userPrompt, context, options = {}) {
    const { includeInstructions = true, caseId = null } = options;

    let enhancedPrompt = "";

    if (includeInstructions) {
      enhancedPrompt += `You are a specialized legal AI assistant for prosecutors. Use the provided context to answer the user's question accurately and comprehensively.

**INSTRUCTIONS:**
- Base your response primarily on the provided context
- Cite specific sources when referencing information
- If the context doesn't contain sufficient information, clearly state this
- Maintain professional legal writing standards
- Consider jurisdiction-specific requirements when applicable
- Flag any potential ethical or procedural considerations

`;
    }

    if (context && context.trim().length > 0) {
      enhancedPrompt += `${context}\n\n`;
    }

    enhancedPrompt += `**USER QUESTION:**\n${userPrompt}\n\n`;

    if (caseId) {
      enhancedPrompt += `*Note: This question relates to Case ID: ${caseId}*\n\n`;
    }

    enhancedPrompt += `**RESPONSE:**\n`;

    return enhancedPrompt;
  }

  /**
   * Process and store a document for RAG retrieval
   * @param {string} documentId - Document ID
   * @param {string} content - Document content
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Array>} - Created document chunks
   */
  async processDocument(documentId, content, metadata = {}) {
    try {
      // Chunk the document content
      const chunks = embeddingService.chunkText(content, {
        chunkSize: 800,
        chunkOverlap: 200,
      });

      const processedChunks = [];

      for (const chunk of chunks) {
        // Generate embedding for the chunk
        const embedding = await embeddingService.generateEmbedding(
          chunk.content
        );

        // Store the chunk in the database
        const [storedChunk] = await db
          .insert(documentChunks)
          .values({
            documentId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            embedding,
            tokens: chunk.tokens,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            metadata: {
              ...metadata,
              processedAt: new Date().toISOString(),
            },
          })
          .returning();

        processedChunks.push(storedChunk);
      }

      return processedChunks;
    } catch (error) {
      console.error("Error processing document for RAG:", error);
      throw error;
    }
  }

  /**
   * Add entry to knowledge base with embedding
   * @param {Object} entry - Knowledge base entry
   * @returns {Promise<Object>} - Created knowledge base entry
   */
  async addKnowledgeBaseEntry(entry) {
    try {
      const {
        title,
        content,
        type,
        jurisdiction,
        citation,
        keyTerms,
        createdBy,
      } = entry;

      // Generate embedding for the content
      const embedding = await embeddingService.generateEmbedding(content);

      const [createdEntry] = await db
        .insert(knowledgeBase)
        .values({
          title,
          content,
          type,
          jurisdiction,
          citation,
          keyTerms,
          embedding,
          createdBy,
        })
        .returning();

      return createdEntry;
    } catch (error) {
      console.error("Error adding knowledge base entry:", error);
      throw error;
    }
  }

  /**
   * Health check for RAG service
   * @returns {Promise<Object>} - Service health status
   */
  async healthCheck() {
    try {
      // Check embedding service
      const embeddingHealth = await embeddingService.healthCheck();

      // Check database connectivity
      const dbTest = await db
        .select({ count: sql`count(*)` })
        .from(documentChunks);

      // Check for available context
      const documentChunkCount = await db
        .select({ count: sql`count(*)` })
        .from(documentChunks);
      const knowledgeBaseCount = await db
        .select({ count: sql`count(*)` })
        .from(knowledgeBase);

      return {
        status: "healthy",
        embedding: embeddingHealth,
        database: "connected",
        documentChunks: documentChunkCount[0]?.count || 0,
        knowledgeBaseEntries: knowledgeBaseCount[0]?.count || 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
export const ragService = new RAGService();
export default ragService;
