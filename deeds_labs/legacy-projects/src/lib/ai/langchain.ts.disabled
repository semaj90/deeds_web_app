// LangChain integration for advanced RAG (Retrieval Augmented Generation)
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { Ollama } from '@langchain/community/llms/ollama';
import { 
  RecursiveCharacterTextSplitter,
  TokenTextSplitter 
} from 'langchain/text_splitter';
import { Document as LangChainDoc } from 'langchain/document';
import { 
  ConversationalRetrievalQAChain,
  RetrievalQAChain,
  loadQAStuffChain,
  loadQAMapReduceChain
} from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { BufferMemory, ConversationSummaryMemory } from 'langchain/memory';
import type { BaseRetriever } from '@langchain/core/retrievers';
import type { Document, SearchResult } from './types';
import { vectorDB } from './vector-db';
import { MODELS } from './ollama';

/**
 * Custom retriever that uses our pgvector database
 */
class PgVectorRetriever implements BaseRetriever {
  lc_namespace = ['custom', 'retrievers'];
  
  constructor(
    private embeddings: OllamaEmbeddings,
    private options: { k?: number; scoreThreshold?: number } = {}
  ) {}

  async _getRelevantDocuments(query: string): Promise<LangChainDoc[]> {
    // Generate embedding for the query
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    // Search in pgvector database
    const results = await vectorDB.searchByVector(queryEmbedding, {
      limit: this.options.k || 4,
      threshold: this.options.scoreThreshold || 0.5,
    });
    
    // Convert to LangChain documents
    return results.map(result => 
      new LangChainDoc({
        pageContent: result.document.content,
        metadata: {
          ...result.document.metadata,
          score: result.score,
          id: result.document.id,
        },
      })
    );
  }
}

/**
 * LangChain service for advanced RAG operations
 */
export class LangChainService {
  private llm: Ollama;
  private embeddings: OllamaEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;
  private tokenSplitter: TokenTextSplitter;

  constructor(
    baseUrl = 'http://localhost:11434',
    model = MODELS.LEGAL_DETAILED,
    embeddingModel = MODELS.EMBEDDINGS
  ) {
    // Initialize Ollama LLM
    this.llm = new Ollama({
      baseUrl,
      model,
      temperature: 0.2,
      numGpu: -1, // Use all GPU layers
      numCtx: 8192,
    });

    // Initialize embeddings
    this.embeddings = new OllamaEmbeddings({
      baseUrl,
      model: embeddingModel,
    });

    // Initialize text splitters
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    this.tokenSplitter = new TokenTextSplitter({
      chunkSize: 512,
      chunkOverlap: 50,
    });
  }

