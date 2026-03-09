import { ChatOllama } from "@langchain/ollama";
import { OllamaEmbeddings } from "@langchain/ollama";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RetrievalQAChain } from "langchain/chains";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { Redis } from "ioredis";
import {
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  EMBEDDING_MODEL,
  QDRANT_URL,
  REDIS_URL,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  MAX_CONTEXT_CHUNKS,
  SIMILARITY_THRESHOLD,
} from "$env/static/private";

/**
 * Phase 4: Advanced LangChain RAG Service for Legal AI
 * Orchestrates LLM interactions, vector search, and document processing
 */

class LangChainRAGService {
  constructor() {
    this.initialized = false;
    this.llm = null;
    this.embeddings = null;
    this.vectorStore = null;
    this.qdrantClient = null;
    this.redis = null;
    this.textSplitter = null;
    this.retrievalChain = null;
  }

  /**
   * Initialize all LangChain components and connections
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log("🚀 Initializing LangChain RAG Service...");

      // Initialize Redis for caching
      this.redis = new Redis(REDIS_URL || "redis://localhost:6379");
      console.log("✅ Redis connection established");

      // Initialize Ollama LLM
      this.llm = new ChatOllama({
        baseUrl: OLLAMA_BASE_URL || "http://localhost:11435",
        model: OLLAMA_MODEL || "legal-assistant",
        temperature: 0.15,
        topK: 25,
        topP: 0.7,
        repeatPenalty: 1.2,
        numCtx: 16384,
        numPredict: 2048,
      });
      console.log("✅ Ollama LLM initialized");

      // Initialize embeddings
      this.embeddings = new OllamaEmbeddings({
        baseUrl: OLLAMA_BASE_URL || "http://localhost:11435",
        model: EMBEDDING_MODEL || "nomic-embed-text",
      });
      console.log("✅ Ollama embeddings initialized");

      // Initialize Qdrant client and vector store
      this.qdrantClient = new QdrantClient({
        url: QDRANT_URL || "http://localhost:6333",
      });

      this.vectorStore = new QdrantVectorStore(this.embeddings, {
        client: this.qdrantClient,
        collectionName: "legal_documents",
      });
      console.log("✅ Qdrant vector store initialized");

      // Initialize text splitter for document chunking
      this.textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: parseInt(CHUNK_SIZE) || 800,
        chunkOverlap: parseInt(CHUNK_OVERLAP) || 200,
        separators: ["\n\n", "\n", ". ", " ", ""],
      });
      console.log("✅ Text splitter initialized");

      // Create legal-specific prompt template
      const legalPromptTemplate = PromptTemplate.fromTemplate(`
You are an advanced legal AI assistant specialized in prosecutor support and evidence analysis.

Use the following context to answer the question accurately and comprehensively:

CONTEXT:
{context}

QUESTION: {question}

INSTRUCTIONS:
- Base your response on the provided context
- Cite specific sources when referencing information
- Use proper legal citation format (Bluebook style)
- Provide actionable legal insights and recommendations
- Flag any ethical considerations or potential conflicts
- If the context is insufficient, clearly state this limitation
- Structure your response with clear headings and analysis

RESPONSE:
`);

      // Initialize retrieval QA chain
      this.retrievalChain = RetrievalQAChain.fromLLM(
        this.llm,
        this.vectorStore.asRetriever({
          k: parseInt(MAX_CONTEXT_CHUNKS) || 8,
          searchType: "similarity",
          searchKwargs: {
            scoreThreshold: parseFloat(SIMILARITY_THRESHOLD) || 0.75,
          },
        }),
        {
          prompt: legalPromptTemplate,
          returnSourceDocuments: true,
        }
      );
      console.log("✅ Retrieval QA chain initialized");

      this.initialized = true;
      console.log("🎉 LangChain RAG Service fully initialized");
    } catch (error) {
      console.error("❌ Failed to initialize LangChain RAG Service:", error);
      throw error;
    }
  }

  /**
   * Process and answer a legal query using RAG
   */
  async processQuery(query, options = {}) {
    await this.initialize();

    const {
      caseId = null,
      sessionId = null,
      enableCache = true,
      maxTokens = 2048,
      temperature = 0.15,
    } = options;

    // Check cache first
    const cacheKey = `query:${Buffer.from(query).toString("base64")}:${
      caseId || "global"
    }`;

    if (enableCache) {
      const cachedResult = await this.redis.get(cacheKey);
      if (cachedResult) {
        console.log("📋 Returning cached result");
        return JSON.parse(cachedResult);
      }
    }

    try {
      console.log("🔍 Processing legal query with RAG...");

      const startTime = Date.now();

      // Execute retrieval QA chain
      const result = await this.retrievalChain.call({
        query: query,
      });

      const processingTime = Date.now() - startTime;

      // Format response
      const formattedResponse = {
        query,
        answer: result.text,
        sources: result.sourceDocuments.map((doc, index) => ({
          id: doc.metadata?.id || `source_${index}`,
          content: doc.pageContent.substring(0, 300) + "...",
          metadata: doc.metadata,
          score: doc.metadata?.score || 0,
        })),
        processingTime,
        caseId,
        sessionId,
        timestamp: new Date().toISOString(),
      };

      // Cache the result
      if (enableCache) {
        await this.redis.setex(
          cacheKey,
          3600,
          JSON.stringify(formattedResponse)
        );
      }

      console.log(`✅ Query processed in ${processingTime}ms`);
      return formattedResponse;
    } catch (error) {
      console.error("❌ Error processing query:", error);
      throw error;
    }
  }