  /**
   * Process and store a document with embeddings
   */
  async ingestDocument(
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<Document[]> {
    // Split the document into chunks
    const docs = await this.textSplitter.createDocuments(
      [content],
      [metadata]
    );

    // Generate embeddings for each chunk
    const storedDocs: Document[] = [];
    
    for (const doc of docs) {
      const embedding = await this.embeddings.embedQuery(doc.pageContent);
      const storedDoc = await vectorDB.storeDocument(
        doc.pageContent,
        embedding,
        { ...doc.metadata, ...metadata }
      );
      storedDocs.push(storedDoc);
    }

    return storedDocs;
  }

  /**
   * Create a QA chain for question answering
   */
  createQAChain(options: {
    retriever?: BaseRetriever;
    type?: 'stuff' | 'map_reduce' | 'refine';
    verbose?: boolean;
  } = {}) {
    const retriever = options.retriever || new PgVectorRetriever(this.embeddings);
    
    const qaPrompt = PromptTemplate.fromTemplate(`
      You are an expert legal AI assistant. Use the following context to answer the question.
      If you don't know the answer based on the context, say so clearly.
      Always cite the relevant parts of the context in your answer.
      
      Context: {context}
      
      Question: {question}
      
      Legal Analysis:
    `);

    return RetrievalQAChain.fromLLM(
      this.llm,
      retriever,
      {
        returnSourceDocuments: true,
        verbose: options.verbose,
        prompt: qaPrompt,
      }
    );
  }

  /**
   * Create a conversational chain with memory
   */
  createConversationalChain(options: {
    retriever?: BaseRetriever;
    memory?: BufferMemory;
    verbose?: boolean;
  } = {}) {
    const retriever = options.retriever || new PgVectorRetriever(this.embeddings);
    
    const memory = options.memory || new BufferMemory({
      memoryKey: 'chat_history',
      returnMessages: true,
      outputKey: 'answer',
    });

    const systemPrompt = `You are an expert legal AI assistant specializing in comprehensive legal analysis.
    Use the provided context and conversation history to give accurate, detailed legal advice.
    Always maintain professional legal standards and cite relevant laws or precedents.
    If you're unsure about something, clearly state your limitations.`;

    return ConversationalRetrievalQAChain.fromLLM(
      this.llm,
      retriever,
      {
        returnSourceDocuments: true,
        memory,
        verbose: options.verbose,
        qaChainOptions: {
          type: 'stuff',
          prompt: PromptTemplate.fromTemplate(`
            ${systemPrompt}
            
            Context: {context}
            Chat History: {chat_history}
            Question: {question}
            
            Legal Response:
          `),
        },
      }
    );
  }

  /**
   * Summarize a legal document
   */
  async summarizeDocument(
    content: string,
    options: {
      type?: 'map_reduce' | 'stuff' | 'refine';
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const docs = await this.textSplitter.createDocuments([content]);
    
    const summaryPrompt = PromptTemplate.fromTemplate(`
      Summarize the following legal document section concisely while preserving all important legal details:
      
      {text}
      
      Summary:
    `);

    const chain = loadQAMapReduceChain(this.llm, {
      combinePrompt: PromptTemplate.fromTemplate(`
        Combine these summaries into a comprehensive legal document summary:
        
        {text}
        
        Final Summary:
      `),
      combineMapPrompt: summaryPrompt,
    });

    const result = await chain.call({
      input_documents: docs,
    });

    return result.text;
  }

  /**
   * Extract specific information from documents
   */
  async extractInfo(
    content: string,
    extractionTemplate: string
  ): Promise<any> {
    const prompt = PromptTemplate.fromTemplate(`
      Extract the following information from the legal document:
      
      ${extractionTemplate}
      
      Document:
      {document}
      
      Extracted Information (as JSON):
    `);

    const chain = prompt.pipe(this.llm);
    const result = await chain.invoke({ document: content });
    
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  /**
   * Generate legal documents from templates
   */
  async generateDocument(
    template: string,
    variables: Record<string, any>
  ): Promise<string> {
    const prompt = PromptTemplate.fromTemplate(template);
    const chain = prompt.pipe(this.llm);
    return chain.invoke(variables);
  }

  /**
   * Perform semantic search across documents
   */
  async semanticSearch(
    query: string,
    options: {
      k?: number;
      filter?: Record<string, any>;
      includeContent?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const embedding = await this.embeddings.embedQuery(query);
    
    return vectorDB.searchByVector(embedding, {
      limit: options.k || 10,
      filter: options.filter,
    });
  }

  /**
   * Analyze legal contract
   */
  async analyzeContract(content: string): Promise<{
    summary: string;
    keyTerms: string[];
    risks: string[];
    recommendations: string[];
  }> {
    const analysisPrompt = `
      Analyze this legal contract and provide:
      1. A comprehensive summary
      2. Key terms and conditions (as a list)
      3. Potential risks or concerns (as a list)
      4. Recommendations for improvement (as a list)
      
      Format the response as JSON with keys: summary, keyTerms, risks, recommendations
    `;

    const result = await this.extractInfo(content, analysisPrompt);
    return result;
  }

  /**
   * Compare two legal documents
   */
  async compareDocuments(
    doc1: string,
    doc2: string,
    focusAreas?: string[]
  ): Promise<{
    similarities: string[];
    differences: string[];
    recommendation: string;
  }> {
    const prompt = PromptTemplate.fromTemplate(`
      Compare these two legal documents${focusAreas ? ` focusing on: ${focusAreas.join(', ')}` : ''}:
      
      Document 1:
      {doc1}
      
      Document 2:
      {doc2}
      
      Provide a comparison with:
      1. Key similarities (as a list)
      2. Important differences (as a list)
      3. Overall recommendation
      
      Format as JSON with keys: similarities, differences, recommendation
    `);

    const chain = prompt.pipe(this.llm);
    const result = await chain.invoke({ doc1, doc2 });
    
    try {
      return JSON.parse(result);
    } catch {
      return {
        similarities: [],
        differences: [],
        recommendation: result,
      };
    }
  }
}

// Export singleton instance
export const langchain = new LangChainService();

// Export useful utilities
export { RecursiveCharacterTextSplitter, TokenTextSplitter };