  /**
   * Add documents to the vector store for RAG retrieval
   */
  async addDocuments(documents, metadata = {}) {
    await this.initialize();

    try {
      console.log(
        `📄 Processing ${documents.length} documents for vector storage...`
      );

      const processedDocs = [];

      for (const doc of documents) {
        const { content, title, type, caseId, ...otherMetadata } = doc;

        // Split document into chunks
        const chunks = await this.textSplitter.splitText(content);

        // Create Document objects with metadata
        const docChunks = chunks.map(
          (chunk, index) =>
            new Document({
              pageContent: chunk,
              metadata: {
                title: title || "Untitled Document",
                type: type || "unknown",
                caseId: caseId || null,
                chunkIndex: index,
                totalChunks: chunks.length,
                addedAt: new Date().toISOString(),
                ...otherMetadata,
                ...metadata,
              },
            })
        );

        processedDocs.push(...docChunks);
      }

      // Add to vector store
      await this.vectorStore.addDocuments(processedDocs);

      console.log(
        `✅ Added ${processedDocs.length} document chunks to vector store`
      );
      return {
        documentsProcessed: documents.length,
        chunksCreated: processedDocs.length,
        status: "success",
      };
    } catch (error) {
      console.error("❌ Error adding documents:", error);
      throw error;
    }
  }

  /**
   * Search similar documents without LLM generation
   */
  async searchSimilar(query, options = {}) {
    await this.initialize();

    const { k = 5, scoreThreshold = 0.7, filter = {} } = options;

    try {
      const results = await this.vectorStore.similaritySearchWithScore(
        query,
        k,
        filter
      );

      return results.map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score,
      }));
    } catch (error) {
      console.error("❌ Error searching similar documents:", error);
      throw error;
    }
  }

  /**
   * Get streaming response for real-time chat
   */
  async *streamQuery(query, options = {}) {
    await this.initialize();

    try {
      // First, get relevant context
      yield { type: "status", message: "Retrieving relevant context..." };

      const similarDocs = await this.searchSimilar(query, {
        k: parseInt(MAX_CONTEXT_CHUNKS) || 8,
        scoreThreshold: parseFloat(SIMILARITY_THRESHOLD) || 0.75,
      });

      yield {
        type: "context",
        sources: similarDocs.map((doc) => ({
          title: doc.metadata.title,
          type: doc.metadata.type,
          score: doc.score,
          preview: doc.content.substring(0, 200) + "...",
        })),
      };

      // Build context string
      const context = similarDocs
        .map((doc) => `Source: ${doc.metadata.title}\n${doc.content}`)
        .join("\n\n---\n\n");

      // Generate streaming response
      yield { type: "status", message: "Generating response..." };

      const prompt = `Based on the following legal documents and context, please answer the question:

CONTEXT:
${context}

QUESTION: ${query}

Please provide a comprehensive legal analysis with proper citations and recommendations.`;

      // Note: This is a simplified streaming approach
      // In production, you'd want to use LangChain's streaming capabilities
      const response = await this.llm.invoke(prompt);

      // Simulate streaming by yielding chunks
      const words = response.content.split(" ");
      for (let i = 0; i < words.length; i += 5) {
        const chunk = words.slice(i, i + 5).join(" ") + " ";
        yield { type: "token", content: chunk };
      }

      yield {
        type: "complete",
        sources: similarDocs,
        totalTokens: words.length,
      };
    } catch (error) {
      yield { type: "error", error: error.message };
    }
  }

  /**
   * Health check for all components
   */
  async healthCheck() {
    const health = {
      status: "healthy",
      components: {},
      timestamp: new Date().toISOString(),
    };

    try {
      // Check Redis
      await this.redis.ping();
      health.components.redis = { status: "healthy", url: REDIS_URL };
    } catch (error) {
      health.components.redis = { status: "error", error: error.message };
      health.status = "degraded";
    }

    try {
      // Check Qdrant
      const qdrantHealth = await this.qdrantClient.getCollections();
      health.components.qdrant = {
        status: "healthy",
        url: QDRANT_URL,
        collections: qdrantHealth.collections?.length || 0,
      };
    } catch (error) {
      health.components.qdrant = { status: "error", error: error.message };
      health.status = "degraded";
    }

    try {
      // Check Ollama LLM
      const testResponse = await this.llm.invoke("Test connection");
      health.components.llm = {
        status: "healthy",
        model: OLLAMA_MODEL,
        baseUrl: OLLAMA_BASE_URL,
      };
    } catch (error) {
      health.components.llm = { status: "error", error: error.message };
      health.status = "degraded";
    }

    try {
      // Check embeddings
      const testEmbedding = await this.embeddings.embedQuery("test");
      health.components.embeddings = {
        status: "healthy",
        model: EMBEDDING_MODEL,
        dimensions: testEmbedding.length,
      };
    } catch (error) {
      health.components.embeddings = { status: "error", error: error.message };
      health.status = "degraded";
    }

    return health;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redis) {
      await this.redis.quit();
    }
    console.log("🧹 LangChain RAG Service cleaned up");
  }
}

// Export singleton instance
export const langchainRAGService = new LangChainRAGService();
export default langchainRAGService;
